-- Mission 11 fictional Shipping checks. The entire fixture rolls back.
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
  has_function_privilege('authenticated', 'public.stage_pallet_for_shipping(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.ship_pallet(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, text, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.stage_pallet_for_shipping(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.ship_pallet(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, text, text, text, text)', 'EXECUTE')
  and not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT'),
  'browser roles execute only protected shipping operations'
);
select pg_temp.assert_true(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']::text[])
   from pg_proc where oid in (
     'public.stage_pallet_for_shipping(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, uuid, text)'::regprocedure,
     'public.ship_pallet(text, uuid, public.pallet_lifecycle_status, integer, integer, bigint, text, text, text, text)'::regprocedure
   )), 'both shipping RPCs are security definers with empty search paths'
);

insert into auth.users (id) values
  ('95110000-0000-4000-8000-000000000001'),
  ('95110000-0000-4000-8000-000000000002'),
  ('95110000-0000-4000-8000-000000000003'),
  ('95110000-0000-4000-8000-000000000004');
insert into public.profiles (id, display_name, role, active) values
  ('95110000-0000-4000-8000-000000000001', 'Mission 11 Fictional Worker', 'worker', true),
  ('95110000-0000-4000-8000-000000000002', 'Mission 11 Fictional Supervisor', 'supervisor', true),
  ('95110000-0000-4000-8000-000000000003', 'Mission 11 Inactive Worker', 'worker', false),
  ('95110000-0000-4000-8000-000000000004', 'Mission 11 Second Worker', 'worker', true);
insert into public.parts (id, part_number, description, product_family) values
  ('96110000-0000-4000-8000-000000000001', 'MM-M11-TEST', 'Fictional Shipping Part', 'Fictional Family');
