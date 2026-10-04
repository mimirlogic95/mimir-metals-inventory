-- Mission 3 runtime validation for the linked development database.
-- Every test record is fictional and the enclosing transaction is rolled back.

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

create function pg_temp.assert_raises(
  statement text,
  expected_sqlstate text,
  expected_message_fragment text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  did_raise boolean := false;
  actual_sqlstate text;
  actual_message text;
begin
  begin
    execute statement;
  exception
    when others then
      did_raise := true;
      get stacked diagnostics
        actual_sqlstate = returned_sqlstate,
        actual_message = message_text;
  end;

  if not did_raise then
    raise exception 'ASSERTION FAILED: % (statement did not fail)', failure_message;
  end if;

  if actual_sqlstate <> expected_sqlstate then
    raise exception
      'ASSERTION FAILED: % (expected SQLSTATE %, received %: %)',
      failure_message,
      expected_sqlstate,
      actual_sqlstate,
      actual_message;
  end if;

  if expected_message_fragment is not null
    and position(expected_message_fragment in actual_message) = 0
  then
    raise exception
      'ASSERTION FAILED: % (message "%" did not contain "%")',
      failure_message,
      actual_message,
      expected_message_fragment;
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 7
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name in (
        'profiles',
        'parts',
        'packing_specs',
        'locations',
        'pallets',
        'adjustment_requests',
        'inventory_transactions'
      )
  ),
  'all seven application tables must exist'
);

select pg_temp.assert_true(
  (
    select array_agg(enum_value order by sort_order) = array[
      'created',
      'stored',
      'shipping_staging',
      'on_hold',
      'shipped'
    ]::text[]
    from (
      select enum.enumlabel::text as enum_value, enum.enumsortorder as sort_order
      from pg_enum as enum
      join pg_type as type on type.oid = enum.enumtypid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname = 'pallet_lifecycle_status'
    ) as lifecycle_values
  ),
  'pallet lifecycle enum must match the documented values'
);

select pg_temp.assert_true(
  (
    select array_agg(enum_value order by sort_order) = array[
      'worker',
      'supervisor'
    ]::text[]
    from (
      select enum.enumlabel::text as enum_value, enum.enumsortorder as sort_order
      from pg_enum as enum
      join pg_type as type on type.oid = enum.enumtypid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname = 'user_role'
    ) as role_values
  ),
  'user role enum must match the documented values'
);

select pg_temp.assert_true(
  (
    select array_agg(enum_value order by sort_order) = array[
      'pending',
      'approved',
      'rejected'
    ]::text[]
    from (
      select enum.enumlabel::text as enum_value, enum.enumsortorder as sort_order
      from pg_enum as enum
      join pg_type as type on type.oid = enum.enumtypid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname = 'adjustment_status'
    ) as adjustment_values
  ),
  'adjustment status enum must match the documented values'
);

select pg_temp.assert_true(
  (
    select array_agg(enum_value order by sort_order) = array[
      'rack',
      'shipping_staging',
      'packing'
    ]::text[]
    from (
      select enum.enumlabel::text as enum_value, enum.enumsortorder as sort_order
      from pg_enum as enum
      join pg_type as type on type.oid = enum.enumtypid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname = 'location_type'
    ) as location_values
  ),
  'location type enum must match the documented values'
);

select pg_temp.assert_true(
  (
    select array_agg(enum_value order by sort_order) = array[
      'pallet_created',
      'label_printed',
      'stored',
      'box_pull',
      'moved',
      'count_matched',
      'adjustment_requested',
      'adjustment_approved',
      'adjustment_rejected',
      'hold_placed',
      'hold_released',
      'shipping_staging',
      'shipped'
    ]::text[]
    from (
      select enum.enumlabel::text as enum_value, enum.enumsortorder as sort_order
      from pg_enum as enum
      join pg_type as type on type.oid = enum.enumtypid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname = 'inventory_transaction_type'
    ) as transaction_values
  ),
  'inventory transaction enum must match the documented values'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pallets'
      and column_name in ('full_partial', 'fill_status', 'is_full')
  ),
  'FULL/PARTIAL must not be stored on pallets'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.packing_specs
    where pieces_per_full_pallet <> pieces_per_box * boxes_per_full_pallet
  ),
  'generated full-pallet piece quantities must match packing arithmetic'
);

select pg_temp.assert_true(
  (
    select count(*) = 7
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'parts',
        'packing_specs',
        'locations',
        'pallets',
        'adjustment_requests',
        'inventory_transactions'
      )
      and relation.relrowsecurity
  ),
  'RLS must be enabled on all application tables'
);

do $$
declare
  application_table text;
  mutation_privilege text;
