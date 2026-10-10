# ADR-0004: Shipping Removes Facility Inventory

## Status

Accepted

## Date

2026-10-10

## Context

Before Shipping, the schema permitted a `shipped` pallet with positive current
quantities and even a historical current-location reference. That conflicted
with the zero-balance shipped examples and left the meaning of “current” unclear.
Pull Boxes deliberately reserves final depletion for Shipping.

## Decision

`pallets.current_boxes` and `current_pieces` are quantities physically remaining
in the facility. Staging preserves them. Dispatch from a stored rack or shipping
staging sets both to zero, clears `current_location_id`, and sets `shipped` in one
protected transaction. The `shipped` event records the actual pre-dispatch
quantity, its full negative change, zero after quantity, source location, actor,
database time, references, and idempotency key. Packing snapshots, original
quantity, `packed_at`, identity, and earlier events remain untouched.

Hot jobs in `created` state may stage from packing or no location, then dispatch;
they cannot dispatch directly from `created`. Stored pallets may stage or dispatch
directly. PO/BOL are optional references in V1, normalized by trimming; neither
is unique because one BOL can cover multiple pallets.

## Reason

The current pallet row answers how much inventory remains on site. Immutable
shipment history answers how much left. This avoids a second shipped-quantity
source of truth and makes final-box disposition explicit.

## Tradeoffs

The shipped pallet's current quantity cannot be used to display what was
shipped; readers must use its immutable dispatch event. Existing defensive SQL
fixtures with positive shipped balances are replaced by realistic zero-balance
fixtures. Find still filters by lifecycle, not just positive quantity.

## Consequences

A database check rejects shipped pallets with nonzero quantity or a current
location. This supersedes ADR-0002's earlier allowance for a shipped pallet to
retain a historical *current* location; the source location instead lives in
the shipment event. Applying this migration to a database with such old shipped
rows requires a separate audited reconciliation; the migration never rewrites
historical rows silently. Rollback-only tests cover staging, direct dispatch,
hot jobs, partial/final boxes, audit math, stale state, and idempotency.

## Revisit When

An approved returns or external inventory integration needs an explicit
post-shipment quantity model.
