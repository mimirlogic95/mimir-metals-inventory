-- Fictional Mission 10 fixtures and decisions exist only inside this transaction.
begin;

create function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

create function pg_temp.assert_raises(role_name text, actor text, statement text, expected text)
returns void language plpgsql as $$
declare actual text;
begin
  perform set_config('request.jwt.claim.sub', actor, true);
  execute 'set local role ' || quote_ident(role_name);
  begin
    execute statement;
    raise exception 'DID NOT FAIL';
  exception when others then get stacked diagnostics actual = message_text;
  end;
  execute 'reset role';
  if position(expected in actual) = 0 then
    raise exception 'Expected %, got %', expected, actual;
  end if;
exception when others then execute 'reset role'; raise;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.approve_adjustment_request(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reject_adjustment_request(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_adjustment_request(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reject_adjustment_request(uuid,text,text)', 'EXECUTE'),
  'only authenticated may execute adjustment decisions'
);
select pg_temp.assert_true(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']::text[])
   from pg_proc where oid in (
     'public.approve_adjustment_request(uuid,text,text)'::regprocedure,
     'public.reject_adjustment_request(uuid,text,text)'::regprocedure)),
  'decision RPCs have security definer and empty search paths'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.adjustment_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT'),
  'browser cannot bypass protected decisions'
);

insert into auth.users (id) values
  ('95100000-0000-4000-8000-000000000001'),
  ('95100000-0000-4000-8000-000000000002'),
  ('95100000-0000-4000-8000-000000000003'),
  ('95100000-0000-4000-8000-000000000004');
insert into public.profiles (id, display_name, role, active) values
  ('95100000-0000-4000-8000-000000000001', 'Mission 10 Fictional Worker', 'worker', true),
  ('95100000-0000-4000-8000-000000000002', 'Mission 10 Fictional Supervisor A', 'supervisor', true),
  ('95100000-0000-4000-8000-000000000003', 'Mission 10 Fictional Supervisor B', 'supervisor', true),
  ('95100000-0000-4000-8000-000000000004', 'Mission 10 Inactive Supervisor', 'supervisor', false);
insert into public.parts (id, part_number, description, product_family) values
  ('96100000-0000-4000-8000-000000000001', 'MM-M10-TEST', 'Fictional Adjustment Test Part', 'Fictional Test Family');
insert into public.locations (id, location_code, location_type) values
  ('98100000-0000-4000-8000-000000000001', 'M10-RACK-A', 'rack'),
  ('98100000-0000-4000-8000-000000000002', 'M10-RACK-B', 'rack'),
  ('98100000-0000-4000-8000-000000000003', 'M10-RACK-C', 'rack'),
  ('98100000-0000-4000-8000-000000000004', 'M10-RACK-D', 'rack'),
  ('98100000-0000-4000-8000-000000000005', 'M10-RACK-E', 'rack'),
  ('98100000-0000-4000-8000-000000000006', 'M10-RACK-F', 'rack'),
  ('98100000-0000-4000-8000-000000000007', 'M10-RACK-G', 'rack'),
  ('98100000-0000-4000-8000-000000000008', 'M10-RACK-H', 'rack'),
  ('98100000-0000-4000-8000-000000000009', 'M10-RACK-I', 'rack'),
  ('98100000-0000-4000-8000-000000000010', 'M10-RACK-J', 'rack');
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
)
select ('97100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'MM-P-980000' || n, '96100000-0000-4000-8000-000000000001',
  'M10-HEAT-' || n, 'M10-LOT-' || n,
  '95100000-0000-4000-8000-000000000001',
  700, 48, 31, 21700, 31, 21700,
  ('98100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 3 then 'on_hold'::public.pallet_lifecycle_status
    else 'stored'::public.pallet_lifecycle_status end,
  case when n = 3 then 'stored'::public.pallet_lifecycle_status else null end,
  case when n = 3 then 'Fictional inspection hold' else null end
from generate_series(1, 8) as n;
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status
) values (
  '97100000-0000-4000-8000-000000000009', 'MM-P-9800009',
  '96100000-0000-4000-8000-000000000001', 'M10-HEAT-9', 'M10-LOT-9',
  '95100000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700,
  '98100000-0000-4000-8000-000000000010', 'stored'
);

create temporary table count_results as
select 'template'::text as attempt, result.*
from public.count_pallet(null, 0, 0, 0, null, null, null, null) as result with no data;
grant insert, select on pg_temp.count_results to authenticated;
select set_config('request.jwt.claim.sub', '95100000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into pg_temp.count_results
select 'negative', result.* from public.count_pallet('MM-P-9800001', 29, 31, 21700,
  '98100000-0000-4000-8000-000000000001', 'other', 'Fictional discrepancy', 'm10-count-1') as result;
insert into pg_temp.count_results
select 'positive', result.* from public.count_pallet('MM-P-9800002', 33, 31, 21700,
  '98100000-0000-4000-8000-000000000002', 'other', null, 'm10-count-2') as result;
insert into pg_temp.count_results
select 'held', result.* from public.count_pallet('MM-P-9800003', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000003', 'other', null, 'm10-count-3') as result;
insert into pg_temp.count_results
select 'zero', result.* from public.count_pallet('MM-P-9800004', 0, 31, 21700,
  '98100000-0000-4000-8000-000000000004', 'other', null, 'm10-count-4') as result;
insert into pg_temp.count_results
select 'stale', result.* from public.count_pallet('MM-P-9800005', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000005', 'other', null, 'm10-count-5') as result;
insert into pg_temp.count_results
select 'reject', result.* from public.count_pallet('MM-P-9800006', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000006', 'other', null, 'm10-count-6') as result;
insert into pg_temp.count_results
select 'legacy', result.* from public.count_pallet('MM-P-9800008', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000008', 'other', null, 'm10-count-8') as result;
insert into pg_temp.count_results
select 'hold-cycle', result.* from public.count_pallet('MM-P-9800009', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000010', 'other', null, 'm10-count-9') as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 8 and bool_and(count_inventory_version = 0)
    from public.adjustment_requests where pallet_id in
      (select pallet_id from pg_temp.count_results where adjustment_request_id is not null)),
  'new requests capture authoritative count-time pallet version'
);
select pg_temp.assert_true(
  (select bool_and(count_lifecycle_status = 'on_hold'
    and count_lifecycle_status_before_hold = 'stored'
   ) from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'held')),
  'held count preserves its stored pre-hold state'
);

select pg_temp.assert_raises('anon', '',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), null, 'm10-anon')$$,
  'permission denied');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000001',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), null, 'm10-worker')$$,
  'SUPERVISOR ACCESS REQUIRED');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000004',
  $$select * from public.reject_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), 'Investigate', 'm10-inactive')$$,
  'SUPERVISOR ACCESS REQUIRED');
