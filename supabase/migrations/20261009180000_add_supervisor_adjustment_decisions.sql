-- Count-time pallet versions make move-away/return and hold/release cycles stale.
-- Existing pending requests deliberately retain NULL context: their past version
-- cannot be reconstructed, so they require rejection and a new physical count.
alter table public.pallets
  add column inventory_version bigint not null default 0
    constraint pallets_inventory_version_nonnegative check (inventory_version >= 0);

alter table public.adjustment_requests
  add column count_inventory_version bigint,
  add column count_lifecycle_status public.pallet_lifecycle_status,
  add column count_lifecycle_status_before_hold public.pallet_lifecycle_status,
  add constraint adjustment_requests_count_context check (
    (count_inventory_version is null
      and count_lifecycle_status is null
      and count_lifecycle_status_before_hold is null)
    or (count_inventory_version is not null and count_inventory_version >= 0
      and count_lifecycle_status is not null and (
      (count_lifecycle_status = 'stored' and count_lifecycle_status_before_hold is null)
      or (count_lifecycle_status = 'on_hold'
        and count_lifecycle_status_before_hold = 'stored')
    ))
  );

create function public.bump_pallet_inventory_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.inventory_version = 9223372036854775807 then
    raise exception using errcode = '22003', message = 'PALLET VERSION EXHAUSTED';
  end if;
  new.inventory_version := old.inventory_version + 1;
  return new;
end;
$$;

create trigger pallets_bump_inventory_version
before update on public.pallets
for each row execute function public.bump_pallet_inventory_version();

-- count_pallet already locks the pallet before inserting a discrepancy. This
-- trigger also locks it for any later protected request creator, and never
-- accepts caller-supplied version or hold context.
create function public.capture_adjustment_count_context()
returns trigger language plpgsql set search_path = '' as $$
declare
  pallet_state record;
begin
  select pallet.inventory_version, pallet.lifecycle_status,
    pallet.lifecycle_status_before_hold
  into pallet_state
  from public.pallets as pallet
  where pallet.id = new.pallet_id
  for share;

  if not found then
    raise exception using errcode = '22023', message = 'PALLET NOT FOUND';
  end if;
  new.count_inventory_version := pallet_state.inventory_version;
  new.count_lifecycle_status := pallet_state.lifecycle_status;
  new.count_lifecycle_status_before_hold := pallet_state.lifecycle_status_before_hold;
  return new;
end;
$$;

create trigger adjustment_requests_capture_count_context
before insert on public.adjustment_requests
for each row execute function public.capture_adjustment_count_context();

revoke all on function public.bump_pallet_inventory_version() from public, anon, authenticated;
revoke all on function public.capture_adjustment_count_context() from public, anon, authenticated;

