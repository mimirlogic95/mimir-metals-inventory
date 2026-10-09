-- A count observes physical stock; only later supervisor approval may adjust it.
alter table public.adjustment_requests
  add column count_location_id uuid references public.locations (id) on delete restrict;

create unique index adjustment_requests_one_pending_per_pallet_idx
  on public.adjustment_requests (pallet_id) where status = 'pending';

create function public.count_pallet(
  p_pallet_code text,
  p_counted_boxes integer,
  p_expected_current_boxes integer,
  p_expected_current_pieces integer,
  p_expected_current_location_id uuid,
  p_reason_code text,
  p_reason_notes text,
  p_idempotency_key text
)
returns table (
  pallet_id uuid,
  pallet_code text,
  part_number text,
  description text,
  location_id uuid,
  location_code text,
  lifecycle_status public.pallet_lifecycle_status,
  system_boxes integer,
  system_pieces integer,
  counted_boxes integer,
  counted_pieces integer,
  box_difference integer,
  piece_difference integer,
  outcome text,
  adjustment_request_id uuid,
  transaction_id uuid,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_code text := pg_catalog.upper(pg_catalog.btrim(p_pallet_code));
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  normalized_reason text := nullif(pg_catalog.btrim(p_reason_code), '');
  normalized_notes text := nullif(pg_catalog.btrim(p_reason_notes), '');
  event_id uuid;
  request_id uuid;
  selected_pallet record;
  counted_pieces_bigint bigint;
  difference_pieces_bigint bigint;
  count_is_match boolean;
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
  if p_counted_boxes is null or p_counted_boxes < 0
    or p_expected_current_boxes is null or p_expected_current_pieces is null
    or p_expected_current_location_id is null then
    raise exception using errcode = '22023', message = 'INVALID COUNT';
  end if;
  if normalized_notes is not null and pg_catalog.length(normalized_notes) > 200 then
    raise exception using errcode = '22023', message = 'NOTE TOO LONG';
  end if;

  -- Serialize a retry before reading a pallet that may have changed afterward.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_key, 0)
  );
  select transaction.id into event_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_key;
  if event_id is not null then
    if not exists (
      select 1 from public.inventory_transactions as transaction
      join public.pallets as pallet on pallet.id = transaction.pallet_id
      where transaction.id = event_id
        and transaction.transaction_type in ('count_matched', 'adjustment_requested')
        and transaction.actor_user_id = actor_id
        and pallet.pallet_code = normalized_code
        and transaction.previous_boxes = p_expected_current_boxes
        and transaction.previous_pieces = p_expected_current_pieces
        and transaction.previous_location_id = p_expected_current_location_id
        and (transaction.metadata ->> 'counted_boxes')::integer = p_counted_boxes
        and transaction.reason_code is not distinct from normalized_reason
        and transaction.reason_notes is not distinct from normalized_notes
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY KEY CONFLICT';
    end if;
  else
    select pallet.id, pallet.current_boxes, pallet.current_pieces,
      pallet.current_location_id, pallet.lifecycle_status,
      pallet.lifecycle_status_before_hold, pallet.pieces_per_box_snapshot,
      location.location_type
    into selected_pallet
    from public.pallets as pallet
    left join public.locations as location on location.id = pallet.current_location_id
    where pallet.pallet_code = normalized_code
    for update of pallet;

    if not found then
      raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
    end if;
    if selected_pallet.lifecycle_status = 'shipped' then
      raise exception using errcode = '22023', message = 'PALLET SHIPPED';
    end if;
    if not (
      selected_pallet.lifecycle_status = 'stored'
      or (selected_pallet.lifecycle_status = 'on_hold'
        and selected_pallet.lifecycle_status_before_hold = 'stored')
    ) or selected_pallet.location_type is distinct from 'rack'::public.location_type
      or selected_pallet.current_boxes <= 0 or selected_pallet.current_pieces <= 0 then
      raise exception using errcode = '22023', message = 'PALLET NOT COUNTABLE';
    end if;
    if selected_pallet.current_boxes <> p_expected_current_boxes
      or selected_pallet.current_pieces <> p_expected_current_pieces
      or selected_pallet.current_location_id <> p_expected_current_location_id then
      raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
    end if;
    counted_pieces_bigint := p_counted_boxes::bigint
      * selected_pallet.pieces_per_box_snapshot::bigint;
    difference_pieces_bigint := counted_pieces_bigint - selected_pallet.current_pieces::bigint;
    if counted_pieces_bigint > 2147483647
      or difference_pieces_bigint < -2147483648
      or difference_pieces_bigint > 2147483647 then
      raise exception using errcode = '22023', message = 'INVALID COUNT';
    end if;
    count_is_match := p_counted_boxes = selected_pallet.current_boxes;
    if count_is_match then
      if normalized_reason is not null or normalized_notes is not null then
        raise exception using errcode = '22023', message = 'INVALID COUNT';
      end if;
    elsif normalized_reason not in (
      'unrecorded_shipping_pull', 'damaged_product', 'packing_correction',
      'count_error', 'other'
    ) or normalized_reason is null then
      raise exception using errcode = '22023', message = 'REASON REQUIRED';
    end if;

    if not count_is_match then
      if exists (
        select 1 from public.adjustment_requests as pending
        where pending.pallet_id = selected_pallet.id and pending.status = 'pending'
      ) then
        raise exception using errcode = '22023', message = 'ADJUSTMENT ALREADY PENDING';
      end if;
      insert into public.adjustment_requests (
        pallet_id, requested_by_user_id, system_boxes, counted_boxes,
        box_difference, system_pieces, counted_pieces, piece_difference,
        count_location_id, reason_code, reason_notes, status
      ) values (
        selected_pallet.id, actor_id, selected_pallet.current_boxes, p_counted_boxes,
        p_counted_boxes - selected_pallet.current_boxes,
        selected_pallet.current_pieces, counted_pieces_bigint::integer,
        difference_pieces_bigint::integer, selected_pallet.current_location_id,
        normalized_reason, normalized_notes, 'pending'
      ) returning id into request_id;
    end if;

    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces,
      previous_location_id, new_location_id,
      reason_code, reason_notes, adjustment_request_id, idempotency_key, metadata
    ) values (
      selected_pallet.id,
      case when count_is_match then 'count_matched'::public.inventory_transaction_type
        else 'adjustment_requested'::public.inventory_transaction_type end,
      actor_id, selected_pallet.current_boxes, 0, selected_pallet.current_boxes,
      selected_pallet.current_pieces, 0, selected_pallet.current_pieces,
      selected_pallet.current_location_id, selected_pallet.current_location_id,
      normalized_reason, normalized_notes, request_id, normalized_key,
      pg_catalog.jsonb_build_object(
        'counted_boxes', p_counted_boxes,
        'counted_pieces', counted_pieces_bigint::integer,
        'lifecycle_status', selected_pallet.lifecycle_status
      )
    ) returning id into event_id;
  end if;

  return query
  select pallet.id, pallet.pallet_code, part.part_number, part.description,
    location.id, location.location_code,
    (transaction.metadata ->> 'lifecycle_status')::public.pallet_lifecycle_status,
    transaction.previous_boxes, transaction.previous_pieces,
    (transaction.metadata ->> 'counted_boxes')::integer,
    (transaction.metadata ->> 'counted_pieces')::integer,
    (transaction.metadata ->> 'counted_boxes')::integer - transaction.previous_boxes,
    (transaction.metadata ->> 'counted_pieces')::integer - transaction.previous_pieces,
    case when transaction.transaction_type = 'count_matched' then 'matched'::text
      else 'discrepancy'::text end,
    transaction.adjustment_request_id, transaction.id, transaction.occurred_at
  from public.inventory_transactions as transaction
  join public.pallets as pallet on pallet.id = transaction.pallet_id
  join public.parts as part on part.id = pallet.part_id
  join public.locations as location on location.id = transaction.previous_location_id
  where transaction.id = event_id;
end;
$$;

revoke all on function public.count_pallet(text, integer, integer, integer, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.count_pallet(text, integer, integer, integer, uuid, text, text, text)
to authenticated;

comment on function public.count_pallet(text, integer, integer, integer, uuid, text, text, text) is
  'Records a physical box count without changing inventory, atomically creating either a match event or one pending adjustment request and discrepancy event.';