select pg_temp.assert_raises('authenticated', '',
  $$select * from public.reject_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), 'Investigate', 'm10-no-auth')$$,
  'AUTHENTICATION REQUIRED');

create temporary table decision_results as
select 'template'::text as attempt, result.*
from public.approve_adjustment_request(null, null, null) as result with no data;
grant insert, select on pg_temp.decision_results to authenticated;
select set_config('request.jwt.claim.sub', '95100000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into pg_temp.decision_results
select 'negative', result.* from public.approve_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'negative'),
  'Fictional recount confirmed', 'm10-approve-1') as result;
insert into pg_temp.decision_results
select 'retry', result.* from public.approve_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'negative'),
  'Fictional recount confirmed', 'm10-approve-1') as result;
insert into pg_temp.decision_results
select 'positive', result.* from public.approve_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'positive'),
  null, 'm10-approve-2') as result;
insert into pg_temp.decision_results
select 'held', result.* from public.approve_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'held'),
  null, 'm10-approve-3') as result;
insert into pg_temp.decision_results
select 'reject', result.* from public.reject_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'reject'),
  'Recount required', 'm10-reject-6') as result;
insert into pg_temp.decision_results
select 'reject-retry', result.* from public.reject_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'reject'),
  'Recount required', 'm10-reject-6') as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct transaction_id) = 1
    and bool_and(before_boxes = 31 and box_change = -2 and after_boxes = 29
      and before_pieces = 21700 and piece_change = -1400 and after_pieces = 20300)
   from pg_temp.decision_results where attempt in ('negative', 'retry')),
  'negative approval and exact retry return one correct immutable event'
);
select pg_temp.assert_true(
  (select bool_and(before_boxes = 31 and box_change = 2 and after_boxes = 33
    and before_pieces = 21700 and piece_change = 1400 and after_pieces = 23100
   ) from pg_temp.decision_results where attempt = 'positive'),
  'positive approval uses snapshot math'
);
select pg_temp.assert_true(
  (select bool_and(current_boxes = 29 and current_pieces = 20300
    and lifecycle_status = 'stored' and current_location_id = '98100000-0000-4000-8000-000000000001'
    and inventory_version = 1) from public.pallets where pallet_code = 'MM-P-9800001'),
  'approval changes only current quantity and bumps freshness version once'
);
select pg_temp.assert_true(
  (select bool_and(current_boxes = 30 and current_pieces = 21000
    and lifecycle_status = 'on_hold' and lifecycle_status_before_hold = 'stored'
    and hold_reason = 'Fictional inspection hold')
   from public.pallets where pallet_code = 'MM-P-9800003'),
  'approved held pallet stays held in the same rack'
);
select pg_temp.assert_true(
  (select bool_and(status = 'approved' and reviewed_by_user_id = '95100000-0000-4000-8000-000000000002'
    and reviewed_at is not null and review_notes = 'Fictional recount confirmed')
   from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'negative')),
  'approval records supervisor and time without replacing worker reason'
);
select pg_temp.assert_true(
  (select bool_and(transaction_type = 'adjustment_approved'
    and previous_location_id = new_location_id and previous_boxes = 31
    and box_change = -2 and new_boxes = 29 and previous_pieces = 21700
    and piece_change = -1400 and new_pieces = 20300
    and actor_user_id = '95100000-0000-4000-8000-000000000002')
   from public.inventory_transactions where idempotency_key = 'm10-approve-1'),
  'approval audit event has authoritative actor, location, and full before/change/after'
);
select pg_temp.assert_true(
  (select bool_and(status = 'rejected' and review_notes = 'Recount required'
    and reviewed_at is not null) from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'reject'))
  and (select bool_and(current_boxes = 31 and current_pieces = 21700)
    from public.pallets where pallet_code = 'MM-P-9800006')
  and (select bool_and(box_change = 0 and piece_change = 0)
    from public.inventory_transactions where idempotency_key = 'm10-reject-6'),
  'rejection captures reason, leaves inventory unchanged, and writes one zero-delta event'
);
select pg_temp.assert_true(
  (select count(*) = 8 and bool_and(box_change = 0 and piece_change = 0)
   from public.inventory_transactions where idempotency_key like 'm10-count-%'),
  'original Count evidence remains immutable and zero-delta'
);

