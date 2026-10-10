-- Mission 5 fictional Store Pallet checks. Run against linked development
-- PostgreSQL with a privileged test connection; all changes roll back.

begin;

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'ASSERTION FAILED: %', failure_message;
  end if;
end;
$$;

create function pg_temp.assert_call_raises(
  actor_id text,
  statement text,
  expected_message text,
  failure_message text
)
returns void language plpgsql as $$
declare
  actual_message text;
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
  has_function_privilege('authenticated', 'public.store_pallet(text, uuid, text)', 'EXECUTE'),
  'authenticated may execute Store RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.store_pallet(text, uuid, text)', 'EXECUTE'),
  'anon may not execute Store RPC'
);
select pg_temp.assert_true(
  (select prosecdef and proconfig @> array['search_path=""']::text[]
   from pg_proc where oid = 'public.store_pallet(text, uuid, text)'::regprocedure),
  'Store RPC has a fixed empty search path and security definer'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.pallets', 'SELECT')
    and has_table_privilege('authenticated', 'public.pallets', 'SELECT')
    and has_table_privilege('authenticated', 'public.locations', 'SELECT')
    and has_table_privilege('authenticated', 'public.inventory_transactions', 'SELECT'),
  'application reads must be authenticated'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.pallets', 'INSERT')
    and not has_table_privilege('authenticated', 'public.pallets', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.pallets', 'DELETE')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.inventory_transactions', 'DELETE'),
  'browser role cannot mutate protected pallets or history directly'
);

insert into auth.users (id) values
  ('95000000-0000-4000-8000-000000000051'),
  ('95000000-0000-4000-8000-000000000052'),
  ('95000000-0000-4000-8000-000000000053');
insert into public.profiles (id, display_name, role, active) values
  ('95000000-0000-4000-8000-000000000051', 'Mission 5 Fictional Worker', 'worker', true),
  ('95000000-0000-4000-8000-000000000052', 'Mission 5 Fictional Inactive Worker', 'worker', false),
  ('95000000-0000-4000-8000-000000000053', 'Mission 5 Second Fictional Worker', 'worker', true);
insert into public.parts (id, part_number, description, product_family) values
  ('96000000-0000-4000-8000-000000000051', 'MM-M5-TEST', 'Fictional Store Test Part', 'Fictional Test Family');
insert into public.locations (id, location_code, location_type, active) values
  ('98000000-0000-4000-8000-000000000051', 'M5-RACK-OPEN', 'rack', true),
  ('98000000-0000-4000-8000-000000000052', 'M5-RACK-TAKEN', 'rack', true),
  ('98000000-0000-4000-8000-000000000053', 'M5-RACK-INACTIVE', 'rack', false),
  ('98000000-0000-4000-8000-000000000054', 'M5-PACKING', 'packing', true),
  ('98000000-0000-4000-8000-000000000055', 'M5-RACK-FROM-PACKING', 'rack', true),
  ('98000000-0000-4000-8000-000000000056', 'M5-RACK-HOLD', 'rack', true),
  ('98000000-0000-4000-8000-000000000057', 'M5-RACK-ATOMIC', 'rack', true);

insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97000000-0000-4000-8000-000000000051', 'MM-P-9500051', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-51', 'M5-LOT-51', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, null, 'created', null, null),
  ('97000000-0000-4000-8000-000000000052', 'MM-P-9500052', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-52', 'M5-LOT-52', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, '98000000-0000-4000-8000-000000000052', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000053', 'MM-P-9500053', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-53', 'M5-LOT-53', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, '98000000-0000-4000-8000-000000000054', 'created', null, null),
  ('97000000-0000-4000-8000-000000000054', 'MM-P-9500054', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-54', 'M5-LOT-54', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 0, 0, null, 'shipped', null, null),
  ('97000000-0000-4000-8000-000000000055', 'MM-P-9500055', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-55', 'M5-LOT-55', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, null, 'on_hold', 'created', 'Fictional quality review'),
  ('97000000-0000-4000-8000-000000000056', 'MM-P-9500056', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-56', 'M5-LOT-56', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, null, 'created', null, null),
  ('97000000-0000-4000-8000-000000000057', 'MM-P-9500057', '96000000-0000-4000-8000-000000000051', 'M5-HEAT-57', 'M5-LOT-57', '95000000-0000-4000-8000-000000000051', 700, 48, 31, 21700, 31, 21700, '98000000-0000-4000-8000-000000000056', 'on_hold', 'stored', 'Fictional inspection hold');

create temporary table store_results (
  attempt text not null,
  pallet_id uuid not null,
  pallet_code text not null,
  part_number text not null,
  description text not null,
  current_boxes integer not null,
  current_pieces integer not null,
  boxes_per_full_pallet_snapshot integer not null,
  lifecycle_status public.pallet_lifecycle_status not null,
  destination_location_id uuid not null,
  destination_location_code text not null,
  zone text,
  rack text,
  "position" text,
  stored_at timestamptz not null
) on commit drop;
grant insert, select on table pg_temp.store_results to authenticated;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000051', true);
set local role authenticated;
insert into pg_temp.store_results
select 'first', result.* from public.store_pallet(
  'MM-P-9500051', '98000000-0000-4000-8000-000000000051', 'mission-5-store-first'
) as result;
insert into pg_temp.store_results
select 'retry', result.* from public.store_pallet(
  'MM-P-9500051', '98000000-0000-4000-8000-000000000051', 'mission-5-store-first'
) as result;
insert into pg_temp.store_results
select 'packing-source', result.* from public.store_pallet(
  'MM-P-9500053', '98000000-0000-4000-8000-000000000055', 'mission-5-store-packing'
) as result;
reset role;

select pg_temp.assert_true(
  (select count(*) = 2 and count(distinct stored_at) = 1
   from pg_temp.store_results where attempt in ('first', 'retry')),
  'retry returns one historical store result'
);
select pg_temp.assert_true(
  (select lifecycle_status = 'stored' and current_location_id = '98000000-0000-4000-8000-000000000051'
   from public.pallets where pallet_code = 'MM-P-9500051'),
  'Store updates authoritative pallet state'
);
select pg_temp.assert_true(
  (select count(*) = 1 and min(previous_boxes) = 31 and min(box_change) = 0
    and min(new_boxes) = 31 and min(previous_pieces) = 21700
    and min(piece_change) = 0 and min(new_pieces) = 21700
    and bool_and(previous_location_id is null)
    and bool_and(new_location_id = '98000000-0000-4000-8000-000000000051')
   from public.inventory_transactions where idempotency_key = 'mission-5-store-first'),
  'Store creates exactly one complete unchanged-quantity audit event'
);
select pg_temp.assert_true(
  (select previous_location_id = '98000000-0000-4000-8000-000000000054'
    and new_location_id = '98000000-0000-4000-8000-000000000055'
   from public.inventory_transactions where idempotency_key = 'mission-5-store-packing'),
  'Store records a packing-area source location'
);
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000053',
  $$select * from public.store_pallet('MM-P-9500051', '98000000-0000-4000-8000-000000000051', 'mission-5-store-first')$$,
  'IDEMPOTENCY KEY CONFLICT', 'a different active worker cannot claim another worker''s retry key');

select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000051', 'm5-occupied')$$,
  'LOCATION OCCUPIED', 'occupied rack must be rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000056', 'm5-hold-occupied')$$,
  'LOCATION OCCUPIED', 'on-hold pallet must continue occupying its rack');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000053', 'm5-inactive-rack')$$,
  'LOCATION UNAVAILABLE', 'inactive rack must be rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000054', 'm5-packing-destination')$$,
  'LOCATION NOT A RACK', 'packing is not a Store destination');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500054', '98000000-0000-4000-8000-000000000051', 'm5-shipped')$$,
  'PALLET SHIPPED', 'shipped pallet must be rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500052', '98000000-0000-4000-8000-000000000055', 'm5-already-stored')$$,
  'PALLET ALREADY STORED', 'Store may not silently act as Move');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500055', '98000000-0000-4000-8000-000000000055', 'm5-hold')$$,
  'PALLET ON HOLD', 'hold state must be preserved');
select pg_temp.assert_call_raises('',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000055', 'm5-unauthenticated')$$,
  'AUTHENTICATION REQUIRED', 'missing auth identity must be rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000052',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000055', 'm5-inactive-worker')$$,
  'ACTIVE WORKER PROFILE REQUIRED', 'inactive profile must be rejected');
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000055', 'mission-5-store-first')$$,
  'IDEMPOTENCY KEY CONFLICT', 'same key with changed request must be rejected');

create function pg_temp.force_store_history_failure() returns trigger
language plpgsql as $$
begin
  if new.idempotency_key = 'm5-atomic-failure' then
    raise exception 'MISSION 5 FORCED HISTORY FAILURE';
  end if;
  return new;
end;
$$;
create trigger m5_force_store_history_failure
before insert on public.inventory_transactions
for each row execute function pg_temp.force_store_history_failure();
select pg_temp.assert_call_raises('95000000-0000-4000-8000-000000000051',
  $$select * from public.store_pallet('MM-P-9500056', '98000000-0000-4000-8000-000000000057', 'm5-atomic-failure')$$,
  'MISSION 5 FORCED HISTORY FAILURE', 'history failure must abort Store');
select pg_temp.assert_true(
  (select lifecycle_status = 'created' and current_location_id is null
   from public.pallets where pallet_code = 'MM-P-9500056'),
  'failed history insert must roll back pallet state change'
);
select pg_temp.assert_true(
  not exists (select 1 from public.inventory_transactions where idempotency_key = 'm5-atomic-failure'),
  'failed Store leaves no history event'
);

rollback;
