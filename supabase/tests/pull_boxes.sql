-- Mission 7 fictional Pull Boxes validation. All fixture state rolls back.
begin;

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', failure_message; end if;
end;
$$;

create function pg_temp.assert_call_raises(
  actor_id text, statement text, expected_message text, failure_message text
)
returns void language plpgsql as $$
declare actual_message text;
begin
  perform set_config('request.jwt.claim.sub', actor_id, true);
  execute 'set local role authenticated';
  begin
    execute statement;
    raise exception 'ASSERTION FAILED: % (did not fail)', failure_message;
  exception when others then
    get stacked diagnostics actual_message = message_text;
  end;
  execute 'reset role';
  if position(expected_message in actual_message) = 0 then
    raise exception 'ASSERTION FAILED: % (got: %)', failure_message, actual_message;
  end if;
exception when others then
  execute 'reset role';
  raise;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.pull_boxes(text, integer, integer, integer, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.pull_boxes(text, integer, integer, integer, text, text, text)', 'EXECUTE'),
  'only authenticated may execute Pull RPC'
);
select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=""']::text[]
   from pg_proc where oid = 'public.pull_boxes(text, integer, integer, integer, text, text, text)'::regprocedure),
  'Pull RPC is security definer with empty search path'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_transactions', 'DELETE'),
  'browser users cannot directly mutate pallet state or history'
);

insert into auth.users (id) values
  ('95000000-0000-4000-8000-000000000071'),
  ('95000000-0000-4000-8000-000000000072'),
  ('95000000-0000-4000-8000-000000000073'),
  ('95000000-0000-4000-8000-000000000074');
insert into public.profiles (id, display_name, role, active) values
  ('95000000-0000-4000-8000-000000000071', 'Mission 7 Fictional Worker', 'worker', true),
  ('95000000-0000-4000-8000-000000000072', 'Mission 7 Fictional Supervisor', 'supervisor', true),
  ('95000000-0000-4000-8000-000000000073', 'Mission 7 Inactive Worker', 'worker', false),
  ('95000000-0000-4000-8000-000000000074', 'Mission 7 Other Worker', 'worker', true);
insert into public.parts (id, part_number, description, product_family) values
  ('96000000-0000-4000-8000-000000000071', 'MM-M7-TEST', 'Fictional Pull Test Part', 'Fictional Test Family');
insert into public.packing_specs (part_id, pieces_per_box, boxes_per_full_pallet)
values ('96000000-0000-4000-8000-000000000071', 650, 24);
insert into public.locations (id, location_code, location_type) values
  ('98000000-0000-4000-8000-000000000071', 'M7-RACK-71', 'rack'),
  ('98000000-0000-4000-8000-000000000072', 'M7-RACK-72', 'rack'),
  ('98000000-0000-4000-8000-000000000073', 'M7-RACK-73', 'rack'),
  ('98000000-0000-4000-8000-000000000074', 'M7-RACK-74', 'rack'),
  ('98000000-0000-4000-8000-000000000075', 'M7-RACK-75', 'rack'),
  ('98000000-0000-4000-8000-000000000076', 'M7-STAGING', 'shipping_staging');
insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97000000-0000-4000-8000-000000000071', 'MM-P-9700071', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-71', 'M7-LOT-71', '95000000-0000-4000-8000-000000000071', 700, 48, 31, 21700, 31, 21700, '98000000-0000-4000-8000-000000000071', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000072', 'MM-P-9700072', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-72', 'M7-LOT-72', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, '98000000-0000-4000-8000-000000000072', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000073', 'MM-P-9700073', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-73', 'M7-LOT-73', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, '98000000-0000-4000-8000-000000000073', 'on_hold', 'stored', 'Fictional hold'),
  ('97000000-0000-4000-8000-000000000074', 'MM-P-9700074', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-74', 'M7-LOT-74', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, null, 'shipped', null, null),
  ('97000000-0000-4000-8000-000000000075', 'MM-P-9700075', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-75', 'M7-LOT-75', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 0, 0, '98000000-0000-4000-8000-000000000075', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000076', 'MM-P-9700076', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-76', 'M7-LOT-76', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, null, 'created', null, null),
  ('97000000-0000-4000-8000-000000000077', 'MM-P-9700077', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-77', 'M7-LOT-77', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, '98000000-0000-4000-8000-000000000076', 'shipping_staging', null, null),
  ('97000000-0000-4000-8000-000000000078', 'MM-P-9700078', '96000000-0000-4000-8000-000000000071', 'M7-HEAT-78', 'M7-LOT-78', '95000000-0000-4000-8000-000000000071', 700, 48, 12, 8400, 12, 8400, '98000000-0000-4000-8000-000000000074', 'stored', null, null);

create temporary table pull_results (
  attempt text not null, pallet_id uuid, pallet_code text, part_number text,
  description text, location_code text, previous_boxes integer,
  boxes_removed integer, current_boxes integer, previous_pieces integer,
  pieces_removed integer, current_pieces integer, transaction_id uuid,
  pulled_at timestamptz
) on commit drop;
grant insert, select on table pg_temp.pull_results to authenticated;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000071', true);
set local role authenticated;
insert into pg_temp.pull_results
select 'first', result.* from public.pull_boxes(
  'MM-P-9700071', 6, 31, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL'
) as result;
insert into pg_temp.pull_results
select 'retry', result.* from public.pull_boxes(
  'MM-P-9700071', 6, 31, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL'
) as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct transaction_id) = 1
    and min(previous_boxes) = 31 and min(boxes_removed) = 6
    and min(current_boxes) = 25 and min(previous_pieces) = 21700
    and min(pieces_removed) = 4200 and min(current_pieces) = 17500
    and min(location_code) = 'M7-RACK-71'
   from pg_temp.pull_results),
  'worker pull and exact retry return the original authoritative result'
);
select pg_temp.assert_true(
  (select current_boxes = 25 and current_pieces = 17500
    and current_location_id = '98000000-0000-4000-8000-000000000071'
    and lifecycle_status = 'stored'
   from public.pallets where pallet_code = 'MM-P-9700071'),
  'partial pull changes only quantity and preserves location/lifecycle'
);
select pg_temp.assert_true(
  (select count(*) = 1 and min(previous_boxes) = 31 and min(box_change) = -6
    and min(new_boxes) = 25 and min(previous_pieces) = 21700
    and min(piece_change) = -4200 and min(new_pieces) = 17500
    and min(po_reference) = 'M7-FICTIONAL-PO'
    and min(bol_reference) = 'M7-FICTIONAL-BOL'
    and bool_and(previous_location_id = new_location_id)
    and bool_and(actor_user_id = '95000000-0000-4000-8000-000000000071')
    and bool_and(occurred_at is not null)
   from public.inventory_transactions where idempotency_key = 'm7-first'),
  'one immutable box_pull event records snapshot math, actor, references, and unchanged location'
);