select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'zero'), null, 'm10-zero')$$,
  'ZERO BALANCE NOT SUPPORTED');
select pg_temp.assert_true(
  (select bool_and(status = 'pending') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'zero'))
  and (select bool_and(current_boxes = 31 and current_pieces = 21700)
    from public.pallets where pallet_code = 'MM-P-9800004'),
  'zero-result approval leaves request, pallet, and rack untouched'
);
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'positive'), null, 'm10-approve-2-changed')$$,
  'REQUEST ALREADY RESOLVED');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.reject_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), 'Recount', 'm10-reject-approved')$$,
  'REQUEST ALREADY RESOLVED');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), 'Changed note', 'm10-approve-1')$$,
  'IDEMPOTENCY CONFLICT');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000003',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'negative'), 'Fictional recount confirmed', 'm10-approve-1')$$,
  'IDEMPOTENCY CONFLICT');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.reject_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'reject'), 'Changed reason', 'm10-reject-6')$$,
  'IDEMPOTENCY CONFLICT');

-- Simulate a move away and back: current rack matches Count, version does not.
update public.pallets set current_location_id = '98100000-0000-4000-8000-000000000009'
where pallet_code = 'MM-P-9800005';
update public.pallets set current_location_id = '98100000-0000-4000-8000-000000000005'
where pallet_code = 'MM-P-9800005';
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'stale'), null, 'm10-stale')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_true(
  (select bool_and(status = 'pending') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'stale'))
  and (select bool_and(current_boxes = 31 and inventory_version = 2)
   from public.pallets where pallet_code = 'MM-P-9800005'),
  'move-away-and-return cannot make request fresh again'
);

-- Legacy pending requests have no reconstructed count context and require a recount.
update public.pallets set current_boxes = 30, current_pieces = 21000
where pallet_code = 'MM-P-9800008';
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'legacy'), null, 'm10-stale-quantity')$$,
  'INVENTORY CHANGED');
update public.pallets set current_boxes = 31, current_pieces = 21700
where pallet_code = 'MM-P-9800008';
update public.adjustment_requests set count_inventory_version = null,
  count_lifecycle_status = null, count_lifecycle_status_before_hold = null
where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'legacy');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'legacy'), null, 'm10-legacy')$$,
  'INVENTORY CHANGED');

