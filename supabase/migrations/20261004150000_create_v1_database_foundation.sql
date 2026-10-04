-- Mission 2 establishes the V1 data model and secure access boundary.
-- Inventory-changing writes remain unavailable to browser roles until protected
-- database functions are introduced in a later mission.

create type public.user_role as enum ('worker', 'supervisor');

create type public.pallet_lifecycle_status as enum (
  'created',
  'stored',
  'shipping_staging',
  'on_hold',
  'shipped'
);

create type public.adjustment_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.location_type as enum (
  'rack',
  'shipping_staging',
  'packing'
);

create type public.inventory_transaction_type as enum (
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
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null,
  role public.user_role not null default 'worker',
  employee_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint profiles_employee_code_not_blank check (
    employee_code is null or btrim(employee_code) <> ''
  )
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  part_number text not null unique,
  description text not null,
  product_family text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parts_part_number_not_blank check (btrim(part_number) <> ''),
  constraint parts_description_not_blank check (btrim(description) <> ''),
  constraint parts_product_family_not_blank check (btrim(product_family) <> '')
);

create table public.packing_specs (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null unique references public.parts (id) on delete restrict,
  pieces_per_box integer not null,
  boxes_per_full_pallet integer not null,
  pieces_per_full_pallet integer generated always as (
    pieces_per_box * boxes_per_full_pallet
  ) stored,
  estimated_box_weight_lb numeric(10, 2),
  estimated_full_pallet_weight_lb numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_specs_pieces_per_box_positive check (pieces_per_box > 0),
  constraint packing_specs_boxes_per_full_pallet_positive check (
    boxes_per_full_pallet > 0
  ),
  constraint packing_specs_box_weight_positive check (
    estimated_box_weight_lb is null or estimated_box_weight_lb > 0
  ),
  constraint packing_specs_pallet_weight_positive check (
    estimated_full_pallet_weight_lb is null
    or estimated_full_pallet_weight_lb > 0
  )
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  location_code text not null unique,
  location_type public.location_type not null,
  zone text,
  rack text,
  position text,
  preferred_product_family text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_code_not_blank check (btrim(location_code) <> ''),
  constraint locations_zone_not_blank check (zone is null or btrim(zone) <> ''),
  constraint locations_rack_not_blank check (rack is null or btrim(rack) <> ''),
  constraint locations_position_not_blank check (
    position is null or btrim(position) <> ''
  ),
  constraint locations_preferred_family_not_blank check (
    preferred_product_family is null
    or btrim(preferred_product_family) <> ''
  )
);

create table public.pallets (
  id uuid primary key default gen_random_uuid(),
  pallet_code text not null unique,
  part_id uuid not null references public.parts (id) on delete restrict,
  heat_number text not null,
  lot_number text not null,
  machine_code text,
  packed_by_user_id uuid not null references public.profiles (id) on delete restrict,
  packed_at timestamptz not null default now(),
  pieces_per_box_snapshot integer not null,
  boxes_per_full_pallet_snapshot integer not null,
  estimated_box_weight_lb_snapshot numeric(10, 2),
  original_boxes integer not null,
  original_pieces integer not null,
  current_boxes integer not null,
  current_pieces integer not null,
  current_location_id uuid references public.locations (id) on delete restrict,
  lifecycle_status public.pallet_lifecycle_status not null default 'created',
  lifecycle_status_before_hold public.pallet_lifecycle_status,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pallets_code_not_blank check (btrim(pallet_code) <> ''),
  constraint pallets_heat_number_not_blank check (btrim(heat_number) <> ''),
  constraint pallets_lot_number_not_blank check (btrim(lot_number) <> ''),
  constraint pallets_machine_code_not_blank check (
    machine_code is null or btrim(machine_code) <> ''
  ),
  constraint pallets_pieces_per_box_snapshot_positive check (
    pieces_per_box_snapshot > 0
  ),
  constraint pallets_boxes_per_full_pallet_snapshot_positive check (
    boxes_per_full_pallet_snapshot > 0
  ),
  constraint pallets_box_weight_snapshot_positive check (
    estimated_box_weight_lb_snapshot is null
    or estimated_box_weight_lb_snapshot > 0
  ),
  constraint pallets_original_boxes_positive check (original_boxes > 0),
  constraint pallets_original_pieces_positive check (original_pieces > 0),
  constraint pallets_current_boxes_nonnegative check (current_boxes >= 0),
  constraint pallets_current_pieces_nonnegative check (current_pieces >= 0),
  constraint pallets_original_piece_math check (
    original_pieces = original_boxes * pieces_per_box_snapshot
  ),
  constraint pallets_current_piece_math check (
    current_pieces = current_boxes * pieces_per_box_snapshot
  ),
  constraint pallets_hold_state_consistent check (
    (
      lifecycle_status = 'on_hold'
      and lifecycle_status_before_hold in (
        'created',
        'stored',
        'shipping_staging'
      )
      and hold_reason is not null
      and btrim(hold_reason) <> ''
    )
    or (
      lifecycle_status <> 'on_hold'
      and lifecycle_status_before_hold is null
      and hold_reason is null
    )
  )
);

