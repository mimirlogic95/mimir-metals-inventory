-- Mission 9 fictional Count checks against verified development PostgreSQL.
-- The outer transaction rolls back every fixture and event.
begin;

create function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

create function pg_temp.assert_call_raises(actor text, statement text, expected text)
returns void language plpgsql as $$
declare actual text;
begin
  perform set_config('request.jwt.claim.sub', actor, true);
  execute 'set local role authenticated';
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
  has_function_privilege('authenticated', 'public.count_pallet(text, integer, integer, integer, uuid, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.count_pallet(text, integer, integer, integer, uuid, text, text, text)', 'EXECUTE'),
  'only authenticated may execute Count'
);
select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=""']::text[]
   from pg_proc where oid = 'public.count_pallet(text, integer, integer, integer, uuid, text, text, text)'::regprocedure),
  'Count is security definer with empty search path'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.adjustment_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT'),
  'browser cannot directly change quantity or create protected records'
);

insert into auth.users (id) values
  ('95900000-0000-4000-8000-000000000001'),
  ('95900000-0000-4000-8000-000000000002'),
  ('95900000-0000-4000-8000-000000000003'),
  ('95900000-0000-4000-8000-000000000004');
insert into public.profiles (id, display_name, role, active) values
  ('95900000-0000-4000-8000-000000000001', 'Mission 9 Fictional Worker', 'worker', true),
  ('95900000-0000-4000-8000-000000000002', 'Mission 9 Fictional Supervisor', 'supervisor', true),
  ('95900000-0000-4000-8000-000000000003', 'Mission 9 Inactive Worker', 'worker', false),
  ('95900000-0000-4000-8000-000000000004', 'Mission 9 Second Worker', 'worker', true);
insert into public.parts (id, part_number, description, product_family) values
  ('96900000-0000-4000-8000-000000000001', 'MM-M9-TEST', 'Fictional Count Test Part', 'Fictional Test Family');
insert into public.locations (id, location_code, location_type) values
  ('98900000-0000-4000-8000-000000000001', 'M9-RACK-A', 'rack'),
  ('98900000-0000-4000-8000-000000000002', 'M9-RACK-B', 'rack'),
  ('98900000-0000-4000-8000-000000000003', 'M9-RACK-C', 'rack'),
  ('98900000-0000-4000-8000-000000000004', 'M9-RACK-D', 'rack'),
  ('98900000-0000-4000-8000-000000000005', 'M9-PACKING', 'packing'),
  ('98900000-0000-4000-8000-000000000006', 'M9-STAGING', 'shipping_staging'),
  ('98900000-0000-4000-8000-000000000007', 'M9-RACK-E', 'rack');
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97900000-0000-4000-8000-000000000001', 'MM-P-9900001', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-1', 'M9-LOT-1', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98900000-0000-4000-8000-000000000001', 'stored', null, null),
  ('97900000-0000-4000-8000-000000000002', 'MM-P-9900002', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-2', 'M9-LOT-2', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98900000-0000-4000-8000-000000000002', 'stored', null, null),
  ('97900000-0000-4000-8000-000000000003', 'MM-P-9900003', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-3', 'M9-LOT-3', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98900000-0000-4000-8000-000000000003', 'on_hold', 'stored', 'Fictional inspection hold'),
  ('97900000-0000-4000-8000-000000000004', 'MM-P-9900004', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-4', 'M9-LOT-4', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, null, 'created', null, null),
  ('97900000-0000-4000-8000-000000000005', 'MM-P-9900005', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-5', 'M9-LOT-5', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 0, 0, null, 'shipped', null, null),
  ('97900000-0000-4000-8000-000000000006', 'MM-P-9900006', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-6', 'M9-LOT-6', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98900000-0000-4000-8000-000000000006', 'shipping_staging', null, null),
  ('97900000-0000-4000-8000-000000000007', 'MM-P-9900007', '96900000-0000-4000-8000-000000000001', 'M9-HEAT-7', 'M9-LOT-7', '95900000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98900000-0000-4000-8000-000000000007', 'stored', null, null);

create temporary table count_results as
select 'first'::text as attempt, result.*
from public.count_pallet('none', 0, 0, 0, null, null, null, 'template') as result
with no data;
grant insert, select on pg_temp.count_results to authenticated;

select set_config('request.jwt.claim.sub', '95900000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into pg_temp.count_results select 'match', result.* from public.count_pallet(
  'mm-p-9900001', 31, 31, 21700, '98900000-0000-4000-8000-000000000001', null, null, 'm9-match') as result;
insert into pg_temp.count_results select 'retry', result.* from public.count_pallet(
  'MM-P-9900001', 31, 31, 21700, '98900000-0000-4000-8000-000000000001', null, null, 'm9-match') as result;
insert into pg_temp.count_results select 'lower', result.* from public.count_pallet(
  'MM-P-9900002', 29, 31, 21700, '98900000-0000-4000-8000-000000000002', 'other', 'Fictional box count difference', 'm9-lower') as result;
insert into pg_temp.count_results select 'lower-retry', result.* from public.count_pallet(
  'MM-P-9900002', 29, 31, 21700, '98900000-0000-4000-8000-000000000002', 'other', 'Fictional box count difference', 'm9-lower') as result;
insert into pg_temp.count_results select 'zero', result.* from public.count_pallet(
  'MM-P-9900003', 0, 31, 21700, '98900000-0000-4000-8000-000000000003', 'count_error', null, 'm9-zero') as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct transaction_id) = 1 and bool_and(outcome = 'matched')
    and bool_and(adjustment_request_id is null) from pg_temp.count_results where attempt in ('match', 'retry')),
  'matched exact retry returns original event, no request'
);
select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct transaction_id) = 1 and count(distinct adjustment_request_id) = 1
    and bool_and(system_boxes = 31 and counted_boxes = 29 and box_difference = -2
      and system_pieces = 21700 and counted_pieces = 20300 and piece_difference = -1400)
   from pg_temp.count_results where attempt in ('lower', 'lower-retry')),
  'lower discrepancy uses snapshot math and exact retry'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(counted_boxes = 0 and counted_pieces = 0
    and box_difference = -31 and piece_difference = -21700)
   from pg_temp.count_results where attempt = 'zero'),
  'zero physical count becomes request, not inventory depletion'
);
select pg_temp.assert_true(
  (select count(*) = 3 and bool_and(current_boxes = 31 and current_pieces = 21700)
   from public.pallets where pallet_code in ('MM-P-9900001', 'MM-P-9900002', 'MM-P-9900003')),
  'all count outcomes preserve authoritative pallet quantities'
);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(status = 'pending')
    and bool_and(reviewed_by_user_id is null and reviewed_at is null)
    and bool_and(count_location_id is not null)
   from public.adjustment_requests where pallet_id in (
     '97900000-0000-4000-8000-000000000002', '97900000-0000-4000-8000-000000000003')),
  'only discrepancies create pending requests with count location'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(transaction_type = 'count_matched' and box_change = 0 and piece_change = 0
    and previous_boxes = 31 and new_boxes = 31 and previous_pieces = 21700 and new_pieces = 21700
    and previous_location_id = new_location_id and actor_user_id = '95900000-0000-4000-8000-000000000001')
   from public.inventory_transactions where idempotency_key = 'm9-match'),
  'matched audit event has zero delta and actor/location context'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(transaction_type = 'adjustment_requested' and box_change = 0 and piece_change = 0
    and adjustment_request_id is not null and previous_location_id = new_location_id)
   from public.inventory_transactions where idempotency_key = 'm9-lower'),
  'discrepancy audit event does not adjust inventory'
);

