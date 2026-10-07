-- Pull Boxes is a partial removal from a stored rack pallet. Shipping owns
-- final depletion; this function never creates an ambiguous zero-balance pallet.

create function public.pull_boxes(
  p_pallet_code text,
  p_boxes_to_pull integer,
  p_expected_current_boxes integer,
  p_expected_current_pieces integer,
  p_idempotency_key text,
  p_po_reference text default null,
  p_bol_reference text default null
)
returns table (
  pallet_id uuid,
  pallet_code text,
  part_number text,
  description text,
  location_code text,
  previous_boxes integer,
  boxes_removed integer,
  current_boxes integer,
  previous_pieces integer,
  pieces_removed integer,
  current_pieces integer,
  transaction_id uuid,
  pulled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_pallet_code text := pg_catalog.btrim(p_pallet_code);
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  normalized_po text := nullif(pg_catalog.btrim(p_po_reference), '');
  normalized_bol text := nullif(pg_catalog.btrim(p_bol_reference), '');
  existing_transaction_id uuid;
  created_transaction_id uuid;
  selected_pallet record;
  removed_pieces_bigint bigint;
  remaining_pieces_bigint bigint;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION REQUIRED';
  end if;

  if not exists (
    select 1 from public.profiles as profile
    where profile.id = actor_id and profile.active
      and profile.role in ('worker', 'supervisor')
  ) then
    raise exception using errcode = '42501', message = 'ACTIVE WORKER PROFILE REQUIRED';
  end if;

  if normalized_key is null or normalized_key = ''
    or pg_catalog.length(normalized_key) > 200 then
    raise exception using errcode = '22023', message = 'INVALID IDEMPOTENCY KEY';
  end if;
  if normalized_pallet_code is null or normalized_pallet_code = '' then
    raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
  end if;
  if p_boxes_to_pull is null or p_boxes_to_pull <= 0 then
    raise exception using errcode = '22023', message = 'INVALID PULL QUANTITY';
  end if;
  if p_expected_current_boxes is null or p_expected_current_boxes < 0
    or p_expected_current_pieces is null or p_expected_current_pieces < 0 then
    raise exception using errcode = '22023', message = 'INVALID EXPECTED INVENTORY';
  end if;
  if pg_catalog.length(normalized_po) > 100
    or pg_catalog.length(normalized_bol) > 100 then
    raise exception using errcode = '22023', message = 'REFERENCE TOO LONG';
  end if;

  -- Serialize same-key retries before reading history. A response lost after
  -- commit can be safely replayed even though the live pallet has changed.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_key, 0)
  );

  select transaction.id into existing_transaction_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_key;

  if existing_transaction_id is not null then
    if not exists (
      select 1 from public.inventory_transactions as transaction
      join public.pallets as pallet on pallet.id = transaction.pallet_id
      where transaction.id = existing_transaction_id
        and transaction.transaction_type = 'box_pull'
        and transaction.actor_user_id = actor_id
        and pallet.pallet_code = normalized_pallet_code
        and transaction.box_change = -p_boxes_to_pull
        and transaction.previous_boxes = p_expected_current_boxes
        and transaction.previous_pieces = p_expected_current_pieces
        and transaction.po_reference is not distinct from normalized_po
        and transaction.bol_reference is not distinct from normalized_bol
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY KEY CONFLICT';
    end if;

    return query
    select pallet.id, pallet.pallet_code, part.part_number, part.description,
      location.location_code, transaction.previous_boxes,
      -transaction.box_change, transaction.new_boxes,
      transaction.previous_pieces, -transaction.piece_change,
      transaction.new_pieces, transaction.id, transaction.occurred_at
    from public.inventory_transactions as transaction
    join public.pallets as pallet on pallet.id = transaction.pallet_id
    join public.parts as part on part.id = pallet.part_id
    join public.locations as location on location.id = transaction.new_location_id
    where transaction.id = existing_transaction_id;
    return;
  end if;

  select pallet.id, pallet.part_id, pallet.current_boxes,
    pallet.current_pieces, pallet.pieces_per_box_snapshot,
    pallet.current_location_id, pallet.lifecycle_status,
    location.location_type
  into selected_pallet
  from public.pallets as pallet
  left join public.locations as location on location.id = pallet.current_location_id
  where pallet.pallet_code = normalized_pallet_code
  for update of pallet;

  if not found then
    raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
  end if;
  if selected_pallet.lifecycle_status = 'on_hold' then
    raise exception using errcode = '22023', message = 'PALLET ON HOLD';
  elsif selected_pallet.lifecycle_status = 'shipped' then
    raise exception using errcode = '22023', message = 'PALLET SHIPPED';
  elsif selected_pallet.lifecycle_status <> 'stored'
    or selected_pallet.location_type is distinct from 'rack'::public.location_type then
    raise exception using errcode = '22023', message = 'PALLET NOT READY TO PULL';
  end if;
  if selected_pallet.current_boxes <= 0 or selected_pallet.current_pieces <= 0 then
    raise exception using errcode = '22023', message = 'NO INVENTORY';
  end if;
  if selected_pallet.current_boxes <> p_expected_current_boxes
    or selected_pallet.current_pieces <> p_expected_current_pieces then
    raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
  end if;
  if p_boxes_to_pull > selected_pallet.current_boxes then
    raise exception using errcode = '22023', message = 'TOO MANY BOXES';
  end if;
  if p_boxes_to_pull = selected_pallet.current_boxes then
    raise exception using errcode = '22023', message = 'WHOLE PALLET USE SHIPPING';
  end if;

  removed_pieces_bigint := p_boxes_to_pull::bigint * selected_pallet.pieces_per_box_snapshot::bigint;
  remaining_pieces_bigint := selected_pallet.current_pieces::bigint - removed_pieces_bigint;
  if removed_pieces_bigint > 2147483647 or remaining_pieces_bigint < 0
    or remaining_pieces_bigint > 2147483647 then
    raise exception using errcode = '22003', message = 'PALLET QUANTITY TOO LARGE';
  end if;

  update public.pallets as pallet
  set current_boxes = selected_pallet.current_boxes - p_boxes_to_pull,
      current_pieces = remaining_pieces_bigint::integer
  where pallet.id = selected_pallet.id;

  insert into public.inventory_transactions (
    pallet_id, transaction_type, actor_user_id,
    previous_boxes, box_change, new_boxes,
    previous_pieces, piece_change, new_pieces,
    previous_location_id, new_location_id,
    po_reference, bol_reference, idempotency_key
  ) values (
    selected_pallet.id, 'box_pull', actor_id,
    selected_pallet.current_boxes, -p_boxes_to_pull,
    selected_pallet.current_boxes - p_boxes_to_pull,
    selected_pallet.current_pieces, -removed_pieces_bigint::integer,
    remaining_pieces_bigint::integer,
    selected_pallet.current_location_id, selected_pallet.current_location_id,
    normalized_po, normalized_bol, normalized_key
  ) returning public.inventory_transactions.id into created_transaction_id;

  return query
  select pallet.id, pallet.pallet_code, part.part_number, part.description,
    location.location_code, transaction.previous_boxes,
    -transaction.box_change, transaction.new_boxes,
    transaction.previous_pieces, -transaction.piece_change,
    transaction.new_pieces, transaction.id, transaction.occurred_at
  from public.inventory_transactions as transaction
  join public.pallets as pallet on pallet.id = transaction.pallet_id
  join public.parts as part on part.id = pallet.part_id
  join public.locations as location on location.id = transaction.new_location_id
  where transaction.id = created_transaction_id;
end;
$$;

revoke all on function public.pull_boxes(text, integer, integer, integer, text, text, text)
from public, anon, authenticated;
grant execute on function public.pull_boxes(text, integer, integer, integer, text, text, text)
to authenticated;

comment on function public.pull_boxes(text, integer, integer, integer, text, text, text) is
  'Partially pulls whole boxes from a stored rack pallet with authoritative snapshot math, stale-state validation, serialized idempotency, and atomic audit history.';