insert into public.locations (id, location_code, location_type, active) values
  ('98110000-0000-4000-8000-000000000001', 'M11-RACK-A', 'rack', true),
  ('98110000-0000-4000-8000-000000000002', 'M11-RACK-B', 'rack', true),
  ('98110000-0000-4000-8000-000000000003', 'M11-RACK-C', 'rack', true),
  ('98110000-0000-4000-8000-000000000004', 'M11-RACK-D', 'rack', true),
  ('98110000-0000-4000-8000-000000000005', 'M11-RACK-HELD', 'rack', true),
  ('98110000-0000-4000-8000-000000000006', 'M11-PACKING', 'packing', true),
  ('98110000-0000-4000-8000-000000000007', 'M11-STAGING', 'shipping_staging', true),
  ('98110000-0000-4000-8000-000000000008', 'M11-INACTIVE', 'shipping_staging', false);
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97110000-0000-4000-8000-000000000001', 'MM-P-9110001', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-A', 'M11-LOT-A', '95110000-0000-4000-8000-000000000001', 700, 48, 48, 33600, 31, 21700, '98110000-0000-4000-8000-000000000001', 'stored', null, null),
  ('97110000-0000-4000-8000-000000000002', 'MM-P-9110002', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-B', 'M11-LOT-B', '95110000-0000-4000-8000-000000000001', 700, 48, 1, 700, 1, 700, '98110000-0000-4000-8000-000000000002', 'stored', null, null),
  ('97110000-0000-4000-8000-000000000003', 'MM-P-9110003', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-C', 'M11-LOT-C', '95110000-0000-4000-8000-000000000001', 700, 48, 12, 8400, 12, 8400, '98110000-0000-4000-8000-000000000006', 'created', null, null),
  ('97110000-0000-4000-8000-000000000004', 'MM-P-9110004', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-D', 'M11-LOT-D', '95110000-0000-4000-8000-000000000001', 700, 48, 10, 7000, 10, 7000, null, 'created', null, null),
  ('97110000-0000-4000-8000-000000000005', 'MM-P-9110005', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-E', 'M11-LOT-E', '95110000-0000-4000-8000-000000000001', 700, 48, 5, 3500, 5, 3500, '98110000-0000-4000-8000-000000000005', 'on_hold', 'stored', 'Fictional inspection hold'),
  ('97110000-0000-4000-8000-000000000006', 'MM-P-9110006', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-F', 'M11-LOT-F', '95110000-0000-4000-8000-000000000001', 700, 48, 20, 14000, 0, 0, null, 'shipped', null, null),
  ('97110000-0000-4000-8000-000000000007', 'MM-P-9110007', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-G', 'M11-LOT-G', '95110000-0000-4000-8000-000000000001', 700, 48, 31, 21700, 31, 21700, '98110000-0000-4000-8000-000000000003', 'stored', null, null),
  ('97110000-0000-4000-8000-000000000008', 'MM-P-9110008', '96110000-0000-4000-8000-000000000001', 'M11-HEAT-H', 'M11-LOT-H', '95110000-0000-4000-8000-000000000001', 700, 48, 10, 7000, 10, 7000, '98110000-0000-4000-8000-000000000004', 'stored', null, null);

create temporary table m11_original as
select packed_at, original_boxes, original_pieces, heat_number, lot_number
from public.pallets where pallet_code = 'MM-P-9110001';

do $$
begin
  begin
    update public.pallets set lifecycle_status = 'shipped'
    where pallet_code = 'MM-P-9110007';
    raise exception 'Shipped pallet with positive facility balance was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;
select pg_temp.assert_true(
  (select lifecycle_status = 'stored' and current_boxes = 31
   from public.pallets where pallet_code = 'MM-P-9110007'),
  'shipped-state constraint rejects nonzero facility inventory'
);

select pg_temp.assert_call_raises('',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,null,null,null,'m11-anon')$$,
  'AUTHENTICATION REQUIRED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000003',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,null,null,null,'m11-inactive')$$,
  'ACTIVE WORKER PROFILE REQUIRED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110003','98110000-0000-4000-8000-000000000006','created',12,8400,0,null,null,null,'m11-hot-direct')$$,
  'PALLET NOT ELIGIBLE');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110005','98110000-0000-4000-8000-000000000005','on_hold',5,3500,0,null,null,null,'m11-held')$$,
  'PALLET ON HOLD');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110006','98110000-0000-4000-8000-000000000001','shipped',1,700,0,null,null,null,'m11-already')$$,
  'ALREADY SHIPPED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110005','98110000-0000-4000-8000-000000000005','on_hold',5,3500,0,'98110000-0000-4000-8000-000000000007','m11-stage-held')$$,
  'PALLET ON HOLD');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,'98110000-0000-4000-8000-000000000008','m11-stage-inactive')$$,
  'INVALID SHIPPING LOCATION');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,'98110000-0000-4000-8000-000000000002','m11-stage-rack')$$,
  'INVALID SHIPPING LOCATION');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,'98110000-0000-4000-8000-000000000099','m11-stage-missing')$$,
  'INVALID SHIPPING LOCATION');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',30,21000,0,'98110000-0000-4000-8000-000000000007','m11-stage-stale')$$,
  'INVENTORY CHANGED');

select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000001',true);
set local role authenticated;
select * from public.stage_pallet_for_shipping(
  'mm-p-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,
  '98110000-0000-4000-8000-000000000007','m11-stage-a');
select * from public.stage_pallet_for_shipping(
  'MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,
  '98110000-0000-4000-8000-000000000007','m11-stage-a');
reset role;
select pg_temp.assert_true(
  (select current_boxes = 31 and current_pieces = 21700
     and lifecycle_status = 'shipping_staging'
     and current_location_id = '98110000-0000-4000-8000-000000000007'
     and inventory_version = 1 from public.pallets where pallet_code = 'MM-P-9110001')
  and (select count(*) = 1 and min(box_change) = 0 and min(piece_change) = 0
     and bool_and(previous_location_id = '98110000-0000-4000-8000-000000000001')
     and bool_and(new_location_id = '98110000-0000-4000-8000-000000000007')
     from public.inventory_transactions where idempotency_key = 'm11-stage-a'),
  'staging preserves quantity and writes exactly one movement event'
);
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000004',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,'98110000-0000-4000-8000-000000000007','m11-stage-a')$$,
  'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',30,21000,0,'98110000-0000-4000-8000-000000000007','m11-stage-a')$$,
  'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000001','stored',31,21700,0,null,null,null,'m11-ship-stale-location')$$,
  'INVENTORY CHANGED');

