-- Mission 4 runtime validation for the linked development database.
-- Every identity and inventory value is fictional; the transaction rolls back.

begin;

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'ASSERTION FAILED: %', failure_message;
  end if;
end;
$$;

create function pg_temp.assert_call_raises(
  role_name text,
  actor_id text,
  statement text,
  expected_message_fragment text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  did_raise boolean := false;
  actual_message text;
begin
  perform set_config('request.jwt.claim.sub', actor_id, true);
  execute format('set local role %I', role_name);

  begin
    execute statement;
  exception
    when others then
      did_raise := true;
      get stacked diagnostics actual_message = message_text;
  end;

  execute 'reset role';

  if not did_raise then
    raise exception 'ASSERTION FAILED: % (statement did not fail)', failure_message;
  end if;

  if position(expected_message_fragment in actual_message) = 0 then
    raise exception
      'ASSERTION FAILED: % (message "%" did not contain "%")',
      failure_message,
      actual_message,
      expected_message_fragment;
  end if;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.create_pallet(uuid, integer, text, text, text, text)',
    'EXECUTE'
  ),
  'authenticated must be able to execute create_pallet'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.create_pallet(uuid, integer, text, text, text, text)',
    'EXECUTE'
  ),
  'anon must not be able to execute create_pallet'
);

select pg_temp.assert_true(
  not has_sequence_privilege('authenticated', 'public.pallet_code_seq', 'USAGE'),
  'authenticated must not generate pallet codes directly'
);

select pg_temp.assert_true(
  (
    select function.prosecdef
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.create_pallet(uuid, integer, text, text, text, text)'::regprocedure
  ),
  'create_pallet must be security definer with an empty fixed search path'
);

insert into auth.users (id)
values
  ('95000000-0000-4000-8000-000000000001'),
  ('95000000-0000-4000-8000-000000000002');

insert into public.profiles (id, display_name, role, employee_code, active)
values
  (
    '95000000-0000-4000-8000-000000000001',
    'Mission 4 Fictional Worker',
    'worker',
    'M4W',
    true
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    'Mission 4 Inactive Worker',
    'worker',
    'M4I',
    false
  );

insert into public.parts (
  id,
  part_number,
  description,
  product_family,
  active
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    'MM-M4-ACTIVE',
    'Mission 4 Fictional Active Part',
    'Mission 4 Test Family',
    true
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    'MM-M4-INACTIVE',
    'Mission 4 Fictional Inactive Part',
    'Mission 4 Test Family',
    false
  );

insert into public.packing_specs (
  part_id,
  pieces_per_box,
  boxes_per_full_pallet,
  estimated_box_weight_lb,
  estimated_full_pallet_weight_lb
)
values
  ('96000000-0000-4000-8000-000000000001', 700, 48, 56, 2688),
  ('96000000-0000-4000-8000-000000000002', 500, 40, 40, 1600);

create temporary table create_pallet_results (
  attempt text not null,
  id uuid not null,
  pallet_code text not null,
  part_id uuid not null,
  part_number text not null,
  description text not null,
  product_family text not null,
  heat_number text not null,
  lot_number text not null,
  machine_code text,
  packed_by_user_id uuid not null,
  packed_at timestamptz not null,
  pieces_per_box_snapshot integer not null,
  boxes_per_full_pallet_snapshot integer not null,
  estimated_box_weight_lb_snapshot numeric,
  original_boxes integer not null,
  original_pieces integer not null,
  current_boxes integer not null,
  current_pieces integer not null,
  lifecycle_status public.pallet_lifecycle_status not null
) on commit drop;

grant insert, select on table pg_temp.create_pallet_results to authenticated;