begin
  foreach application_table in array array[
    'profiles',
    'parts',
    'packing_specs',
    'locations',
    'pallets',
    'adjustment_requests',
    'inventory_transactions'
  ]
  loop
    if has_table_privilege('anon', format('public.%I', application_table), 'SELECT') then
      raise exception 'ASSERTION FAILED: anon can read %', application_table;
    end if;

    if not has_table_privilege(
      'authenticated',
      format('public.%I', application_table),
      'SELECT'
    ) then
      raise exception 'ASSERTION FAILED: authenticated cannot read %', application_table;
    end if;

    foreach mutation_privilege in array array['INSERT', 'UPDATE', 'DELETE']
    loop
      if has_table_privilege(
        'authenticated',
        format('public.%I', application_table),
        mutation_privilege
      ) then
        raise exception
          'ASSERTION FAILED: authenticated has % on %',
          mutation_privilege,
          application_table;
      end if;
    end loop;
  end loop;
end;
$$;

insert into auth.users (id)
values
  ('90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000003');

insert into public.profiles (id, display_name, role, employee_code)
values
  (
    '90000000-0000-4000-8000-000000000001',
    'Mission 3 Worker One',
    'worker',
    'M3W1'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'Mission 3 Worker Two',
    'worker',
    'M3W2'
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    'Mission 3 Supervisor',
    'supervisor',
    'M3S'
  );

insert into public.pallets (
  id,
  pallet_code,
  part_id,
  heat_number,
  lot_number,
  packed_by_user_id,
  pieces_per_box_snapshot,
  boxes_per_full_pallet_snapshot,
  original_boxes,
  original_pieces,
  current_boxes,
  current_pieces,
  current_location_id,
  lifecycle_status
)
values (
  '91000000-0000-4000-8000-000000000001',
  'MM-P-9000001',
  '10000000-0000-4000-8000-000000000002',
  'MM-M3-HEAT-01',
  'MM-M3-LOT-01',
  '90000000-0000-4000-8000-000000000001',
  700,
  48,
  10,
  7000,
  10,
  7000,
  '30000000-0000-4000-8000-000000000001',
  'stored'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      current_location_id, lifecycle_status
    ) values (
      '91000000-0000-4000-8000-000000000006', 'MM-P-9000006',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-06',
      'MM-M3-LOT-06', '90000000-0000-4000-8000-000000000001',
      700, 48, 10, 7000, 10, 7000,
      '30000000-0000-4000-8000-000000000001', 'stored'
    )
  $statement$,
  'P0001',
  'LOCATION OCCUPIED',
  'a second active pallet must not enter an occupied rack'
);

update public.pallets
set
  lifecycle_status = 'on_hold',
  lifecycle_status_before_hold = 'stored',
  hold_reason = 'Mission 3 fictional validation hold'
where id = '91000000-0000-4000-8000-000000000001';

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      current_location_id, lifecycle_status
    ) values (
      '91000000-0000-4000-8000-000000000006', 'MM-P-9000006',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-06',
      'MM-M3-LOT-06', '90000000-0000-4000-8000-000000000001',
      700, 48, 10, 7000, 10, 7000,
      '30000000-0000-4000-8000-000000000001', 'stored'
    )
  $statement$,
  'P0001',
  'LOCATION OCCUPIED',
  'an on-hold pallet must continue to occupy its rack'
);

insert into public.pallets (
  id,
  pallet_code,
  part_id,
  heat_number,
  lot_number,
  packed_by_user_id,
  pieces_per_box_snapshot,
  boxes_per_full_pallet_snapshot,
  original_boxes,
  original_pieces,
  current_boxes,
  current_pieces,
  current_location_id,
  lifecycle_status
)
values
  (
    '91000000-0000-4000-8000-000000000002',
    'MM-P-9000002',
    '10000000-0000-4000-8000-000000000002',
    'MM-M3-HEAT-02',
    'MM-M3-LOT-02',
    '90000000-0000-4000-8000-000000000001',
    700,
    48,
    10,
    7000,
    10,
    7000,
    '30000000-0000-4000-8000-000000000015',
    'created'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'MM-P-9000003',
    '10000000-0000-4000-8000-000000000002',
    'MM-M3-HEAT-03',
    'MM-M3-LOT-03',
    '90000000-0000-4000-8000-000000000001',
    700,
    48,
    10,
    7000,
    10,
    7000,
    '30000000-0000-4000-8000-000000000015',
    'created'
  ),
  (
    '91000000-0000-4000-8000-000000000004',
    'MM-P-9000004',
    '10000000-0000-4000-8000-000000000002',
    'MM-M3-HEAT-04',
    'MM-M3-LOT-04',
    '90000000-0000-4000-8000-000000000001',
    700,
    48,
    10,
    7000,
    10,
    7000,
    '30000000-0000-4000-8000-000000000016',
    'shipping_staging'
  ),
  (
    '91000000-0000-4000-8000-000000000005',
    'MM-P-9000005',
    '10000000-0000-4000-8000-000000000002',
    'MM-M3-HEAT-05',
    'MM-M3-LOT-05',
    '90000000-0000-4000-8000-000000000001',
    700,
    48,
    10,
    7000,
    10,
    7000,
    '30000000-0000-4000-8000-000000000016',
    'shipping_staging'
  );

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.pallets
    where current_location_id = '30000000-0000-4000-8000-000000000015'
      and lifecycle_status <> 'shipped'
  ),
  'packing must allow multiple active pallets'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.pallets
    where current_location_id = '30000000-0000-4000-8000-000000000016'
      and lifecycle_status <> 'shipped'
  ),
  'shipping staging must allow multiple active pallets'
);

