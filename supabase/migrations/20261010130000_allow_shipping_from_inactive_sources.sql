-- Correct source eligibility without changing Shipping's other protections.
-- Destination staging still requires an active location in the original RPC.
create or replace function public.ship_pallet(
  p_pallet_code text,
  p_expected_current_location_id uuid,
  p_expected_lifecycle_status public.pallet_lifecycle_status,
  p_expected_current_boxes integer,
  p_expected_current_pieces integer,
  p_expected_inventory_version bigint,
  p_po_reference text,
  p_bol_reference text,
  p_reason_notes text,
  p_idempotency_key text
)
returns table (
  pallet_id uuid,
  pallet_code text,
  part_number text,
  description text,
  source_location_id uuid,
  source_location_code text,
  shipped_boxes integer,
  shipped_pieces integer,
  current_boxes integer,
  current_pieces integer,
  lifecycle_status public.pallet_lifecycle_status,
  po_reference text,
  bol_reference text,
  reason_notes text,
  actor_user_id uuid,
  actor_name text,
  transaction_id uuid,
  shipped_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  normalized_code text := pg_catalog.upper(pg_catalog.btrim(p_pallet_code));
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  normalized_po text := nullif(pg_catalog.btrim(p_po_reference), '');
  normalized_bol text := nullif(pg_catalog.btrim(p_bol_reference), '');
  normalized_notes text := nullif(pg_catalog.btrim(p_reason_notes), '');
  event_id uuid;
  selected_pallet record;
  source_location record;
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
  if normalized_code is null or normalized_code = '' or pg_catalog.length(normalized_code) > 100
    or normalized_key is null or normalized_key = '' or pg_catalog.length(normalized_key) > 200
    or p_expected_lifecycle_status is null
    or p_expected_current_location_id is null
    or p_expected_current_boxes is null or p_expected_current_boxes <= 0
    or p_expected_current_pieces is null or p_expected_current_pieces <= 0
    or p_expected_inventory_version is null or p_expected_inventory_version < 0
    or pg_catalog.length(normalized_po) > 100
    or pg_catalog.length(normalized_bol) > 100
    or pg_catalog.length(normalized_notes) > 200
    or normalized_po ~ '[[:cntrl:]]' or normalized_bol ~ '[[:cntrl:]]'
    or normalized_notes ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'INVALID SHIPPING REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_key, 0));
  select transaction.id into event_id from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_key;
  if event_id is not null then
    if not exists (
      select 1 from public.inventory_transactions as transaction
      join public.pallets as pallet on pallet.id = transaction.pallet_id
      where transaction.id = event_id
        and transaction.transaction_type = 'shipped'
        and transaction.actor_user_id = actor_id
        and pallet.pallet_code = normalized_code
        and transaction.previous_location_id = p_expected_current_location_id
        and transaction.previous_boxes = p_expected_current_boxes
        and transaction.previous_pieces = p_expected_current_pieces
        and transaction.po_reference is not distinct from normalized_po
        and transaction.bol_reference is not distinct from normalized_bol
        and transaction.reason_notes is not distinct from normalized_notes
        and transaction.metadata ->> 'expected_lifecycle' = p_expected_lifecycle_status::text
        and transaction.metadata ->> 'expected_version' = p_expected_inventory_version::text
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY KEY CONFLICT';
    end if;
  else
    select pallet.id, pallet.current_location_id, pallet.lifecycle_status,
      pallet.current_boxes, pallet.current_pieces, pallet.inventory_version,
      pallet.pieces_per_box_snapshot
    into selected_pallet from public.pallets as pallet
    where pallet.pallet_code = normalized_code for update;
    if not found then
      raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
    end if;
    if selected_pallet.lifecycle_status = 'on_hold' then
      raise exception using errcode = '22023', message = 'PALLET ON HOLD';
    elsif selected_pallet.lifecycle_status = 'shipped' then
      raise exception using errcode = '22023', message = 'ALREADY SHIPPED';
    elsif selected_pallet.lifecycle_status not in ('stored', 'shipping_staging') then
      raise exception using errcode = '22023', message = 'PALLET NOT ELIGIBLE';
    end if;
    if selected_pallet.current_location_id is distinct from p_expected_current_location_id
      or selected_pallet.lifecycle_status <> p_expected_lifecycle_status
      or selected_pallet.current_boxes <> p_expected_current_boxes
      or selected_pallet.current_pieces <> p_expected_current_pieces
      or selected_pallet.inventory_version <> p_expected_inventory_version
    then
      raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
    end if;
    if selected_pallet.current_boxes <= 0
      or selected_pallet.current_pieces <= 0
      or selected_pallet.current_boxes::bigint * selected_pallet.pieces_per_box_snapshot::bigint
        <> selected_pallet.current_pieces::bigint
    then
      raise exception using errcode = '22023', message = 'INVALID PALLET QUANTITY';
    end if;

    perform 1 from public.locations as location
    where location.id = selected_pallet.current_location_id for update;
    select location.id, location.location_code, location.location_type, location.active
    into source_location from public.locations as location
    where location.id = selected_pallet.current_location_id;
    -- Deactivation prevents new arrivals, not release of inventory already here.
    if not found
      or (selected_pallet.lifecycle_status = 'stored' and source_location.location_type <> 'rack')
      or (selected_pallet.lifecycle_status = 'shipping_staging'
        and source_location.location_type <> 'shipping_staging')
    then
      raise exception using errcode = '22023', message = 'PALLET NOT ELIGIBLE';
    end if;

    update public.pallets as pallet
    set current_boxes = 0, current_pieces = 0,
      current_location_id = null, lifecycle_status = 'shipped'
    where pallet.id = selected_pallet.id;
    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces,
      previous_location_id, new_location_id,
      po_reference, bol_reference, reason_notes, idempotency_key, metadata
    ) values (
      selected_pallet.id, 'shipped', actor_id,
      selected_pallet.current_boxes, -selected_pallet.current_boxes, 0,
      selected_pallet.current_pieces, -selected_pallet.current_pieces, 0,
      source_location.id, null,
      normalized_po, normalized_bol, normalized_notes, normalized_key,
      pg_catalog.jsonb_build_object(
        'expected_lifecycle', p_expected_lifecycle_status::text,
        'expected_version', p_expected_inventory_version
      )
    ) returning public.inventory_transactions.id into event_id;
  end if;

  return query
  select pallet.id, pallet.pallet_code, part.part_number, part.description,
    transaction.previous_location_id, source.location_code,
    transaction.previous_boxes, transaction.previous_pieces,
    transaction.new_boxes, transaction.new_pieces,
    'shipped'::public.pallet_lifecycle_status,
    transaction.po_reference, transaction.bol_reference, transaction.reason_notes,
    transaction.actor_user_id, profile.display_name,
    transaction.id, transaction.occurred_at
  from public.inventory_transactions as transaction
  join public.pallets as pallet on pallet.id = transaction.pallet_id
  join public.parts as part on part.id = pallet.part_id
  join public.profiles as profile on profile.id = transaction.actor_user_id
  join public.locations as source on source.id = transaction.previous_location_id
  where transaction.id = event_id;
end;
$$;


revoke all on function public.ship_pallet(
  text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.ship_pallet(
  text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, text, text, text, text
) to authenticated;