select set_config(
  'request.jwt.claim.sub',
  '95000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

insert into pg_temp.create_pallet_results
select
  'first',
  created.*
from public.create_pallet(
  '96000000-0000-4000-8000-000000000001',
  31,
  'MM-M4-HEAT-01',
  'MM-M4-LOT-01',
  'mission-4-create-success',
  'MM-M4-MACHINE-01'
) as created;

insert into pg_temp.create_pallet_results
select
  'retry',
  created.*
from public.create_pallet(
  '96000000-0000-4000-8000-000000000001',
  31,
  'MM-M4-HEAT-01',
  'MM-M4-LOT-01',
  'mission-4-create-success',
  'MM-M4-MACHINE-01'
) as created;

insert into pg_temp.create_pallet_results
select
  'second',
  created.*
from public.create_pallet(
  '96000000-0000-4000-8000-000000000001',
  48,
  'MM-M4-HEAT-02',
  'MM-M4-LOT-02',
  'mission-4-create-second',
  null
) as created;

reset role;

select pg_temp.assert_true(
  (
    select original_pieces = 21700
      and current_pieces = 21700
      and pieces_per_box_snapshot = 700
      and boxes_per_full_pallet_snapshot = 48
      and estimated_box_weight_lb_snapshot = 56
    from pg_temp.create_pallet_results
    where attempt = 'first'
  ),
  'the server must calculate pieces and copy the database packing snapshot'
);

select pg_temp.assert_true(
  (
    select count(distinct id) = 1
      and count(distinct pallet_code) = 1
    from pg_temp.create_pallet_results
    where attempt in ('first', 'retry')
  ),
  'an idempotent retry must return the original pallet'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.inventory_transactions
    where idempotency_key = 'mission-4-create-success'
      and transaction_type = 'pallet_created'
      and previous_boxes = 0
      and box_change = 31
      and new_boxes = 31
      and previous_pieces = 0
      and piece_change = 21700
      and new_pieces = 21700
      and actor_user_id = '95000000-0000-4000-8000-000000000001'
  ),
  'create_pallet must write one complete creation transaction'
);

select pg_temp.assert_true(
  (
    select count(distinct pallet_code) = 2
    from pg_temp.create_pallet_results
    where attempt in ('first', 'second')
  ),
  'separate create requests must receive unique pallet codes'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_temp.create_pallet_results
    where pallet_code !~ '^MM-P-[0-9]{7}$'
  ),
  'generated pallet codes must use the documented worker-readable format'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000001',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', 0,
      'MM-M4-HEAT-ZERO', 'MM-M4-LOT-ZERO', 'mission-4-zero', null
    )
  $statement$,
  'BOXES MUST BE GREATER THAN ZERO',
  'zero boxes must fail'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000001',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', -1,
      'MM-M4-HEAT-NEG', 'MM-M4-LOT-NEG', 'mission-4-negative', null
    )
  $statement$,
  'BOXES MUST BE GREATER THAN ZERO',
  'negative boxes must fail'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000001',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000002', 1,
      'MM-M4-HEAT-INACTIVE', 'MM-M4-LOT-INACTIVE', 'mission-4-inactive-part', null
    )
  $statement$,
  'ACTIVE PART AND PACKING SPEC REQUIRED',
  'inactive parts must fail'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', 1,
      'MM-M4-HEAT-ANON', 'MM-M4-LOT-ANON', 'mission-4-unauthenticated', null
    )
  $statement$,
  'AUTHENTICATION REQUIRED',
  'an authenticated role without an authenticated user must fail'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000002',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', 1,
      'MM-M4-HEAT-INACTIVE-WORKER', 'MM-M4-LOT-INACTIVE-WORKER',
      'mission-4-inactive-worker', null
    )
  $statement$,
  'ACTIVE WORKER PROFILE REQUIRED',
  'an inactive profile must fail'
);

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000001',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', 30,
      'MM-M4-HEAT-CHANGED', 'MM-M4-LOT-01', 'mission-4-create-success', null
    )
  $statement$,
  'IDEMPOTENCY KEY CONFLICT',
  'reusing a key for a different request must fail'
);

create function pg_temp.force_creation_transaction_failure()
returns trigger
language plpgsql
as $$
begin
  if new.idempotency_key = 'mission-4-atomic-failure' then
    raise exception 'MISSION 4 FORCED TRANSACTION FAILURE';
  end if;

  return new;
end;
$$;

create trigger mission_4_force_transaction_failure
before insert on public.inventory_transactions
for each row execute function pg_temp.force_creation_transaction_failure();

select pg_temp.assert_call_raises(
  'authenticated',
  '95000000-0000-4000-8000-000000000001',
  $statement$
    select * from public.create_pallet(
      '96000000-0000-4000-8000-000000000001', 2,
      'MM-M4-HEAT-ATOMIC', 'MM-M4-LOT-ATOMIC', 'mission-4-atomic-failure', null
    )
  $statement$,
  'MISSION 4 FORCED TRANSACTION FAILURE',
  'a transaction insert failure must surface'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.pallets
    where heat_number = 'MM-M4-HEAT-ATOMIC'
  ),
  'a failed creation transaction must roll back the pallet insert'
);

drop trigger mission_4_force_transaction_failure on public.inventory_transactions;

rollback;

select 'create_pallet runtime validation passed' as result;
