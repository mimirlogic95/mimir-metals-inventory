-- Development-only fictional held pallet for Mission 6 browser validation.
-- Apply only after verifying the CLI link is Mimir Metals Inventory Development.
-- This is persistent test history; rerunning the script must not duplicate it.
begin;

do $$
declare
  fixture_heat constant text := 'M6-FICTIONAL-HOLD-LIVE';
  fixture_location_code constant text := 'M6-FICTIONAL-HOLD-RACK';
  existing_count integer;
  selected_part_id uuid;
  selected_actor_id uuid;
  selected_location_id uuid;
  selected_pallet_id uuid := gen_random_uuid();
  selected_pallet_code text;
  selected_pieces_per_box integer;
  selected_boxes_per_full_pallet integer;
  selected_box_weight numeric(10, 2);
begin
  select count(*) into existing_count
  from public.pallets
  where heat_number = fixture_heat and lot_number = fixture_heat;

  if existing_count > 0 then
    if existing_count <> 1 or not exists (
      select 1 from public.pallets p
      join public.parts part on part.id = p.part_id
      join public.locations location on location.id = p.current_location_id
      where p.heat_number = fixture_heat and p.lot_number = fixture_heat
        and part.part_number = 'MM-A3815'
        and p.lifecycle_status = 'on_hold'
        and p.lifecycle_status_before_hold = 'stored'
        and location.location_code = fixture_location_code
        and (select count(*) from public.inventory_transactions t
             where t.pallet_id = p.id) = 3
    ) then
      raise exception 'Existing Mission 6 live fixture is inconsistent';
    end if;
    return;
  end if;

  select part.id, spec.pieces_per_box, spec.boxes_per_full_pallet,
         spec.estimated_box_weight_lb
  into selected_part_id, selected_pieces_per_box,
       selected_boxes_per_full_pallet, selected_box_weight
  from public.parts part
  join public.packing_specs spec on spec.part_id = part.id
  where part.part_number = 'MM-A3815' and part.active;
  if selected_part_id is null then
    raise exception 'Fictional MM-A3815 part and packing spec are required';
  end if;

  select id into selected_actor_id
  from public.profiles
  where active and role in ('worker', 'supervisor')
  order by id limit 1;
  if selected_actor_id is null then
    raise exception 'An active fictional development profile is required';
  end if;

  insert into public.locations (location_code, location_type, zone)
  values (fixture_location_code, 'rack', 'M6')
  on conflict (location_code) do nothing;
  select id into selected_location_id from public.locations
  where location_code = fixture_location_code and location_type = 'rack' and active;
  if selected_location_id is null or exists (
    select 1 from public.pallets
    where current_location_id = selected_location_id
      and lifecycle_status <> 'shipped'
  ) then
    raise exception 'Mission 6 fictional rack is unavailable';
  end if;

  selected_pallet_code := 'MM-P-' || lpad(nextval('public.pallet_code_seq'::regclass)::text, 7, '0');
  insert into public.pallets (
    id, pallet_code, part_id, heat_number, lot_number, machine_code,
    packed_by_user_id, pieces_per_box_snapshot, boxes_per_full_pallet_snapshot,
    estimated_box_weight_lb_snapshot, original_boxes, original_pieces,
    current_boxes, current_pieces, lifecycle_status
  ) values (
    selected_pallet_id, selected_pallet_code, selected_part_id,
    fixture_heat, fixture_heat, 'M6-FICTIONAL-MACHINE',
    selected_actor_id, selected_pieces_per_box, selected_boxes_per_full_pallet,
    selected_box_weight, 10, 10 * selected_pieces_per_box,
    10, 10 * selected_pieces_per_box, 'created'
  );
  insert into public.inventory_transactions (
    pallet_id, transaction_type, actor_user_id,
    previous_boxes, box_change, new_boxes,
    previous_pieces, piece_change, new_pieces
  ) values (
    selected_pallet_id, 'pallet_created', selected_actor_id,
    0, 10, 10, 0, 10 * selected_pieces_per_box, 10 * selected_pieces_per_box
  );

  update public.pallets set
    lifecycle_status = 'stored', current_location_id = selected_location_id
  where id = selected_pallet_id;
  insert into public.inventory_transactions (
    pallet_id, transaction_type, actor_user_id,
    previous_boxes, box_change, new_boxes,
    previous_pieces, piece_change, new_pieces,
    new_location_id
  ) values (
    selected_pallet_id, 'stored', selected_actor_id,
    10, 0, 10, 10 * selected_pieces_per_box, 0, 10 * selected_pieces_per_box,
    selected_location_id
  );

  update public.pallets set
    lifecycle_status = 'on_hold',
    lifecycle_status_before_hold = 'stored',
    hold_reason = 'M6 fictional browser validation'
  where id = selected_pallet_id;
  insert into public.inventory_transactions (
    pallet_id, transaction_type, actor_user_id,
    previous_boxes, box_change, new_boxes,
    previous_pieces, piece_change, new_pieces,
    previous_location_id, new_location_id, reason_notes
  ) values (
    selected_pallet_id, 'hold_placed', selected_actor_id,
    10, 0, 10, 10 * selected_pieces_per_box, 0, 10 * selected_pieces_per_box,
    selected_location_id, selected_location_id,
    'M6 fictional browser validation'
  );
end;
$$;

commit;

select count(*) = 1 as fictional_held_fixture_present
from public.pallets
where heat_number = 'M6-FICTIONAL-HOLD-LIVE'
  and lot_number = 'M6-FICTIONAL-HOLD-LIVE'
  and lifecycle_status = 'on_hold';