create table public.adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references public.pallets (id) on delete restrict,
  requested_by_user_id uuid not null references public.profiles (id) on delete restrict,
  system_boxes integer not null,
  counted_boxes integer not null,
  box_difference integer not null,
  system_pieces integer not null,
  counted_pieces integer not null,
  piece_difference integer not null,
  reason_code text not null,
  reason_notes text,
  status public.adjustment_status not null default 'pending',
  reviewed_by_user_id uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adjustment_requests_system_boxes_nonnegative check (system_boxes >= 0),
  constraint adjustment_requests_counted_boxes_nonnegative check (counted_boxes >= 0),
  constraint adjustment_requests_system_pieces_nonnegative check (system_pieces >= 0),
  constraint adjustment_requests_counted_pieces_nonnegative check (counted_pieces >= 0),
  constraint adjustment_requests_box_math check (
    box_difference = counted_boxes - system_boxes
  ),
  constraint adjustment_requests_piece_math check (
    piece_difference = counted_pieces - system_pieces
  ),
  constraint adjustment_requests_difference_nonzero check (
    box_difference <> 0
    and piece_difference <> 0
  ),
  constraint adjustment_requests_difference_direction check (
    (box_difference < 0 and piece_difference < 0)
    or (box_difference > 0 and piece_difference > 0)
  ),
  constraint adjustment_requests_reason_code_not_blank check (
    btrim(reason_code) <> ''
  ),
  constraint adjustment_requests_reason_notes_not_blank check (
    reason_notes is null or btrim(reason_notes) <> ''
  ),
  constraint adjustment_requests_review_notes_not_blank check (
    review_notes is null or btrim(review_notes) <> ''
  ),
  constraint adjustment_requests_review_state check (
    (
      status = 'pending'
      and reviewed_by_user_id is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected')
      and reviewed_by_user_id is not null
      and reviewed_at is not null
    )
  )
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references public.pallets (id) on delete restrict,
  transaction_type public.inventory_transaction_type not null,
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  previous_boxes integer,
  box_change integer,
  new_boxes integer,
  previous_pieces integer,
  piece_change integer,
  new_pieces integer,
  previous_location_id uuid references public.locations (id) on delete restrict,
  new_location_id uuid references public.locations (id) on delete restrict,
  po_reference text,
  bol_reference text,
  reason_code text,
  reason_notes text,
  adjustment_request_id uuid references public.adjustment_requests (id) on delete restrict,
  idempotency_key text unique,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_transactions_box_change_complete check (
    (
      previous_boxes is null
      and box_change is null
      and new_boxes is null
    )
    or (
      previous_boxes is not null
      and box_change is not null
      and new_boxes is not null
      and previous_boxes >= 0
      and new_boxes >= 0
      and new_boxes = previous_boxes + box_change
    )
  ),
  constraint inventory_transactions_piece_change_complete check (
    (
      previous_pieces is null
      and piece_change is null
      and new_pieces is null
    )
    or (
      previous_pieces is not null
      and piece_change is not null
      and new_pieces is not null
      and previous_pieces >= 0
      and new_pieces >= 0
      and new_pieces = previous_pieces + piece_change
    )
  ),
  constraint inventory_transactions_quantity_dimensions_together check (
    (
      previous_boxes is null
      and previous_pieces is null
    )
    or (
      previous_boxes is not null
      and previous_pieces is not null
    )
  ),
  constraint inventory_transactions_po_reference_not_blank check (
    po_reference is null or btrim(po_reference) <> ''
  ),
  constraint inventory_transactions_bol_reference_not_blank check (
    bol_reference is null or btrim(bol_reference) <> ''
  ),
  constraint inventory_transactions_reason_code_not_blank check (
    reason_code is null or btrim(reason_code) <> ''
  ),
  constraint inventory_transactions_reason_notes_not_blank check (
    reason_notes is null or btrim(reason_notes) <> ''
  ),
  constraint inventory_transactions_idempotency_key_not_blank check (
    idempotency_key is null or btrim(idempotency_key) <> ''
  ),
  constraint inventory_transactions_metadata_object check (
    metadata is null or jsonb_typeof(metadata) = 'object'
  )
);

create index pallets_part_fifo_idx
  on public.pallets (part_id, packed_at, created_at);
create index pallets_current_location_idx
  on public.pallets (current_location_id)
  where current_location_id is not null;
create index inventory_transactions_pallet_history_idx
  on public.inventory_transactions (pallet_id, occurred_at, created_at);
create index inventory_transactions_actor_idx
  on public.inventory_transactions (actor_user_id);
create index adjustment_requests_pending_idx
  on public.adjustment_requests (status, created_at);