select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000002',true);
set local role authenticated;
select * from public.ship_pallet(
  'MM-P-9110001','98110000-0000-4000-8000-000000000007','shipping_staging',31,21700,1,
  ' M11-PO-001 ', ' M11-BOL-SHARED ', ' Fictional dispatch ', 'm11-ship-a');
select * from public.ship_pallet(
  'MM-P-9110001','98110000-0000-4000-8000-000000000007','shipping_staging',31,21700,1,
  'M11-PO-001', 'M11-BOL-SHARED', 'Fictional dispatch', 'm11-ship-a');
reset role;
select pg_temp.assert_true(
  (select current_boxes = 0 and current_pieces = 0 and current_location_id is null
    and lifecycle_status = 'shipped' and inventory_version = 2
    and pallet.packed_at = before.packed_at and pallet.original_boxes = before.original_boxes
    and pallet.original_pieces = before.original_pieces and pallet.heat_number = before.heat_number
    and pallet.lot_number = before.lot_number
   from public.pallets as pallet cross join pg_temp.m11_original as before
   where pallet.pallet_code = 'MM-P-9110001')
  and (select count(*) = 1 and min(previous_boxes) = 31 and min(box_change) = -31
    and min(new_boxes) = 0 and min(previous_pieces) = 21700
    and min(piece_change) = -21700 and min(new_pieces) = 0
    and bool_and(previous_location_id = '98110000-0000-4000-8000-000000000007')
    and bool_and(new_location_id is null)
    and min(po_reference) = 'M11-PO-001' and min(bol_reference) = 'M11-BOL-SHARED'
    and bool_and(actor_user_id = '95110000-0000-4000-8000-000000000002')
    from public.inventory_transactions where idempotency_key = 'm11-ship-a'),
  'shipment zeroes facility balance and preserves exact dispatch evidence once'
);
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000007','shipping_staging',31,21700,1,'M11-PO-001','M11-BOL-SHARED','Fictional dispatch','m11-ship-a')$$,
  'IDEMPOTENCY KEY CONFLICT');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000002',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000007','shipping_staging',31,21700,1,'M11-PO-CHANGED','M11-BOL-SHARED','Fictional dispatch','m11-ship-a')$$,
  'IDEMPOTENCY KEY CONFLICT');

select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000001',true);
set local role authenticated;
select * from public.ship_pallet(
  'MM-P-9110002','98110000-0000-4000-8000-000000000002','stored',1,700,0,
  null,'M11-BOL-SHARED',null,'m11-final-box');
select * from public.stage_pallet_for_shipping(
  'MM-P-9110003','98110000-0000-4000-8000-000000000006','created',12,8400,0,
  '98110000-0000-4000-8000-000000000007','m11-hot-packing');
select * from public.stage_pallet_for_shipping(
  'MM-P-9110004',null,'created',10,7000,0,
  '98110000-0000-4000-8000-000000000007','m11-hot-unlocated');
reset role;
select pg_temp.assert_true(
  (select count(*) = 2 from public.pallets
   where current_location_id = '98110000-0000-4000-8000-000000000007'
     and lifecycle_status = 'shipping_staging')
  and (select current_boxes = 0 and current_location_id is null and lifecycle_status = 'shipped'
   from public.pallets where pallet_code = 'MM-P-9110002')
  and (select count(*) = 1 and min(previous_boxes) = 1 and min(box_change) = -1
   from public.inventory_transactions where idempotency_key = 'm11-final-box')
  and (select count(*) = 2 from public.inventory_transactions
   where transaction_type = 'shipped' and bol_reference = 'M11-BOL-SHARED'),
  'hot jobs share staging, while direct dispatch handles the final box'
);

