-- Mission 8 fictional Move checks. Run only on verified development PostgreSQL.
-- All fixtures and events are rolled back.
begin;

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', failure_message; end if;
end;
$$;

create function pg_temp.assert_call_raises(actor_id text, statement text, expected_message text)
returns void language plpgsql as $$
declare actual_message text;
begin
  perform set_config('request.jwt.claim.sub', actor_id, true);
  execute 'set local role authenticated';
  begin
    execute statement;
    raise exception 'DID NOT FAIL';
  exception when others then
    get stacked diagnostics actual_message = message_text;
  end;
  execute 'reset role';
  if position(expected_message in actual_message) = 0 then
    raise exception 'Expected %, got %', expected_message, actual_message;
  end if;
exception when others then execute 'reset role'; raise;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.move_pallet(text, uuid, uuid, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.move_pallet(text, uuid, uuid, text)', 'EXECUTE'),
  'only authenticated role may execute Move'
);
select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=""']::text[]
   from pg_proc where oid = 'public.move_pallet(text, uuid, uuid, text)'::regprocedure),
  'Move uses security definer and empty search_path'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'DELETE'),
  'browser cannot directly mutate pallet or audit history'
);

insert into auth.users (id) values
  ('95800000-0000-4000-8000-000000000001'),
  ('95800000-0000-4000-8000-000000000002'),
  ('95800000-0000-4000-8000-000000000003'),
  ('95800000-0000-4000-8000-000000000004');
insert into public.profiles (id, display_name, role, active) values
  ('95800000-0000-4000-8000-000000000001', 'Mission 8 Fictional Worker', 'worker', true),
  ('95800000-0000-4000-8000-000000000002', 'Mission 8 Fictional Supervisor', 'supervisor', true),
  ('95800000-0000-4000-8000-000000000003', 'Mission 8 Inactive Worker', 'worker', false),
  ('95800000-0000-4000-8000-000000000004', 'Mission 8 Second Worker', 'worker', true);
insert into public.parts (id, part_number, description, product_family) values
  ('96800000-0000-4000-8000-000000000001', 'MM-M8-TEST', 'Fictional Move Test Part', 'Fictional Test Family');
insert into public.locations (id, location_code, location_type, active) values
  ('98800000-0000-4000-8000-000000000001', 'M8-SOURCE-A', 'rack', true),
  ('98800000-0000-4000-8000-000000000002', 'M8-SOURCE-B', 'rack', true),
  ('98800000-0000-4000-8000-000000000003', 'M8-OPEN-A', 'rack', true),
  ('98800000-0000-4000-8000-000000000004', 'M8-OPEN-B', 'rack', true),
  ('98800000-0000-4000-8000-000000000005', 'M8-HELD-RACK', 'rack', true),
  ('98800000-0000-4000-8000-000000000006', 'M8-INACTIVE', 'rack', false),
  ('98800000-0000-4000-8000-000000000007', 'M8-PACKING', 'packing', true),
  ('98800000-0000-4000-8000-000000000008', 'M8-STAGING', 'shipping_staging', true),
  ('98800000-0000-4000-8000-000000000009', 'M8-ATOMIC', 'rack', true);

insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97800000-0000-4000-8000-000000000001', 'MM-P-9800001', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-1', 'M8-FICTIONAL-LOT-1', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98800000-0000-4000-8000-000000000001', 'stored', null, null),
  ('97800000-0000-4000-8000-000000000002', 'MM-P-9800002', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-2', 'M8-FICTIONAL-LOT-2', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98800000-0000-4000-8000-000000000002', 'stored', null, null),
  ('97800000-0000-4000-8000-000000000003', 'MM-P-9800003', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-3', 'M8-FICTIONAL-LOT-3', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, null, 'created', null, null),
  ('97800000-0000-4000-8000-000000000004', 'MM-P-9800004', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-4', 'M8-FICTIONAL-LOT-4', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, null, 'shipped', null, null),
  ('97800000-0000-4000-8000-000000000005', 'MM-P-9800005', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-5', 'M8-FICTIONAL-LOT-5', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98800000-0000-4000-8000-000000000005', 'on_hold', 'stored', 'Fictional inspection hold'),
  ('97800000-0000-4000-8000-000000000006', 'MM-P-9800006', '96800000-0000-4000-8000-000000000001', 'M8-FICTIONAL-HEAT-6', 'M8-FICTIONAL-LOT-6', '95800000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98800000-0000-4000-8000-000000000007', 'stored', null, null);

create temporary table move_before as
select packed_at, heat_number, lot_number, machine_code, part_id
from public.pallets where pallet_code = 'MM-P-9800001';

create temporary table move_results as
select 'first'::text as attempt, result.*
from public.move_pallet('none', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000003', 'm8-template') as result
with no data;
grant insert, select on pg_temp.move_results to authenticated;

select set_config('request.jwt.claim.sub', '95800000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into pg_temp.move_results select 'first', result.* from public.move_pallet(
  'mm-p-9800001', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000003', 'm8-first') as result;
insert into pg_temp.move_results select 'retry', result.* from public.move_pallet(
  'MM-P-9800001', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000003', 'm8-first') as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct transaction_id) = 1 and bool_and(previous_location_code = 'M8-SOURCE-A') and bool_and(destination_location_code = 'M8-OPEN-A')
   from pg_temp.move_results),
  'exact retry returns original Move result'
);
select pg_temp.assert_true(
  (select lifecycle_status = 'stored' and current_location_id = '98800000-0000-4000-8000-000000000003'
    and current_boxes = 31 and current_pieces = 21700 and original_boxes = 31 and original_pieces = 21700
    and pieces_per_box_snapshot = 700 and boxes_per_full_pallet_snapshot = 48
   from public.pallets where pallet_code = 'MM-P-9800001'),
  'Move changes only current location, not lifecycle or quantities'
);
select pg_temp.assert_true(
  (select pallet.packed_at = before.packed_at
    and pallet.heat_number = before.heat_number
    and pallet.lot_number = before.lot_number
    and pallet.machine_code is not distinct from before.machine_code
    and pallet.part_id = before.part_id
   from public.pallets as pallet cross join pg_temp.move_before as before
   where pallet.pallet_code = 'MM-P-9800001'),
  'Move preserves packed_at FIFO age and manufacturing details'
);
select pg_temp.assert_true(
  (select count(*) = 1 and min(previous_boxes) = 31 and min(box_change) = 0 and min(new_boxes) = 31
    and min(previous_pieces) = 21700 and min(piece_change) = 0 and min(new_pieces) = 21700
    and bool_and(previous_location_id = '98800000-0000-4000-8000-000000000001')
    and bool_and(new_location_id = '98800000-0000-4000-8000-000000000003')
    and bool_and(actor_user_id = '95800000-0000-4000-8000-000000000001')
   from public.inventory_transactions where idempotency_key = 'm8-first'),
  'Move writes one exact source/destination and zero-quantity audit event'
);

select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800001', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000004', 'm8-stale')$$, 'LOCATION CHANGED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000003', 'm8-occupied')$$, 'LOCATION OCCUPIED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000005', 'm8-held-occupied')$$, 'LOCATION OCCUPIED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000002', 'm8-same')$$, 'SAME LOCATION');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000006', 'm8-inactive')$$, 'LOCATION INACTIVE');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000007', 'm8-packing')$$, 'LOCATION NOT A RACK');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000008', 'm8-staging')$$, 'LOCATION NOT A RACK');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000099', 'm8-missing-dest')$$, 'LOCATION NOT FOUND');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800099', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000004', 'm8-missing-pallet')$$, 'PALLET NOT FOUND');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800003', null, '98800000-0000-4000-8000-000000000004', 'm8-created')$$, 'PALLET NOT STORED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800004', null, '98800000-0000-4000-8000-000000000004', 'm8-shipped')$$, 'PALLET SHIPPED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800005', '98800000-0000-4000-8000-000000000005', '98800000-0000-4000-8000-000000000004', 'm8-held')$$, 'PALLET ON HOLD');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800006', '98800000-0000-4000-8000-000000000007', '98800000-0000-4000-8000-000000000004', 'm8-non-rack-source')$$, 'PALLET NOT STORED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800001', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000004', 'm8-first')$$, 'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000004',
  $$select * from public.move_pallet('MM-P-9800001', '98800000-0000-4000-8000-000000000001', '98800000-0000-4000-8000-000000000003', 'm8-first')$$, 'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000004', 'm8-no-auth')$$, 'AUTHENTICATION REQUIRED');
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000003',
  $$select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000004', 'm8-inactive-worker')$$, 'ACTIVE WORKER PROFILE REQUIRED');

select set_config('request.jwt.claim.sub', '95800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select * from public.move_pallet('MM-P-9800002', '98800000-0000-4000-8000-000000000002', '98800000-0000-4000-8000-000000000004', 'm8-supervisor');
reset role;
select pg_temp.assert_true(
  (select current_location_id = '98800000-0000-4000-8000-000000000004' and lifecycle_status = 'stored'
    from public.pallets where pallet_code = 'MM-P-9800002'),
  'active supervisor can move stored pallet'
);

create function pg_temp.force_move_history_failure() returns trigger
language plpgsql as $$
begin
  if new.idempotency_key = 'm8-atomic-failure' then
    raise exception 'MISSION 8 FORCED HISTORY FAILURE';
  end if;
  return new;
end;
$$;
create trigger m8_force_move_history_failure
before insert on public.inventory_transactions
for each row execute function pg_temp.force_move_history_failure();
select pg_temp.assert_call_raises('95800000-0000-4000-8000-000000000001',
  $$select * from public.move_pallet('MM-P-9800001', '98800000-0000-4000-8000-000000000003', '98800000-0000-4000-8000-000000000009', 'm8-atomic-failure')$$,
  'MISSION 8 FORCED HISTORY FAILURE');
select pg_temp.assert_true(
  (select current_location_id = '98800000-0000-4000-8000-000000000003'
    from public.pallets where pallet_code = 'MM-P-9800001')
    and not exists (select 1 from public.inventory_transactions where idempotency_key = 'm8-atomic-failure'),
  'failed history insert rolls back location change'
);

rollback;