select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 1, 31, 21700, 'm7-stale')$$,
  'INVENTORY CHANGED', 'stale reviewed quantity rejected even when enough remains');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 1, 25, 21701, 'm7-stale-pieces')$$,
  'INVENTORY CHANGED', 'stale reviewed pieces rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 26, 25, 17500, 'm7-too-many')$$,
  'TOO MANY BOXES', 'pull greater than current boxes rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 25, 25, 17500, 'm7-whole')$$,
  'WHOLE PALLET USE SHIPPING', 'whole-pallet depletion belongs to Shipping');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 0, 25, 17500, 'm7-zero')$$,
  'INVALID PULL QUANTITY', 'zero pull rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', -1, 25, 17500, 'm7-negative')$$,
  'INVALID PULL QUANTITY', 'negative pull rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-UNKNOWN', 1, 25, 17500, 'm7-missing')$$,
  'PALLET NOT FOUND', 'unknown pallet rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700073', 1, 12, 8400, 'm7-held')$$,
  'PALLET ON HOLD', 'held pallet rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700074', 1, 12, 8400, 'm7-shipped')$$,
  'PALLET SHIPPED', 'shipped pallet rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700075', 1, 0, 0, 'm7-empty')$$,
  'NO INVENTORY', 'empty pallet rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700076', 1, 12, 8400, 'm7-created')$$,
  'PALLET NOT READY TO PULL', 'created pallet rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700077', 1, 12, 8400, 'm7-staging')$$,
  'PALLET NOT READY TO PULL', 'staging pallet rejected');
select pg_temp.assert_call_raises('',
  $$select * from public.pull_boxes('MM-P-9700072', 1, 12, 8400, 'm7-no-auth')$$,
  'AUTHENTICATION REQUIRED', 'unauthenticated identity rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000073',
  $$select * from public.pull_boxes('MM-P-9700072', 1, 12, 8400, 'm7-inactive')$$,
  'ACTIVE WORKER PROFILE REQUIRED', 'inactive worker rejected');

select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700072', 6, 12, 8400, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key cannot switch pallet');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 5, 31, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key cannot change quantity');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 6, 30, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key cannot change reviewed state');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 6, 31, 21700, 'm7-first', 'CHANGED-PO', 'M7-FICTIONAL-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key cannot change PO');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700071', 6, 31, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'CHANGED-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key cannot change BOL');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000074',
  $$select * from public.pull_boxes('MM-P-9700071', 6, 31, 21700, 'm7-first', 'M7-FICTIONAL-PO', 'M7-FICTIONAL-BOL')$$,
  'IDEMPOTENCY KEY CONFLICT', 'different actor cannot replay another worker''s key');

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000072', true);
set local role authenticated;
insert into pg_temp.pull_results
select 'supervisor', result.* from public.pull_boxes(
  'MM-P-9700072', 2, 12, 8400, 'm7-supervisor'
) as result;
reset role;
select pg_temp.assert_true(
  (select current_boxes = 10 and current_pieces = 7000
   from public.pallets where pallet_code = 'MM-P-9700072'),
  'active supervisor succeeds with snapshot math'
);

create function pg_temp.force_pull_history_failure() returns trigger
language plpgsql as $$
begin
  if new.idempotency_key = 'm7-atomic-failure' then
    raise exception 'MISSION 7 FORCED HISTORY FAILURE';
  end if;
  return new;
end;
$$;
create trigger m7_force_pull_history_failure
before insert on public.inventory_transactions
for each row execute function pg_temp.force_pull_history_failure();
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000071',
  $$select * from public.pull_boxes('MM-P-9700078', 2, 12, 8400, 'm7-atomic-failure')$$,
  'MISSION 7 FORCED HISTORY FAILURE', 'history failure aborts Pull');
select pg_temp.assert_true(
  (select current_boxes = 12 and current_pieces = 8400
   from public.pallets where pallet_code = 'MM-P-9700078'),
  'history failure rolls back pallet quantity update'
);
select pg_temp.assert_true(
  not exists (select 1 from public.inventory_transactions where idempotency_key = 'm7-atomic-failure'),
  'failed Pull leaves no audit event'
);

rollback;