update public.pallets
set
  lifecycle_status = 'shipped',
  lifecycle_status_before_hold = null,
  hold_reason = null
where id = '91000000-0000-4000-8000-000000000001';

insert into public.pallets (
  id,
  pallet_code,
  part_id,
  heat_number,
  lot_number,
  packed_by_user_id,
  pieces_per_box_snapshot,
  boxes_per_full_pallet_snapshot,
  original_boxes,
  original_pieces,
  current_boxes,
  current_pieces,
  current_location_id,
  lifecycle_status
)
values (
  '91000000-0000-4000-8000-000000000006',
  'MM-P-9000006',
  '10000000-0000-4000-8000-000000000002',
  'MM-M3-HEAT-06',
  'MM-M3-LOT-06',
  '90000000-0000-4000-8000-000000000001',
  700,
  48,
  10,
  7000,
  10,
  7000,
  '30000000-0000-4000-8000-000000000001',
  'stored'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.pallets
    where current_location_id = '30000000-0000-4000-8000-000000000001'
      and lifecycle_status <> 'shipped'
  ),
  'a shipped pallet must not consume rack capacity'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      lifecycle_status
    ) values (
      '92000000-0000-4000-8000-000000000001', 'MM-P-9000006',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-U1',
      'MM-M3-LOT-U1', '90000000-0000-4000-8000-000000000001',
      700, 48, 1, 700, 1, 700, 'created'
    )
  $statement$,
  '23505',
  null,
  'pallet codes must be unique'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      lifecycle_status
    ) values (
      '92000000-0000-4000-8000-000000000002', 'MM-P-9200002',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-MATH',
      'MM-M3-LOT-MATH', '90000000-0000-4000-8000-000000000001',
      700, 48, 2, 1399, 2, 1400, 'created'
    )
  $statement$,
  '23514',
  null,
  'pallet packing snapshot arithmetic must be enforced'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      lifecycle_status
    ) values (
      '92000000-0000-4000-8000-000000000003', 'MM-P-9200003',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-NEG',
      'MM-M3-LOT-NEG', '90000000-0000-4000-8000-000000000001',
      700, 48, 2, 1400, -1, -700, 'created'
    )
  $statement$,
  '23514',
  null,
  'negative pallet quantities must be rejected'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.pallets (
      id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
      pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
      original_boxes, original_pieces, current_boxes, current_pieces,
      lifecycle_status
    ) values (
      '92000000-0000-4000-8000-000000000004', 'MM-P-9200004',
      '10000000-0000-4000-8000-000000000002', 'MM-M3-HEAT-HOLD',
      'MM-M3-LOT-HOLD', '90000000-0000-4000-8000-000000000001',
      700, 48, 2, 1400, 2, 1400, 'on_hold'
    )
  $statement$,
  '23514',
  null,
  'hold state must preserve a prior state and reason'
);

insert into public.adjustment_requests (
  id,
  pallet_id,
  requested_by_user_id,
  system_boxes,
  counted_boxes,
  box_difference,
  system_pieces,
  counted_pieces,
  piece_difference,
  reason_code
)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000006',
    '90000000-0000-4000-8000-000000000001',
    10,
    9,
    -1,
    7000,
    6300,
    -700,
    'mission_3_test'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000006',
    '90000000-0000-4000-8000-000000000002',
    10,
    8,
    -2,
    7000,
    5600,
    -1400,
    'mission_3_test'
  );

select pg_temp.assert_raises(
  $statement$
    insert into public.adjustment_requests (
      pallet_id, requested_by_user_id, system_boxes, counted_boxes,
      box_difference, system_pieces, counted_pieces, piece_difference,
      reason_code
    ) values (
      '91000000-0000-4000-8000-000000000006',
      '90000000-0000-4000-8000-000000000001',
      10, 8, -1, 7000, 5600, -1400, 'mission_3_bad_math'
    )
  $statement$,
  '23514',
  null,
  'adjustment arithmetic must be enforced'
);

