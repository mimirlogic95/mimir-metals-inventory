-- Store is a separate protected transition from Create and Move. The browser
-- supplies only the pallet identity, desired rack, and retry key.

create function public.store_pallet(
  p_pallet_code text,
  p_destination_location_id uuid,
  p_idempotency_key text
)
returns table (
  pallet_id uuid,
  pallet_code text,
  part_number text,
  description text,
  current_boxes integer,
  current_pieces integer,
  boxes_per_full_pallet_snapshot integer,
  lifecycle_status public.pallet_lifecycle_status,
  destination_location_id uuid,
  destination_location_code text,
  zone text,
  rack text,
  "position" text,
  stored_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_pallet_code text := pg_catalog.btrim(p_pallet_code);
  normalized_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  existing_transaction_id uuid;
  store_transaction_id uuid;
  selected_pallet record;
  destination record;
  source_type public.location_type;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles as actor_profile
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

  -- A retry must be examined before lifecycle validation: the first request
  -- may have committed even when its browser response was lost.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_idempotency_key, 0)
  );

  select transaction.id
  into existing_transaction_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_idempotency_key;

  if existing_transaction_id is not null then
    if not exists (
      select 1
      from public.inventory_transactions as transaction
      join public.pallets as existing_pallet
        on existing_pallet.id = transaction.pallet_id
      where transaction.id = existing_transaction_id
        and transaction.transaction_type = 'stored'
        and transaction.actor_user_id = actor_id
        and existing_pallet.pallet_code = normalized_pallet_code
        and transaction.new_location_id = p_destination_location_id
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY KEY CONFLICT';
    end if;

    return query
    select
      existing_pallet.id,
      existing_pallet.pallet_code,
      part.part_number,
      part.description,
      transaction.new_boxes,
      transaction.new_pieces,
      existing_pallet.boxes_per_full_pallet_snapshot,
      'stored'::public.pallet_lifecycle_status,
      location.id,
      location.location_code,
      location.zone,
      location.rack,
      location.position,
      transaction.occurred_at
    from public.inventory_transactions as transaction
    join public.pallets as existing_pallet on existing_pallet.id = transaction.pallet_id
    join public.parts as part on part.id = existing_pallet.part_id
    join public.locations as location on location.id = transaction.new_location_id
    where transaction.id = existing_transaction_id;

    return;
  end if;

  select
    pallet.id,
    pallet.current_location_id,
    pallet.lifecycle_status,
    pallet.current_boxes,
    pallet.current_pieces
  into selected_pallet
  from public.pallets as pallet
  where pallet.pallet_code = normalized_pallet_code
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
  end if;

  if selected_pallet.lifecycle_status = 'stored' then
    raise exception using errcode = '22023', message = 'PALLET ALREADY STORED';
  elsif selected_pallet.lifecycle_status = 'shipped' then
    raise exception using errcode = '22023', message = 'PALLET SHIPPED';
  elsif selected_pallet.lifecycle_status = 'on_hold' then
    raise exception using errcode = '22023', message = 'PALLET ON HOLD';
  elsif selected_pallet.lifecycle_status <> 'created' then
    raise exception using errcode = '22023', message = 'PALLET NOT READY TO STORE';
  end if;

  if p_destination_location_id is null then
    raise exception using errcode = '22023', message = 'LOCATION NOT FOUND';
  end if;

  -- Lock source and destination locations in ID order after the pallet row.
  -- The capacity trigger follows the same order and remains the final guard.
  perform 1
  from public.locations as location
  where location.id in (
    selected_pallet.current_location_id,
    p_destination_location_id
  )
  order by location.id
  for update;

  select location.id, location.location_code, location.location_type, location.active
  into destination
  from public.locations as location
  where location.id = p_destination_location_id;

  if not found then
    raise exception using errcode = '22023', message = 'LOCATION NOT FOUND';
  end if;

  if not destination.active then
    raise exception using errcode = '22023', message = 'LOCATION UNAVAILABLE';
  end if;

  if destination.location_type <> 'rack' then
    raise exception using errcode = '22023', message = 'LOCATION NOT A RACK';
  end if;

  if selected_pallet.current_location_id is not null then
    select location.location_type
    into source_type
    from public.locations as location
    where location.id = selected_pallet.current_location_id;

    if source_type <> 'packing' then
      raise exception using errcode = '22023', message = 'PALLET NOT READY TO STORE';
    end if;
  end if;

  if exists (
    select 1
    from public.pallets as occupying_pallet
    where occupying_pallet.current_location_id = destination.id
      and occupying_pallet.lifecycle_status <> 'shipped'
      and occupying_pallet.id <> selected_pallet.id
  ) then
    raise exception using
      errcode = '22023',
      message = 'LOCATION OCCUPIED',
      detail = destination.location_code || ' already contains a pallet.',
      hint = 'Scan another location.';
  end if;

  update public.pallets as pallet
  set current_location_id = destination.id,
      lifecycle_status = 'stored'
  where pallet.id = selected_pallet.id;

  insert into public.inventory_transactions (
    pallet_id,
    transaction_type,
    actor_user_id,
    previous_boxes,
    box_change,
    new_boxes,
    previous_pieces,
    piece_change,
    new_pieces,
    previous_location_id,
    new_location_id,
    idempotency_key
  )
  values (
    selected_pallet.id,
    'stored',
    actor_id,
    selected_pallet.current_boxes,
    0,
    selected_pallet.current_boxes,
    selected_pallet.current_pieces,
    0,
    selected_pallet.current_pieces,
    selected_pallet.current_location_id,
    destination.id,
    normalized_idempotency_key
  )
  returning public.inventory_transactions.id into store_transaction_id;

  return query
  select
    stored_pallet.id,
    stored_pallet.pallet_code,
    part.part_number,
    part.description,
    transaction.new_boxes,
    transaction.new_pieces,
    stored_pallet.boxes_per_full_pallet_snapshot,
    'stored'::public.pallet_lifecycle_status,
    location.id,
    location.location_code,
    location.zone,
    location.rack,
    location.position,
    transaction.occurred_at
  from public.inventory_transactions as transaction
  join public.pallets as stored_pallet on stored_pallet.id = transaction.pallet_id
  join public.parts as part on part.id = stored_pallet.part_id
  join public.locations as location on location.id = transaction.new_location_id
  where transaction.id = store_transaction_id;
end;
$$;

revoke all on function public.store_pallet(text, uuid, text)
from public, anon, authenticated;

grant execute on function public.store_pallet(text, uuid, text)
to authenticated;

comment on function public.store_pallet(text, uuid, text) is
  'Stores one created pallet in an active rack with serialized retry handling, rack locking, atomic current-state update, and append-only history.';