-- Dispatch releases the rack only after the atomic shipped transition.
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status
) values (
  '97110000-0000-4000-8000-000000000009', 'MM-P-9110009',
  '96110000-0000-4000-8000-000000000001', 'M11-HEAT-I', 'M11-LOT-I',
  '95110000-0000-4000-8000-000000000001',
  700, 48, 1, 700, 1, 700,
  '98110000-0000-4000-8000-000000000002', 'stored'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.pallets
    where current_location_id = '98110000-0000-4000-8000-000000000002'),
  'the rack is reusable after direct dispatch'
);

-- Real partial Pull and Move events in this rollback transaction invalidate
-- earlier Shipping reviews, even if the caller still names the old source.
select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000001',true);
set local role authenticated;
select * from public.pull_boxes('MM-P-9110008',1,10,7000,'m11-pull-before-ship');
reset role;
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110008','98110000-0000-4000-8000-000000000004','stored',10,7000,0,null,null,null,'m11-ship-after-pull')$$,
  'INVENTORY CHANGED');
select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000001',true);
set local role authenticated;
select * from public.move_pallet('MM-P-9110008',
  '98110000-0000-4000-8000-000000000004',
  '98110000-0000-4000-8000-000000000001','m11-move-before-ship');
reset role;
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110008','98110000-0000-4000-8000-000000000004','stored',9,6300,1,null,null,null,'m11-ship-after-move')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_true(
  (select current_boxes = 9 and current_pieces = 6300
    and lifecycle_status = 'stored'
    and current_location_id = '98110000-0000-4000-8000-000000000001'
   from public.pallets where pallet_code = 'MM-P-9110008')
  and not exists (select 1 from public.inventory_transactions
    where idempotency_key in ('m11-ship-after-pull','m11-ship-after-move')),
  'Pull and Move stale shipping requests leave no shipment event'
);

select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,0,null,null,null,'m11-stale-version')$$,
  'INVENTORY CHANGED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110003','98110000-0000-4000-8000-000000000006','created',12,8400,0,'98110000-0000-4000-8000-000000000007','m11-stage-again')$$,
  'ALREADY STAGED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110001','98110000-0000-4000-8000-000000000007','shipping_staging',31,21700,1,null,null,null,'m11-duplicate')$$,
  'ALREADY SHIPPED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,1,repeat('A',101),null,null,'m11-bad-reference')$$,
  'INVALID SHIPPING REQUEST');

create function pg_temp.force_shipping_history_failure() returns trigger
language plpgsql as $$
begin
  if new.idempotency_key in ('m11-atomic-failure', 'm11-stage-atomic-failure') then
    raise exception 'MISSION 11 FORCED HISTORY FAILURE';
  end if;
  return new;
end;
$$;
create trigger m11_force_shipping_history_failure
before insert on public.inventory_transactions
for each row execute function pg_temp.force_shipping_history_failure();
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110007','98110000-0000-4000-8000-000000000003','stored',31,21700,0,null,null,null,'m11-atomic-failure')$$,
  'MISSION 11 FORCED HISTORY FAILURE');
select pg_temp.assert_true(
  (select current_boxes = 31 and current_pieces = 21700
     and current_location_id = '98110000-0000-4000-8000-000000000003'
     and lifecycle_status = 'stored' and inventory_version = 0
   from public.pallets where pallet_code = 'MM-P-9110007')
  and not exists (select 1 from public.inventory_transactions where idempotency_key = 'm11-atomic-failure'),
  'failed history insert rolls back pallet shipment and rack release'
);
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110007','98110000-0000-4000-8000-000000000003','stored',31,21700,0,'98110000-0000-4000-8000-000000000007','m11-stage-atomic-failure')$$,
  'MISSION 11 FORCED HISTORY FAILURE');