update public.pallets set lifecycle_status = 'on_hold',
  lifecycle_status_before_hold = 'stored', hold_reason = 'Fictional hold cycle'
where pallet_code = 'MM-P-9800009';
update public.pallets set lifecycle_status = 'stored',
  lifecycle_status_before_hold = null, hold_reason = null
where pallet_code = 'MM-P-9800009';
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'hold-cycle'), null, 'm10-hold-cycle')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_true(
  (select bool_and(current_boxes = 31 and lifecycle_status = 'stored' and inventory_version = 2)
   from public.pallets where pallet_code = 'MM-P-9800009')
  and (select bool_and(status = 'pending') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'hold-cycle')),
  'hold then release does not make a stale request fresh'
);

select set_config('request.jwt.claim.sub', '95100000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into pg_temp.count_results
select 'self', result.* from public.count_pallet('MM-P-9800007', 30, 31, 21700,
  '98100000-0000-4000-8000-000000000007', 'other', null, 'm10-count-self') as result;
reset role;
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'self'), null, 'm10-self')$$,
  'CANNOT APPROVE OWN REQUEST');
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.reject_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'zero'), '', 'm10-reject-empty')$$,
  'REJECTION REASON REQUIRED');

-- A failed decision update rolls back an earlier quantity update in the same RPC.
create function pg_temp.fail_approval_status()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and new.id = (
    select adjustment_request_id from pg_temp.count_results where attempt = 'self'
  ) then
    raise exception 'FICTIONAL DECISION FAILURE';
  end if;
  return new;
end;
$$;
create trigger m10_force_decision_failure before update on public.adjustment_requests
for each row execute function pg_temp.fail_approval_status();
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000003',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'self'), null, 'm10-force-decision')$$,
  'FICTIONAL DECISION FAILURE');
drop trigger m10_force_decision_failure on public.adjustment_requests;
select pg_temp.assert_true(
  (select bool_and(current_boxes = 31 and current_pieces = 21700 and inventory_version = 0)
   from public.pallets where pallet_code = 'MM-P-9800007')
  and (select bool_and(status = 'pending') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'self'))
  and not exists (select 1 from public.inventory_transactions
    where idempotency_key = 'm10-force-decision'),
  'failed request status update rolls back pallet quantity/version and event'
);

-- A failed audit insert rolls back both decision status and quantity.
create function pg_temp.fail_approval_audit()
returns trigger language plpgsql as $$
begin
  if new.idempotency_key = 'm10-force-audit' then
    raise exception 'FICTIONAL AUDIT FAILURE';
  end if;
  return new;
end;
$$;
create trigger m10_force_audit_failure before insert on public.inventory_transactions
for each row execute function pg_temp.fail_approval_audit();
select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000003',
  $$select * from public.approve_adjustment_request((select adjustment_request_id from pg_temp.count_results where attempt = 'self'), null, 'm10-force-audit')$$,
  'FICTIONAL AUDIT FAILURE');
drop trigger m10_force_audit_failure on public.inventory_transactions;
select pg_temp.assert_true(
  (select bool_and(current_boxes = 31 and current_pieces = 21700 and inventory_version = 0)
   from public.pallets where pallet_code = 'MM-P-9800007')
  and (select bool_and(status = 'pending') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'self'))
  and not exists (select 1 from public.inventory_transactions
    where idempotency_key = 'm10-force-audit'),
  'failed audit insert rolls back pallet and request changes'
);

select pg_temp.assert_raises('authenticated', '95100000-0000-4000-8000-000000000002',
  $$select * from public.approve_adjustment_request('95100000-0000-4000-8000-000000000099', null, 'm10-missing')$$,
  'REQUEST NOT FOUND');

-- A rejection can close a zero Count without changing inventory.
select set_config('request.jwt.claim.sub', '95100000-0000-4000-8000-000000000002', true);
set local role authenticated;
select * from public.reject_adjustment_request(
  (select adjustment_request_id from pg_temp.count_results where attempt = 'zero'),
  'Recount and investigate zero reading', 'm10-reject-zero');
reset role;
select pg_temp.assert_true(
  (select bool_and(status = 'rejected') from public.adjustment_requests
   where id = (select adjustment_request_id from pg_temp.count_results where attempt = 'zero'))
  and (select bool_and(current_boxes = 31 and current_location_id = '98100000-0000-4000-8000-000000000004')
    from public.pallets where pallet_code = 'MM-P-9800004'),
  'zero Count rejection preserves quantity and rack occupancy'
);

rollback;
