# ADR-0001: Server-Authoritative Inventory Data

## Status

Accepted

## Date

2026-10-04

## Context

Workers may act on the same pallet from unreliable factory connections. The application must answer what is true now while preserving how the inventory reached that state. Packing standards can also change after a pallet is created.

## Decision

Use Supabase PostgreSQL as the V1 inventory authority. Store current pallet state on `pallets`, preserve every inventory event in append-only `inventory_transactions`, and copy packing values onto each pallet at creation.

Authenticated browser users receive read access only in the initial schema. Inventory changes will be exposed later through protected database functions that validate authorization and update current state and history atomically.

## Reason

This design keeps floor reads fast without trusting cached browser state for inventory writes. The transaction history remains auditable, and packing snapshots keep historical quantity calculations stable.

## Tradeoffs

- Current state and event history are intentionally duplicated and must be changed in one transaction.
- Feature work requires protected database functions instead of direct table writes.
- Generated TypeScript types require a running or linked Supabase database.

## Consequences

- Normal authenticated users cannot directly change pallet quantities or transaction history.
- Future write operations must enforce authorization, concurrency, and idempotency on the server.
- An on-hold pallet retains its prior lifecycle state so release does not require inference from location or history.
- Rack occupancy is derived from pallet locations rather than stored as a second mutable truth; rack capacity is defined in ADR-0002.
- Tests must cover both the current pallet record and its corresponding audit event.

## Revisit When

Revisit if PostgreSQL no longer meets the product's transactional requirements or if an approved integration requires a different authoritative inventory system.
