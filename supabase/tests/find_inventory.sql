-- Mission 6 fictional Find/FIFO read checks. Every fixture rolls back.
begin;

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'ASSERTION FAILED: %', failure_message;
  end if;
end;
$$;

insert into auth.users (id) values ('95000000-0000-4000-8000-000000000061');
insert into public.profiles (id, display_name, role) values
  ('95000000-0000-4000-8000-000000000061', 'Mission 6 Fictional Worker', 'worker');
insert into public.parts (id, part_number, description, product_family) values
  ('96000000-0000-4000-8000-000000000061', 'MM-M6-TEST', 'Fictional Find Test Part', 'Fictional Family');
-- Deliberately different from pallet snapshots: historical fill must use 48, not 24.
insert into public.packing_specs (
  part_id, pieces_per_box, boxes_per_full_pallet
) values ('96000000-0000-4000-8000-000000000061', 650, 24);
insert into public.locations (id, location_code, location_type) values
  ('98000000-0000-4000-8000-000000000061', 'M6-RACK-61', 'rack'),
  ('98000000-0000-4000-8000-000000000062', 'M6-RACK-62', 'rack'),
  ('98000000-0000-4000-8000-000000000063', 'M6-RACK-63', 'rack'),
  ('98000000-0000-4000-8000-000000000064', 'M6-RACK-HOLD', 'rack'),
  ('98000000-0000-4000-8000-000000000065', 'M6-RACK-EMPTY', 'rack'),
  ('98000000-0000-4000-8000-000000000066', 'M6-PACKING', 'packing'),
  ('98000000-0000-4000-8000-000000000067', 'M6-STAGING', 'shipping_staging');

insert into public.pallets (
  id, pallet_code, part_id, heat_number, lot_number, packed_by_user_id,
  packed_at, created_at, pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
  original_boxes, original_pieces, current_boxes, current_pieces,
  current_location_id, lifecycle_status, lifecycle_status_before_hold, hold_reason
) values
  ('97000000-0000-4000-8000-000000000061', 'MM-P-9600061', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-61', 'M6-LOT-61', '95000000-0000-4000-8000-000000000061', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 700, 48, 31, 21700, 31, 21700, '98000000-0000-4000-8000-000000000061', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000062', 'MM-P-9600062', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-62', 'M6-LOT-62', '95000000-0000-4000-8000-000000000061', '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z', 700, 48, 48, 33600, 48, 33600, '98000000-0000-4000-8000-000000000062', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000063', 'MM-P-9600063', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-63', 'M6-LOT-63', '95000000-0000-4000-8000-000000000061', '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z', 700, 48, 10, 7000, 10, 7000, '98000000-0000-4000-8000-000000000063', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000064', 'MM-P-9600064', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-64', 'M6-LOT-64', '95000000-0000-4000-8000-000000000061', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', 700, 48, 20, 14000, 20, 14000, '98000000-0000-4000-8000-000000000064', 'on_hold', 'stored', 'Fictional inspection'),
  ('97000000-0000-4000-8000-000000000065', 'MM-P-9600065', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-65', 'M6-LOT-65', '95000000-0000-4000-8000-000000000061', '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z', 700, 48, 20, 14000, 20, 14000, null, 'shipped', null, null),
  ('97000000-0000-4000-8000-000000000066', 'MM-P-9600066', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-66', 'M6-LOT-66', '95000000-0000-4000-8000-000000000061', '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z', 700, 48, 20, 14000, 0, 0, '98000000-0000-4000-8000-000000000065', 'stored', null, null),
  ('97000000-0000-4000-8000-000000000067', 'MM-P-9600067', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-67', 'M6-LOT-67', '95000000-0000-4000-8000-000000000061', '2026-08-04T00:00:00Z', '2026-08-04T00:00:00Z', 700, 48, 20, 14000, 20, 14000, '98000000-0000-4000-8000-000000000066', 'created', null, null),
  ('97000000-0000-4000-8000-000000000068', 'MM-P-9600068', '96000000-0000-4000-8000-000000000061', 'M6-HEAT-68', 'M6-LOT-68', '95000000-0000-4000-8000-000000000061', '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z', 700, 48, 20, 14000, 20, 14000, '98000000-0000-4000-8000-000000000067', 'shipping_staging', null, null);

select pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.pallets', 'SELECT')
  and has_table_privilege('authenticated', 'public.locations', 'SELECT')
  and not has_table_privilege('anon', 'public.pallets', 'SELECT')
  and not has_table_privilege('authenticated', 'public.pallets', 'UPDATE'),
  'Find retains authenticated read-only table access'
);

set local role authenticated;
select pg_temp.assert_true(
  (select array_agg(p.pallet_code order by p.packed_at, p.created_at, p.id)
   from public.pallets p
   join public.locations l on l.id = p.current_location_id
   where p.part_id = '96000000-0000-4000-8000-000000000061'
     and p.lifecycle_status = 'stored'
     and p.current_boxes > 0 and p.current_pieces > 0
     and l.location_type = 'rack')
  = array['MM-P-9600061', 'MM-P-9600062', 'MM-P-9600063'],
  'oldest eligible stored pallet wins, stable ID breaks exact timestamp ties; held, shipped, empty, created and staging are excluded'
);
select pg_temp.assert_true(
  (select (count(*), sum(p.current_boxes), sum(p.current_pieces))
   from public.pallets p join public.locations l on l.id = p.current_location_id
   where p.part_id = '96000000-0000-4000-8000-000000000061'
     and p.lifecycle_status = 'stored'
     and p.current_boxes > 0 and p.current_pieces > 0
     and l.location_type = 'rack') = (3::bigint, 89::bigint, 62300::bigint),
  'available totals exclude unavailable inventory and use current pieces'
);
select pg_temp.assert_true(
  (select string_agg(case when current_boxes >= boxes_per_full_pallet_snapshot then 'FULL' else 'PARTIAL' end, ',' order by id)
   from public.pallets where id in (
     '97000000-0000-4000-8000-000000000061',
     '97000000-0000-4000-8000-000000000062')) = 'PARTIAL,FULL',
  'fill status derives from each pallet snapshot rather than current packing spec'
);
select pg_temp.assert_true(
  (select count(*) from public.pallets
   where part_id = '96000000-0000-4000-8000-000000000061'
     and lifecycle_status = 'on_hold' and current_boxes > 0 and current_pieces > 0) = 1,
  'held inventory is separately detectable but not available'
);
reset role;

rollback;