create index adjustment_requests_pallet_idx
  on public.adjustment_requests (pallet_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger parts_set_updated_at
before update on public.parts
for each row execute function public.set_updated_at();

create trigger packing_specs_set_updated_at
before update on public.packing_specs
for each row execute function public.set_updated_at();

create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

create trigger pallets_set_updated_at
before update on public.pallets
for each row execute function public.set_updated_at();

create function public.enforce_rack_location_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  destination_type public.location_type;
  destination_code text;
begin
  -- Every assignment and release locks the affected location rows in a stable
  -- order so concurrent Store/Move operations cannot both claim one rack.
  if tg_op = 'UPDATE' then
    perform 1
    from public.locations
    where id in (old.current_location_id, new.current_location_id)
    order by id
    for update;
  elsif new.current_location_id is not null then
    perform 1
    from public.locations
    where id = new.current_location_id
    for update;
  end if;

  if new.current_location_id is null or new.lifecycle_status = 'shipped' then
    return new;
  end if;

  select location_type, location_code
  into destination_type, destination_code
  from public.locations
  where id = new.current_location_id;

  if destination_type = 'rack' and exists (
    select 1
    from public.pallets as occupying_pallet
    where occupying_pallet.current_location_id = new.current_location_id
      and occupying_pallet.lifecycle_status <> 'shipped'
      and occupying_pallet.id <> new.id
  ) then
    raise exception using
      message = 'LOCATION OCCUPIED',
      detail = destination_code || ' already contains a pallet.',
      hint = 'Scan another location.';
  end if;

  return new;
end;
$$;

create trigger pallets_enforce_rack_location_capacity_on_insert
before insert on public.pallets
for each row execute function public.enforce_rack_location_capacity();

create trigger pallets_enforce_rack_location_capacity_on_update
before update of current_location_id, lifecycle_status on public.pallets
for each row execute function public.enforce_rack_location_capacity();

create function public.enforce_location_type_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.location_type = 'rack'
    and old.location_type <> 'rack'
    and (
      select count(*)
      from public.pallets
      where current_location_id = new.id
        and lifecycle_status <> 'shipped'
    ) > 1
  then
    raise exception using
      message = 'LOCATION OCCUPIED',
      detail = new.location_code || ' contains multiple active pallets and cannot be changed to a rack.',
      hint = 'Move pallets until only one active pallet remains.';
  end if;

  return new;
end;
$$;

create trigger locations_enforce_type_capacity
before update of location_type on public.locations
for each row execute function public.enforce_location_type_capacity();

create trigger adjustment_requests_set_updated_at
before update on public.adjustment_requests
for each row execute function public.set_updated_at();

create function public.enforce_adjustment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> new.status and (
    old.status <> 'pending'
    or new.status not in ('approved', 'rejected')
  ) then
    raise exception 'Invalid adjustment status transition';
  end if;

  return new;
end;
$$;

create trigger adjustment_requests_enforce_status_transition
before update of status on public.adjustment_requests
for each row execute function public.enforce_adjustment_status_transition();

revoke all on function public.set_updated_at() from public;
revoke all on function public.enforce_rack_location_capacity() from public;
revoke all on function public.enforce_location_type_capacity() from public;
revoke all on function public.enforce_adjustment_status_transition() from public;

alter table public.profiles enable row level security;
alter table public.parts enable row level security;
alter table public.packing_specs enable row level security;
alter table public.locations enable row level security;
alter table public.pallets enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.adjustment_requests enable row level security;

create policy "Authenticated users can read profiles"
on public.profiles for select to authenticated using (true);

create policy "Authenticated users can read parts"
on public.parts for select to authenticated using (true);

create policy "Authenticated users can read packing specs"
on public.packing_specs for select to authenticated using (true);

create policy "Authenticated users can read locations"
on public.locations for select to authenticated using (true);

create policy "Authenticated users can read pallets"
on public.pallets for select to authenticated using (true);

create policy "Authenticated users can read inventory transactions"
on public.inventory_transactions for select to authenticated using (true);

create policy "Requesters and supervisors can read adjustment requests"
on public.adjustment_requests
for select
to authenticated
using (
  requested_by_user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'supervisor'
      and profiles.active
  )
);

revoke all on table
  public.profiles,
  public.parts,
  public.packing_specs,
  public.locations,
  public.pallets,
  public.inventory_transactions,
  public.adjustment_requests
from anon, authenticated;

grant select on table
  public.profiles,
  public.parts,
  public.packing_specs,
  public.locations,
  public.pallets,
  public.inventory_transactions,
  public.adjustment_requests
to authenticated;

comment on table public.inventory_transactions is
  'Append-only audit history. Browser roles have read-only access; writes must use protected database operations.';
comment on column public.pallets.current_location_id is
  'Authoritative current location. One non-shipped pallet is allowed per rack; packing and shipping staging may contain multiple pallets.';
comment on column public.pallets.pieces_per_box_snapshot is
  'Packing value captured when the pallet is created so historical math remains stable.';
comment on column public.pallets.lifecycle_status_before_hold is
  'Lifecycle state restored by the future protected hold-release operation.';
