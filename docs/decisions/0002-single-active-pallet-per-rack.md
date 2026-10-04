# ADR-0002: One Active Pallet per Rack Location

## Status

Accepted

## Date

2026-10-04

## Context

A normal rack location may hold only one active pallet, while packing and shipping staging are shared work areas that may hold multiple pallets. The pallet's `current_location_id` remains the authoritative location, so a separate mutable occupancy flag would risk disagreement.

The rule depends on `pallets.current_location_id`, `pallets.lifecycle_status`, and `locations.location_type`. PostgreSQL partial-index predicates cannot reference the related `locations` row, and a global unique constraint on `current_location_id` would incorrectly limit shared locations.

## Decision

Treat every pallet whose lifecycle is not `shipped` as active for rack capacity, including on-hold pallets. Enforce one active pallet per rack with database triggers that lock affected location rows before checking occupancy. Also reject changing a shared location to `rack` while it contains multiple active pallets.

Future protected Store and Move RPCs must lock the pallet, lock affected location rows in stable ID order, recheck the same destination rule, update pallet state, and append history in one transaction. Packing and shipping staging locations remain multi-pallet.

## Reason

Locking the destination row serializes concurrent claims for the same rack without duplicating `location_type` onto every pallet. Keeping the invariant in the database protects it even before the workflow RPCs exist and provides a final safety net after they are added.

## Tradeoffs

- Cross-table trigger logic is more involved than a unique constraint.
- Store and Move RPCs must follow the same locking order to avoid deadlocks and provide a worker-friendly error.
- A shipped pallet may retain a location reference for historical context without consuming rack capacity.

## Consequences

- Two concurrent attempts to claim an empty rack cannot both succeed.
- On-hold pallets continue to reserve their rack.
- Packing and shipping staging can contain multiple pallets.
- Workers receive `LOCATION OCCUPIED` and are directed to scan another location.
- Tests must cover occupied racks, shared locations, shipped pallets, location-type changes, and concurrent claims.

## Revisit When

Revisit if the warehouse introduces multi-position rack locations or changes the definition of an active pallet.
