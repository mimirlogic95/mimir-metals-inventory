-- Move changes a stored pallet's rack, never its quantity, lifecycle, or FIFO age.
create function public.move_pallet(
  p_pallet_code text,
  p_expected_current_location_id uuid,
  p_destination_location_id uuid,
  p_idempotency_key text
)
returns table (
  pallet_id uuid,
  pallet_code text,
  part_number text,
  description text,
  previous_location_id uuid,
  previous_location_code text,
  destination_location_id uuid,
  destination_location_code text,
  current_boxes integer,
  current_pieces integer,
  boxes_per_full_pallet_snapshot integer,
  lifecycle_status public.pallet_lifecycle_status,
  transaction_id uuid,
  moved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_pallet_code text := pg_catalog.upper(pg_catalog.btrim(p_pallet_code));
  normalized_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  existing_transaction_id uuid;
  move_transaction_id uuid;
  selected_pallet record;
  source_location record;
  destination record;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION REQUIRED';
  end if;

  if not exists (
    select 1 from public.profiles as actor_profile
    where actor_profile.id = actor_id
      and actor_profile.active
      and actor_profile.role in ('worker', 'supervisor')
  ) then
    raise exception using errcode = '42501', message = 'ACTIVE WORKER PROFILE REQUIRED';
  end if;

  if normalized_idempotency_key is null
    or normalized_idempotency_key = ''
    or pg_catalog.length(normalized_idempotency_key) > 200
  then
    raise exception using errcode = '22023', message = 'INVALID IDEMPOTENCY KEY';
  end if;

  -- Resolve a committed retry before checking the pallet's now-changed rack.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_idempotency_key, 0)
  );

  select transaction.id into existing_transaction_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_idempotency_key;

  if existing_transaction_id is not null then
    if not exists (
      select 1
      from public.inventory_transactions as transaction
      join public.pallets as existing_pallet on existing_pallet.id = transaction.pallet_id
      where transaction.id = existing_transaction_id
        and transaction.transaction_type = 'moved'
        and transaction.actor_user_id = actor_id
        and existing_pallet.pallet_code = normalized_pallet_code
        and transaction.previous_location_id = p_expected_current_location_id
        and transaction.new_location_id = p_destination_location_id
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY KEY CONFLICT';
    end if;

    return query
    select existing_pallet.id, existing_pallet.pallet_code,
      part.part_number, part.description,
      source.id, source.location_code, target.id, target.location_code,
      transaction.new_boxes, transaction.new_pieces,
      existing_pallet.boxes_per_full_pallet_snapshot,
      'stored'::public.pallet_lifecycle_status,
      transaction.id, transaction.occurred_at
    from public.inventory_transactions as transaction
    join public.pallets as existing_pallet on existing_pallet.id = transaction.pallet_id
    join public.parts as part on part.id = existing_pallet.part_id
    join public.locations as source on source.id = transaction.previous_location_id
    join public.locations as target on target.id = transaction.new_location_id
    where transaction.id = existing_transaction_id;
    return;
  end if;

  select pallet.id, pallet.current_location_id, pallet.lifecycle_status,
    pallet.current_boxes, pallet.current_pieces
  into selected_pallet
  from public.pallets as pallet
  where pallet.pallet_code = normalized_pallet_code
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
  end if;

  if selected_pallet.lifecycle_status = 'on_hold' then
    raise exception using errcode = '22023', message = 'PALLET ON HOLD';
  elsif selected_pallet.lifecycle_status = 'shipped' then
    raise exception using errcode = '22023', message = 'PALLET SHIPPED';
  elsif selected_pallet.lifecycle_status <> 'stored' then
    raise exception using errcode = '22023', message = 'PALLET NOT STORED';
  end if;

  if selected_pallet.current_location_id is null then
    raise exception using errcode = '22023', message = 'PALLET NOT STORED';
  end if;

  if p_expected_current_location_id is null
    or selected_pallet.current_location_id <> p_expected_current_location_id
  then
    raise exception using errcode = '22023', message = 'LOCATION CHANGED';
  end if;

  if p_destination_location_id is null then
    raise exception using errcode = '22023', message = 'LOCATION NOT FOUND';
  end if;

  if selected_pallet.current_location_id = p_destination_location_id then
    raise exception using errcode = '22023', message = 'SAME LOCATION';
  end if;

  -- The rack-capacity trigger uses this same pallet-then-sorted-location order.
  perform 1 from public.locations as location
  where location.id in (selected_pallet.current_location_id, p_destination_location_id)
  order by location.id
  for update;

  select location.id, location.location_code, location.location_type
  into source_location
  from public.locations as location
  where location.id = selected_pallet.current_location_id;

  if not found or source_location.location_type <> 'rack' then
    raise exception using errcode = '22023', message = 'PALLET NOT STORED';
  end if;

  select location.id, location.location_code, location.location_type, location.active
  into destination
  from public.locations as location
  where location.id = p_destination_location_id;

  if not found then
    raise exception using errcode = '22023', message = 'LOCATION NOT FOUND';
  end if;

  if not destination.active then
    raise exception using errcode = '22023', message = 'LOCATION INACTIVE';
  end if;

  if destination.location_type <> 'rack' then
    raise exception using errcode = '22023', message = 'LOCATION NOT A RACK';
  end if;

  if exists (
    select 1 from public.pallets as occupying_pallet
    where occupying_pallet.current_location_id = destination.id
      and occupying_pallet.lifecycle_status <> 'shipped'
      and occupying_pallet.id <> selected_pallet.id
  ) then
    raise exception using errcode = '22023', message = 'LOCATION OCCUPIED';
  end if;

  update public.pallets as pallet
  set current_location_id = destination.id
  where pallet.id = selected_pallet.id;

  insert into public.inventory_transactions (
    pallet_id, transaction_type, actor_user_id,
    previous_boxes, box_change, new_boxes,
    previous_pieces, piece_change, new_pieces,
    previous_location_id, new_location_id, idempotency_key
  ) values (
    selected_pallet.id, 'moved', actor_id,
    selected_pallet.current_boxes, 0, selected_pallet.current_boxes,
    selected_pallet.current_pieces, 0, selected_pallet.current_pieces,
    source_location.id, destination.id, normalized_idempotency_key
  )
  returning public.inventory_transactions.id into move_transaction_id;

  return query
  select moved_pallet.id, moved_pallet.pallet_code,
    part.part_number, part.description,
    source_location.id, source_location.location_code,
    destination.id, destination.location_code,
    transaction.new_boxes, transaction.new_pieces,
    moved_pallet.boxes_per_full_pallet_snapshot,
    'stored'::public.pallet_lifecycle_status,
    transaction.id, transaction.occurred_at
  from public.inventory_transactions as transaction
  join public.pallets as moved_pallet on moved_pallet.id = transaction.pallet_id
  join public.parts as part on part.id = moved_pallet.part_id
  where transaction.id = move_transaction_id;
end;
$$;

revoke all on function public.move_pallet(text, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.move_pallet(text, uuid, uuid, text)
to authenticated;

comment on function public.move_pallet(text, uuid, uuid, text) is
  'Moves a stored pallet between racks with reviewed-source validation, sorted rack locks, idempotent retries, and append-only location history.';