insert into public.inventory_transactions (
  id,
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
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000006',
  'count_matched',
  '90000000-0000-4000-8000-000000000001',
  10,
  0,
  10,
  7000,
  0,
  7000,
  'mission-3-idempotency-test'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces,
      idempotency_key
    ) values (
      '91000000-0000-4000-8000-000000000006', 'count_matched',
      '90000000-0000-4000-8000-000000000001',
      10, 0, 10, 7000, 0, 7000, 'mission-3-idempotency-test'
    )
  $statement$,
  '23505',
  null,
  'idempotency keys must be unique'
);

select pg_temp.assert_raises(
  $statement$
    insert into public.inventory_transactions (
      pallet_id, transaction_type, actor_user_id,
      previous_boxes, box_change, new_boxes,
      previous_pieces, piece_change, new_pieces
    ) values (
      '91000000-0000-4000-8000-000000000006', 'box_pull',
      '90000000-0000-4000-8000-000000000001',
      10, -2, 9, 7000, -1400, 5600
    )
  $statement$,
  '23514',
  null,
  'transaction arithmetic must be enforced'
);

select pg_temp.assert_raises(
  $statement$
    delete from public.pallets
    where id = '91000000-0000-4000-8000-000000000006'
  $statement$,
  '23503',
  null,
  'historical transactions must restrict pallet deletion'
);

create function pg_temp.verify_role_access()
returns void
language plpgsql
as $$
declare
  was_denied boolean;
  visible_count bigint;
begin
  was_denied := false;
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.parts' into visible_count;
  exception
    when insufficient_privilege then
      was_denied := true;
  end;
  execute 'reset role';

  if not was_denied then
    raise exception 'ASSERTION FAILED: anon could read protected application data';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '90000000-0000-4000-8000-000000000001',
    true
  );
  execute 'set local role authenticated';
  execute 'select count(*) from public.parts' into visible_count;

  if visible_count <> 7 then
    execute 'reset role';
    raise exception 'ASSERTION FAILED: authenticated seed read returned % parts', visible_count;
  end if;

  execute
    'select count(*) from public.adjustment_requests'
    into visible_count;

  if visible_count <> 1 then
    execute 'reset role';
    raise exception
      'ASSERTION FAILED: worker adjustment RLS returned % rows instead of 1',
      visible_count;
  end if;

  was_denied := false;
  begin
    execute $sql$
      insert into public.parts (part_number, description, product_family)
      values ('MM-M3-UNAUTHORIZED', 'Unauthorized test', 'Mission 3')
    $sql$;
  exception
    when insufficient_privilege then
      was_denied := true;
  end;

  if not was_denied then
    execute 'reset role';
    raise exception 'ASSERTION FAILED: authenticated could insert protected data';
  end if;

  was_denied := false;
  begin
    execute $sql$
      update public.inventory_transactions
      set reason_notes = 'Unauthorized test'
      where id = '94000000-0000-4000-8000-000000000001'
    $sql$;
  exception
    when insufficient_privilege then
      was_denied := true;
  end;

  if not was_denied then
    execute 'reset role';
    raise exception 'ASSERTION FAILED: authenticated could update transaction history';
  end if;

  was_denied := false;
  begin
    execute $sql$
      delete from public.inventory_transactions
      where id = '94000000-0000-4000-8000-000000000001'
    $sql$;
  exception
    when insufficient_privilege then
      was_denied := true;
  end;

  if not was_denied then
    execute 'reset role';
    raise exception 'ASSERTION FAILED: authenticated could delete transaction history';
  end if;

  was_denied := false;
  begin
    execute $sql$
      update public.adjustment_requests
      set
        status = 'approved',
        reviewed_by_user_id = '90000000-0000-4000-8000-000000000001',
        reviewed_at = now()
      where id = '93000000-0000-4000-8000-000000000001'
    $sql$;
  exception
    when insufficient_privilege then
      was_denied := true;
  end;
  execute 'reset role';

  if not was_denied then
    raise exception 'ASSERTION FAILED: worker could directly approve an adjustment';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '90000000-0000-4000-8000-000000000003',
    true
  );
  execute 'set local role authenticated';
  execute
    'select count(*) from public.adjustment_requests'
    into visible_count;
  execute 'reset role';

  if visible_count <> 2 then
    raise exception
      'ASSERTION FAILED: supervisor adjustment RLS returned % rows instead of 2',
      visible_count;
  end if;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

select pg_temp.verify_role_access();

rollback;

select 'database foundation validation passed' as result;
