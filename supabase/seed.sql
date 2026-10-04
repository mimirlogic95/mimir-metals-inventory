-- Fictional Mimir Metals development data only.
-- User-dependent pallets and transactions are intentionally omitted because
-- profiles must reference real Supabase Auth users in the local environment.

insert into public.parts (
  id,
  part_number,
  description,
  product_family
)
values
  ('10000000-0000-4000-8000-000000000001', 'MM-A141', '1/4 x 1-1/8 Anchor', '1/4 Anchor'),
  ('10000000-0000-4000-8000-000000000002', 'MM-A3815', '3/8 x 1-5/8 Headed Anchor', '3/8 Anchor'),
  ('10000000-0000-4000-8000-000000000003', 'MM-A1212', '1/2 x 12-1/8 Headed Anchor', '1/2 Anchor'),
  ('10000000-0000-4000-8000-000000000004', 'MM-A586', '5/8 x 6-3/16 Anchor', '5/8 Anchor'),
  ('10000000-0000-4000-8000-000000000005', 'MM-SC343', '3/4 x 3-3/16 Shear Connector', '3/4 Shear Connector'),
  ('10000000-0000-4000-8000-000000000006', 'MM-SC785', '7/8 x 5-3/16 Shear Connector', '7/8 Shear Connector'),
  ('10000000-0000-4000-8000-000000000007', 'MM-SC18', '1 x 8-1/4 Shear Connector', '1 Inch Shear Connector')
on conflict (part_number) do update
set
  description = excluded.description,
  product_family = excluded.product_family,
  active = true;

with packing_seed (
  part_number,
  pieces_per_box,
  boxes_per_full_pallet,
  estimated_box_weight_lb,
  estimated_full_pallet_weight_lb
) as (
  values
    ('MM-A141', 1000, 60, 35.00, 2100.00),
    ('MM-A3815', 700, 48, 56.00, 2688.00),
    ('MM-A1212', 50, 20, 70.00, 1400.00),
    ('MM-A586', 200, 36, 62.00, 2232.00),
    ('MM-SC343', 100, 30, 58.00, 1740.00),
    ('MM-SC785', 75, 24, 64.00, 1536.00),
    ('MM-SC18', 40, 20, 72.00, 1440.00)
)
insert into public.packing_specs (
  part_id,
  pieces_per_box,
  boxes_per_full_pallet,
  estimated_box_weight_lb,
  estimated_full_pallet_weight_lb
)
select
  parts.id,
  packing_seed.pieces_per_box,
  packing_seed.boxes_per_full_pallet,
  packing_seed.estimated_box_weight_lb,
  packing_seed.estimated_full_pallet_weight_lb
from packing_seed
join public.parts using (part_number)
on conflict (part_id) do update
set
  pieces_per_box = excluded.pieces_per_box,
  boxes_per_full_pallet = excluded.boxes_per_full_pallet,
  estimated_box_weight_lb = excluded.estimated_box_weight_lb,
  estimated_full_pallet_weight_lb = excluded.estimated_full_pallet_weight_lb;

insert into public.locations (
  id,
  location_code,
  location_type,
  zone,
  rack,
  position
)
values
  ('30000000-0000-4000-8000-000000000001', 'B-001-AA', 'rack', 'B', '001', 'AA'),
  ('30000000-0000-4000-8000-000000000002', 'B-001-AB', 'rack', 'B', '001', 'AB'),
  ('30000000-0000-4000-8000-000000000003', 'B-001-AC', 'rack', 'B', '001', 'AC'),
  ('30000000-0000-4000-8000-000000000004', 'B-001-AD', 'rack', 'B', '001', 'AD'),
  ('30000000-0000-4000-8000-000000000005', 'B-002-AA', 'rack', 'B', '002', 'AA'),
  ('30000000-0000-4000-8000-000000000006', 'B-002-AB', 'rack', 'B', '002', 'AB'),
  ('30000000-0000-4000-8000-000000000007', 'B-002-AC', 'rack', 'B', '002', 'AC'),
  ('30000000-0000-4000-8000-000000000008', 'B-002-AD', 'rack', 'B', '002', 'AD'),
  ('30000000-0000-4000-8000-000000000009', 'B-003-AA', 'rack', 'B', '003', 'AA'),
  ('30000000-0000-4000-8000-000000000010', 'B-003-AB', 'rack', 'B', '003', 'AB'),
  ('30000000-0000-4000-8000-000000000011', 'B-003-AC', 'rack', 'B', '003', 'AC'),
  ('30000000-0000-4000-8000-000000000012', 'B-003-AD', 'rack', 'B', '003', 'AD'),
  ('30000000-0000-4000-8000-000000000013', 'B-004-AA', 'rack', 'B', '004', 'AA'),
  ('30000000-0000-4000-8000-000000000014', 'B-004-AB', 'rack', 'B', '004', 'AB'),
  ('30000000-0000-4000-8000-000000000015', 'PACKING-01', 'packing', 'PACKING', null, null),
  ('30000000-0000-4000-8000-000000000016', 'SHIPPING-STAGING-01', 'shipping_staging', 'SHIPPING', null, null)
on conflict (location_code) do update
set
  location_type = excluded.location_type,
  zone = excluded.zone,
  rack = excluded.rack,
  position = excluded.position,
  active = true;