select pg_temp.assert_true(
  (select current_boxes = 31 and current_location_id = '98110000-0000-4000-8000-000000000003'
    and lifecycle_status = 'stored' and inventory_version = 0
   from public.pallets where pallet_code = 'MM-P-9110007')
  and not exists (select 1 from public.inventory_transactions
    where idempotency_key = 'm11-stage-atomic-failure'),
  'failed staging history insert rolls back lifecycle and location'
);

-- Location deactivation blocks arrivals, but must not strand pallets already there.
update public.locations set active = false
where id in (
  '98110000-0000-4000-8000-000000000003', -- occupied rack
  '98110000-0000-4000-8000-000000000005', -- held pallet's rack
  '98110000-0000-4000-8000-000000000007'  -- occupied shared staging
);
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.stage_pallet_for_shipping('MM-P-9110007','98110000-0000-4000-8000-000000000003','stored',31,21700,0,'98110000-0000-4000-8000-000000000007','m11-inactive-destination')$$,
  'INVALID SHIPPING LOCATION');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110005','98110000-0000-4000-8000-000000000005','on_hold',5,3500,0,null,null,null,'m11-inactive-held')$$,
  'PALLET ON HOLD');
select pg_temp.assert_call_raises('',
  $$select * from public.ship_pallet('MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,1,null,null,null,'m11-inactive-anon')$$,
  'AUTHENTICATION REQUIRED');
select pg_temp.assert_call_raises('95110000-0000-4000-8000-000000000001',
  $$select * from public.ship_pallet('MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,0,null,null,null,'m11-inactive-stale')$$,
  'INVENTORY CHANGED');

select set_config('request.jwt.claim.sub','95110000-0000-4000-8000-000000000001',true);
set local role authenticated;
select * from public.ship_pallet(
  'MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,1,
  'M11-INACTIVE-STAGING-PO',null,null,'m11-inactive-staging-ship');
select * from public.ship_pallet(
  'MM-P-9110003','98110000-0000-4000-8000-000000000007','shipping_staging',12,8400,1,
  'M11-INACTIVE-STAGING-PO',null,null,'m11-inactive-staging-ship');
select * from public.ship_pallet(
  'MM-P-9110007','98110000-0000-4000-8000-000000000003','stored',31,21700,0,
  'M11-INACTIVE-RACK-PO',null,null,'m11-inactive-rack-ship');
select * from public.ship_pallet(
  'MM-P-9110007','98110000-0000-4000-8000-000000000003','stored',31,21700,0,
  'M11-INACTIVE-RACK-PO',null,null,'m11-inactive-rack-ship');
reset role;
select pg_temp.assert_true(
  (select count(*) = 2 from public.pallets
   where pallet_code in ('MM-P-9110003','MM-P-9110007')
     and lifecycle_status = 'shipped' and current_boxes = 0
     and current_pieces = 0 and current_location_id is null)
  and (select count(*) = 1 and min(previous_boxes) = 12 and min(box_change) = -12
     and min(new_boxes) = 0 and min(previous_pieces) = 8400
     and min(piece_change) = -8400 and min(new_pieces) = 0
     and bool_and(previous_location_id = '98110000-0000-4000-8000-000000000007')
     and bool_and(new_location_id is null)
     from public.inventory_transactions where idempotency_key = 'm11-inactive-staging-ship')
  and (select count(*) = 1 and min(previous_boxes) = 31 and min(box_change) = -31
     and min(new_boxes) = 0 and min(previous_pieces) = 21700
     and min(piece_change) = -21700 and min(new_pieces) = 0
     and bool_and(previous_location_id = '98110000-0000-4000-8000-000000000003')
     and bool_and(new_location_id is null)
     from public.inventory_transactions where idempotency_key = 'm11-inactive-rack-ship')
  and (select lifecycle_status = 'on_hold' and current_boxes = 5
     from public.pallets where pallet_code = 'MM-P-9110005')
  and not exists (select 1 from public.inventory_transactions where idempotency_key in
    ('m11-inactive-destination','m11-inactive-held','m11-inactive-anon','m11-inactive-stale')),
  'inactive sources release existing inventory without weakening eligibility or audit'
);

rollback;
