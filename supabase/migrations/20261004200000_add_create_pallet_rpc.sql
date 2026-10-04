-- Mission 4 adds the first protected inventory write operation.
-- The browser supplies identifiers and worker-entered fields only. PostgreSQL
-- owns identity, packing snapshots, quantity math, pallet codes, and history.

create sequence public.pallet_code_seq
  as bigint
  minvalue 1
  maxvalue 9999999
  start with 1
  increment by 1
  no cycle;

revoke all on sequence public.pallet_code_seq from public, anon, authenticated;

create function public.create_pallet(
  p_part_id uuid,
  p_boxes integer,
  p_heat_number text,
  p_lot_number text,
  p_idempotency_key text,
  p_machine_code text default null
)
returns table (
  id uuid,
  pallet_code text,
  part_id uuid,
  part_number text,
  description text,
  product_family text,
  heat_number text,
  lot_number text,
  machine_code text,
  packed_by_user_id uuid,
  packed_at timestamptz,
  pieces_per_box_snapshot integer,
  boxes_per_full_pallet_snapshot integer,
  estimated_box_weight_lb_snapshot numeric,
  original_boxes integer,
  original_pieces integer,
  current_boxes integer,
  current_pieces integer,
  lifecycle_status public.pallet_lifecycle_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_heat_number text := btrim(p_heat_number);
  normalized_lot_number text := btrim(p_lot_number);
  normalized_machine_code text := nullif(btrim(p_machine_code), '');
  normalized_idempotency_key text := btrim(p_idempotency_key);
  existing_pallet_id uuid;
  created_pallet_id uuid;
  created_pallet_code text;
  pallet_code_number bigint;
  authoritative_pieces_bigint bigint;
  authoritative_pieces integer;
  selected_part record;
begin
  if actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'AUTHENTICATION REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles as actor_profile
    where actor_profile.id = actor_id
      and actor_profile.active
      and actor_profile.role in ('worker', 'supervisor')
  ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVE WORKER PROFILE REQUIRED';
  end if;

  if normalized_idempotency_key is null
    or normalized_idempotency_key = ''
    or length(normalized_idempotency_key) > 200
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID IDEMPOTENCY KEY';
  end if;

  if normalized_heat_number is null or normalized_heat_number = '' then
    raise exception using
      errcode = '22023',
      message = 'HEAT NUMBER REQUIRED';
  end if;

  if normalized_lot_number is null or normalized_lot_number = '' then
    raise exception using
      errcode = '22023',
      message = 'LOT NUMBER REQUIRED';
  end if;

  if p_boxes is null or p_boxes <= 0 then
    raise exception using
      errcode = '22023',
      message = 'BOXES MUST BE GREATER THAN ZERO';
  end if;

  -- Serialize matching retries before reading the idempotency record. This
  -- makes concurrent double taps return the same pallet instead of racing the
  -- unique transaction key and surfacing an ambiguous error.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_idempotency_key, 0)
  );

  select transaction.pallet_id
  into existing_pallet_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_idempotency_key;

  if existing_pallet_id is not null then
    if not exists (
      select 1
      from public.inventory_transactions as transaction
      join public.pallets as existing_pallet
        on existing_pallet.id = transaction.pallet_id
      where transaction.idempotency_key = normalized_idempotency_key
        and transaction.transaction_type = 'pallet_created'
        and transaction.actor_user_id = actor_id
        and existing_pallet.part_id = p_part_id
        and existing_pallet.original_boxes = p_boxes
        and existing_pallet.heat_number = normalized_heat_number
        and existing_pallet.lot_number = normalized_lot_number
        and existing_pallet.machine_code is not distinct from normalized_machine_code
    ) then
      raise exception using
        errcode = '22023',
        message = 'IDEMPOTENCY KEY CONFLICT';
    end if;

    return query
    select
      existing_pallet.id,
      existing_pallet.pallet_code,
      existing_pallet.part_id,
      part.part_number,
      part.description,
      part.product_family,
      existing_pallet.heat_number,
      existing_pallet.lot_number,
      existing_pallet.machine_code,
      existing_pallet.packed_by_user_id,
      existing_pallet.packed_at,
      existing_pallet.pieces_per_box_snapshot,
      existing_pallet.boxes_per_full_pallet_snapshot,
      existing_pallet.estimated_box_weight_lb_snapshot,
      existing_pallet.original_boxes,
      existing_pallet.original_pieces,
      existing_pallet.current_boxes,
      existing_pallet.current_pieces,
      existing_pallet.lifecycle_status
    from public.pallets as existing_pallet
    join public.parts as part on part.id = existing_pallet.part_id
    where existing_pallet.id = existing_pallet_id;

    return;
  end if;

  select
    part.id,
    part.part_number,
    part.description,
    part.product_family,
    packing_spec.pieces_per_box,
    packing_spec.boxes_per_full_pallet,
    packing_spec.estimated_box_weight_lb
  into selected_part
  from public.parts as part
  join public.packing_specs as packing_spec on packing_spec.part_id = part.id
  where part.id = p_part_id
    and part.active
  for key share of part, packing_spec;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'ACTIVE PART AND PACKING SPEC REQUIRED';
  end if;

  authoritative_pieces_bigint := p_boxes::bigint * selected_part.pieces_per_box::bigint;

  if authoritative_pieces_bigint > 2147483647 then
    raise exception using
      errcode = '22003',
      message = 'PALLET QUANTITY TOO LARGE';
  end if;

  authoritative_pieces := authoritative_pieces_bigint::integer;
  pallet_code_number := pg_catalog.nextval('public.pallet_code_seq'::regclass);
  created_pallet_code := 'MM-P-' || pg_catalog.lpad(pallet_code_number::text, 7, '0');

  insert into public.pallets (
    pallet_code,
    part_id,
    heat_number,
    lot_number,
    machine_code,
    packed_by_user_id,
    pieces_per_box_snapshot,
    boxes_per_full_pallet_snapshot,
    estimated_box_weight_lb_snapshot,
    original_boxes,
    original_pieces,
    current_boxes,
    current_pieces,
    lifecycle_status
  )
  values (
    created_pallet_code,
    selected_part.id,
    normalized_heat_number,
    normalized_lot_number,
    normalized_machine_code,
    actor_id,
    selected_part.pieces_per_box,
    selected_part.boxes_per_full_pallet,
    selected_part.estimated_box_weight_lb,
    p_boxes,
    authoritative_pieces,
    p_boxes,
    authoritative_pieces,
    'created'
  )
  returning public.pallets.id into created_pallet_id;

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
    idempotency_key
  )
  values (
    created_pallet_id,
    'pallet_created',
    actor_id,
    0,
    p_boxes,
    p_boxes,
    0,
    authoritative_pieces,
    authoritative_pieces,
    normalized_idempotency_key
  );

  return query
  select
    created_pallet.id,
    created_pallet.pallet_code,
    created_pallet.part_id,
    part.part_number,
    part.description,
    part.product_family,
    created_pallet.heat_number,
    created_pallet.lot_number,
    created_pallet.machine_code,
    created_pallet.packed_by_user_id,
    created_pallet.packed_at,
    created_pallet.pieces_per_box_snapshot,
    created_pallet.boxes_per_full_pallet_snapshot,
    created_pallet.estimated_box_weight_lb_snapshot,
    created_pallet.original_boxes,
    created_pallet.original_pieces,
    created_pallet.current_boxes,
    created_pallet.current_pieces,
    created_pallet.lifecycle_status
  from public.pallets as created_pallet
  join public.parts as part on part.id = created_pallet.part_id
  where created_pallet.id = created_pallet_id;
end;
$$;

revoke all on function public.create_pallet(uuid, integer, text, text, text, text)
from public, anon;

grant execute on function public.create_pallet(uuid, integer, text, text, text, text)
to authenticated;

comment on function public.create_pallet(uuid, integer, text, text, text, text) is
  'Creates one pallet and its initial audit transaction atomically. Identity, packing math, snapshots, pallet code, and retry handling are server-authoritative.';