select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900002', 30, 31, 21700, '98900000-0000-4000-8000-000000000002', 'other', null, 'm9-pending')$$,
  'ADJUSTMENT ALREADY PENDING');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', 30, 30, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-stale-box')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', 30, 31, 21000, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-stale-piece')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', 30, 31, 21700, '98900000-0000-4000-8000-000000000002', 'other', null, 'm9-stale-location')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', -1, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-negative')$$,
  'INVALID COUNT');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900004', 30, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-created')$$,
  'PALLET NOT COUNTABLE');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900005', 30, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-shipped')$$,
  'PALLET SHIPPED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900006', 30, 31, 21700, '98900000-0000-4000-8000-000000000006', 'other', null, 'm9-staging')$$,
  'PALLET NOT COUNTABLE');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900099', 30, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-missing')$$,
  'PALLET NOT FOUND');
select pg_temp.assert_call_raises('',
  $$select * from public.count_pallet('MM-P-9900007', 31, 31, 21700, '98900000-0000-4000-8000-000000000007', null, null, 'm9-no-auth')$$,
  'AUTHENTICATION REQUIRED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000003',
  $$select * from public.count_pallet('MM-P-9900007', 31, 31, 21700, '98900000-0000-4000-8000-000000000007', null, null, 'm9-inactive')$$,
  'ACTIVE WORKER PROFILE REQUIRED');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', 30, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-match')$$,
  'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000004',
  $$select * from public.count_pallet('MM-P-9900001', 31, 31, 21700, '98900000-0000-4000-8000-000000000001', null, null, 'm9-match')$$,
  'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_true(
  not exists (select 1 from public.inventory_transactions where idempotency_key like 'm9-stale-%'
    or idempotency_key in ('m9-pending', 'm9-negative')),
  'failed requests wrote no audit history'
);

select set_config('request.jwt.claim.sub', '95900000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into pg_temp.count_results select 'supervisor', result.* from public.count_pallet(
  'MM-P-9900007', 32, 31, 21700, '98900000-0000-4000-8000-000000000007', 'other', null, 'm9-higher') as result;
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(box_difference = 1 and piece_difference = 700
    and counted_pieces = 22400) from pg_temp.count_results where attempt = 'supervisor'),
  'supervisor can submit higher physical discrepancy'
);

create function pg_temp.force_count_history_failure() returns trigger language plpgsql as $$
begin
  if new.idempotency_key = 'm9-atomic-failure' then
    raise exception 'MISSION 9 FORCED HISTORY FAILURE';
  end if;
  return new;
end;
$$;
create trigger m9_force_count_history_failure before insert on public.inventory_transactions
for each row execute function pg_temp.force_count_history_failure();
select pg_temp.assert_call_raises('95900000-0000-4000-8000-000000000001',
  $$select * from public.count_pallet('MM-P-9900001', 30, 31, 21700, '98900000-0000-4000-8000-000000000001', 'other', null, 'm9-atomic-failure')$$,
  'MISSION 9 FORCED HISTORY FAILURE');
select pg_temp.assert_true(
  not exists (select 1 from public.adjustment_requests where pallet_id = '97900000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.inventory_transactions where idempotency_key = 'm9-atomic-failure'),
  'failed discrepancy event rolls back its pending request'
);

rollback;