create function public.approve_adjustment_request(
  p_request_id uuid,
  p_review_notes text,
  p_idempotency_key text
)
returns table (
  request_id uuid,
  pallet_id uuid,
  pallet_code text,
  part_number text,
  decision_status public.adjustment_status,
  reviewed_by_user_id uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  location_id uuid,
  location_code text,
  lifecycle_status public.pallet_lifecycle_status,
  before_boxes integer,
  box_change integer,
  after_boxes integer,
  before_pieces integer,
  piece_change integer,
  after_pieces integer,
  review_notes text,
  transaction_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  normalized_notes text := nullif(pg_catalog.btrim(p_review_notes), '');
  event_id uuid;
  count_event_id uuid;
  target_pallet_id uuid;
  selected_pallet record;
  selected_request record;
  expected_system_pieces bigint;
  expected_counted_pieces bigint;
  piece_change_bigint bigint;
  decision_time timestamptz;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION REQUIRED';
  end if;
  select profile.display_name into actor_name
  from public.profiles as profile
  where profile.id = actor_id and profile.active and profile.role = 'supervisor';
  if not found then
    raise exception using errcode = '42501', message = 'SUPERVISOR ACCESS REQUIRED';
  end if;
  if p_request_id is null or normalized_key is null or normalized_key = ''
    or pg_catalog.length(normalized_key) > 200 then
    raise exception using errcode = '22023', message = 'INVALID ADJUSTMENT';
  end if;
  if normalized_notes is not null and pg_catalog.length(normalized_notes) > 200 then
    raise exception using errcode = '22023', message = 'INVALID ADJUSTMENT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_key, 0));
  select transaction.id into event_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_key;
  if event_id is not null then
    if not exists (
      select 1 from public.inventory_transactions as transaction
      where transaction.id = event_id
        and transaction.transaction_type = 'adjustment_approved'
        and transaction.adjustment_request_id = p_request_id
        and transaction.actor_user_id = actor_id
        and transaction.reason_notes is not distinct from normalized_notes
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY CONFLICT';
    end if;
  else
    -- Match Count's pallet-first order. Never lock a request before its pallet.
    select request.pallet_id into target_pallet_id
    from public.adjustment_requests as request where request.id = p_request_id;
    if not found then
      raise exception using errcode = '22023', message = 'REQUEST NOT FOUND';
    end if;

    select pallet.id, pallet.current_boxes, pallet.current_pieces,
      pallet.current_location_id, pallet.lifecycle_status,
      pallet.lifecycle_status_before_hold, pallet.pieces_per_box_snapshot,
      pallet.inventory_version, location.location_type
    into selected_pallet
    from public.pallets as pallet
    left join public.locations as location on location.id = pallet.current_location_id
    where pallet.id = target_pallet_id
    for update of pallet;
    if not found then
      raise exception using errcode = '22023', message = 'REQUEST NOT FOUND';
    end if;

    select request.* into selected_request
    from public.adjustment_requests as request
    where request.id = p_request_id
    for update;
    if not found or selected_request.pallet_id <> selected_pallet.id then
      raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
    end if;
    if selected_request.status <> 'pending' then
      raise exception using errcode = '22023', message = 'REQUEST ALREADY RESOLVED';
    end if;
    if selected_request.requested_by_user_id = actor_id then
      raise exception using errcode = '42501', message = 'CANNOT APPROVE OWN REQUEST';
    end if;
    if selected_request.counted_boxes = 0 then
      raise exception using errcode = '22023', message = 'ZERO BALANCE NOT SUPPORTED';
    end if;
    if selected_request.count_inventory_version is null
      or selected_request.count_location_id is null
      or selected_request.count_lifecycle_status is null
      or selected_pallet.inventory_version <> selected_request.count_inventory_version
      or selected_pallet.current_boxes <> selected_request.system_boxes
      or selected_pallet.current_pieces <> selected_request.system_pieces
      or selected_pallet.current_location_id is distinct from selected_request.count_location_id
      or selected_pallet.lifecycle_status <> selected_request.count_lifecycle_status
      or selected_pallet.lifecycle_status_before_hold
        is distinct from selected_request.count_lifecycle_status_before_hold then
      raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
    end if;
    if not (
      selected_pallet.lifecycle_status = 'stored'
      or (selected_pallet.lifecycle_status = 'on_hold'
        and selected_pallet.lifecycle_status_before_hold = 'stored')
    ) or selected_pallet.location_type is distinct from 'rack'::public.location_type
      or selected_pallet.current_boxes <= 0 or selected_pallet.current_pieces <= 0 then
      raise exception using errcode = '22023', message = 'PALLET NOT ELIGIBLE';
    end if;

    expected_system_pieces := selected_request.system_boxes::bigint
      * selected_pallet.pieces_per_box_snapshot::bigint;
    expected_counted_pieces := selected_request.counted_boxes::bigint
      * selected_pallet.pieces_per_box_snapshot::bigint;
    piece_change_bigint := expected_counted_pieces - expected_system_pieces;
    if selected_request.system_boxes <= 0 or selected_request.counted_boxes < 0
      or selected_request.system_boxes = selected_request.counted_boxes
      or expected_system_pieces > 2147483647
      or expected_counted_pieces > 2147483647
      or piece_change_bigint < -2147483648 or piece_change_bigint > 2147483647
      or selected_request.system_pieces::bigint <> expected_system_pieces
      or selected_request.counted_pieces::bigint <> expected_counted_pieces
      or selected_request.box_difference::bigint <>
        selected_request.counted_boxes::bigint - selected_request.system_boxes::bigint
      or selected_request.piece_difference::bigint <> piece_change_bigint then
      raise exception using errcode = '22023', message = 'INVALID ADJUSTMENT';
    end if;

    select transaction.id into count_event_id
    from public.inventory_transactions as transaction
    where transaction.adjustment_request_id = selected_request.id
      and transaction.transaction_type = 'adjustment_requested'
      and transaction.actor_user_id = selected_request.requested_by_user_id
      and transaction.previous_boxes = selected_request.system_boxes
      and transaction.new_boxes = selected_request.system_boxes
      and transaction.previous_pieces = selected_request.system_pieces
      and transaction.new_pieces = selected_request.system_pieces
      and transaction.previous_location_id = selected_request.count_location_id
      and transaction.new_location_id = selected_request.count_location_id
      and (transaction.metadata ->> 'counted_boxes')::integer = selected_request.counted_boxes
      and (transaction.metadata ->> 'counted_pieces')::integer = selected_request.counted_pieces
      and (transaction.metadata ->> 'lifecycle_status') = selected_request.count_lifecycle_status::text;
    if not found then
      raise exception using errcode = '22023', message = 'INVALID ADJUSTMENT';
    end if;

    decision_time := pg_catalog.clock_timestamp();
    update public.pallets as pallet
    set current_boxes = selected_request.counted_boxes,
        current_pieces = selected_request.counted_pieces
    where pallet.id = selected_pallet.id;

    update public.adjustment_requests as request
    set status = 'approved', reviewed_by_user_id = actor_id,
        reviewed_at = decision_time, review_notes = normalized_notes
    where request.id = selected_request.id;

    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id, occurred_at,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces,
      previous_location_id, new_location_id,
      reason_code, reason_notes, adjustment_request_id,
      idempotency_key, metadata
    ) values (
      selected_pallet.id, 'adjustment_approved', actor_id, decision_time,
      selected_pallet.current_boxes, selected_request.box_difference,
      selected_request.counted_boxes,
      selected_pallet.current_pieces, selected_request.piece_difference,
      selected_request.counted_pieces,
      selected_pallet.current_location_id, selected_pallet.current_location_id,
      selected_request.reason_code, normalized_notes, selected_request.id,
      normalized_key, pg_catalog.jsonb_build_object(
        'reviewer_name', actor_name,
        'count_event_id', count_event_id,
        'lifecycle_status', selected_pallet.lifecycle_status,
        'count_inventory_version', selected_request.count_inventory_version
      )
    ) returning id into event_id;
  end if;

  return query
  select request.id, pallet.id, pallet.pallet_code, part.part_number,
    request.status, transaction.actor_user_id,
    transaction.metadata ->> 'reviewer_name', transaction.occurred_at,
    location.id, location.location_code,
    (transaction.metadata ->> 'lifecycle_status')::public.pallet_lifecycle_status,
    transaction.previous_boxes, transaction.box_change, transaction.new_boxes,
    transaction.previous_pieces, transaction.piece_change, transaction.new_pieces,
    transaction.reason_notes, transaction.id
  from public.inventory_transactions as transaction
  join public.adjustment_requests as request on request.id = transaction.adjustment_request_id
  join public.pallets as pallet on pallet.id = transaction.pallet_id
  join public.parts as part on part.id = pallet.part_id
  join public.locations as location on location.id = transaction.previous_location_id
  where transaction.id = event_id;
end;
$$;

create function public.reject_adjustment_request(
  p_request_id uuid,
  p_review_notes text,
  p_idempotency_key text
)
returns table (
  request_id uuid,
  pallet_id uuid,
  pallet_code text,
  part_number text,
  decision_status public.adjustment_status,
  reviewed_by_user_id uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  location_id uuid,
  location_code text,
  lifecycle_status public.pallet_lifecycle_status,
  before_boxes integer,
  box_change integer,
  after_boxes integer,
  before_pieces integer,
  piece_change integer,
  after_pieces integer,
  review_notes text,
  transaction_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  normalized_key text := pg_catalog.btrim(p_idempotency_key);
  normalized_notes text := nullif(pg_catalog.btrim(p_review_notes), '');
  event_id uuid;
  target_pallet_id uuid;
  selected_pallet record;
  selected_request record;
  decision_time timestamptz;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION REQUIRED';
  end if;
  select profile.display_name into actor_name
  from public.profiles as profile
  where profile.id = actor_id and profile.active and profile.role = 'supervisor';
  if not found then
    raise exception using errcode = '42501', message = 'SUPERVISOR ACCESS REQUIRED';
  end if;
  if p_request_id is null or normalized_key is null or normalized_key = ''
    or pg_catalog.length(normalized_key) > 200 then
    raise exception using errcode = '22023', message = 'INVALID ADJUSTMENT';
  end if;
  if normalized_notes is null or pg_catalog.length(normalized_notes) > 200 then
    raise exception using errcode = '22023', message = 'REJECTION REASON REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_key, 0));
  select transaction.id into event_id
  from public.inventory_transactions as transaction
  where transaction.idempotency_key = normalized_key;
  if event_id is not null then
    if not exists (
      select 1 from public.inventory_transactions as transaction
      where transaction.id = event_id
        and transaction.transaction_type = 'adjustment_rejected'
        and transaction.adjustment_request_id = p_request_id
        and transaction.actor_user_id = actor_id
        and transaction.reason_notes = normalized_notes
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY CONFLICT';
    end if;
  else
    select request.pallet_id into target_pallet_id
    from public.adjustment_requests as request where request.id = p_request_id;
    if not found then
      raise exception using errcode = '22023', message = 'REQUEST NOT FOUND';
    end if;
    select pallet.id, pallet.current_boxes, pallet.current_pieces,
      pallet.current_location_id, pallet.lifecycle_status
    into selected_pallet
    from public.pallets as pallet
    where pallet.id = target_pallet_id
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'REQUEST NOT FOUND';
    end if;
    select request.* into selected_request
    from public.adjustment_requests as request
    where request.id = p_request_id
    for update;
    if not found or selected_request.pallet_id <> selected_pallet.id then
      raise exception using errcode = '22023', message = 'INVENTORY CHANGED';
    end if;
    if selected_request.status <> 'pending' then
      raise exception using errcode = '22023', message = 'REQUEST ALREADY RESOLVED';
    end if;

    decision_time := pg_catalog.clock_timestamp();
    update public.adjustment_requests as request
    set status = 'rejected', reviewed_by_user_id = actor_id,
        reviewed_at = decision_time, review_notes = normalized_notes
    where request.id = selected_request.id;

    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id, occurred_at,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces,
      previous_location_id, new_location_id,
      reason_code, reason_notes, adjustment_request_id,
      idempotency_key, metadata
    ) values (
      selected_pallet.id, 'adjustment_rejected', actor_id, decision_time,
      selected_pallet.current_boxes, 0, selected_pallet.current_boxes,
      selected_pallet.current_pieces, 0, selected_pallet.current_pieces,
      selected_pallet.current_location_id, selected_pallet.current_location_id,
      'supervisor_rejection', normalized_notes, selected_request.id,
      normalized_key, pg_catalog.jsonb_build_object(
        'reviewer_name', actor_name,
        'lifecycle_status', selected_pallet.lifecycle_status
      )
    ) returning id into event_id;
  end if;

  return query
  select request.id, pallet.id, pallet.pallet_code, part.part_number,
    request.status, transaction.actor_user_id,
    transaction.metadata ->> 'reviewer_name', transaction.occurred_at,
    location.id, location.location_code,
    (transaction.metadata ->> 'lifecycle_status')::public.pallet_lifecycle_status,
    transaction.previous_boxes, transaction.box_change, transaction.new_boxes,
    transaction.previous_pieces, transaction.piece_change, transaction.new_pieces,
    transaction.reason_notes, transaction.id
  from public.inventory_transactions as transaction
  join public.adjustment_requests as request on request.id = transaction.adjustment_request_id
  join public.pallets as pallet on pallet.id = transaction.pallet_id
  join public.parts as part on part.id = pallet.part_id
  left join public.locations as location on location.id = transaction.previous_location_id
  where transaction.id = event_id;
end;
$$;

revoke all on function public.approve_adjustment_request(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.approve_adjustment_request(uuid, text, text)
to authenticated;
revoke all on function public.reject_adjustment_request(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.reject_adjustment_request(uuid, text, text)
to authenticated;

comment on column public.pallets.inventory_version is
  'Increments on every pallet update so supervisor review detects moves away and back, holds, releases, and quantity changes.';
comment on column public.adjustment_requests.count_inventory_version is
  'Captured by a trigger at request insertion. NULL for pre-Mission-10 requests, which cannot be approved without a new Count.';
comment on function public.approve_adjustment_request(uuid, text, text) is
  'Supervisor-only, idempotent, stale-safe approval that atomically applies a positive final box balance and appends adjustment_approved history.';
comment on function public.reject_adjustment_request(uuid, text, text) is
  'Supervisor-only, idempotent rejection that preserves inventory and appends zero-delta adjustment_rejected history.';
