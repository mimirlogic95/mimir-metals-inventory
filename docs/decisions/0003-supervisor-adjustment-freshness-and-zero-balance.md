# ADR-0003: Supervisor Adjustment Freshness and Zero Balance

## Status

Accepted

## Date

2026-10-09

## Context

A Count request preserves quantities and rack, but a pallet can move away and
back or enter/leave hold before review. Comparing only current values could
approve stale evidence. Workers may report a physical zero, while V1 has no
defined depleted-pallet lifecycle or disposition.

## Decision

New requests capture a database-maintained pallet version and lifecycle/hold
context. Approval by a different active supervisor requires an unchanged
version and matching preserved state, verifies snapshot math and Count evidence,
and leaves rack, hold, and FIFO age unchanged. Existing requests with no
reconstructable version cannot be approved; they can be rejected and recounted.
Physical zero remains valid Count evidence, but approval to zero is blocked in
the protected RPC. A supervisor may reject it with a recount/investigation
reason. No automatic shipping, relocation, rack release, or depleted lifecycle
is inferred.

## Reason

A monotonic version detects change-and-return cycles without guessing from
timestamps. Blocking zero approval avoids creating an ambiguous active pallet
whose rack remains occupied but whose disposition is undefined.

## Tradeoffs

Any pallet update conservatively invalidates a pending request, even if the
visible quantity did not change. Older pending requests require a new Count.
Zero discrepancies cannot be approved until a separate disposition workflow is
designed.

## Consequences

The database owns freshness, authority, and atomic audit writes. The supervisor
UI explains stale and zero-result requests but cannot bypass the server rule.
Rollback tests must cover move-away-and-return, hold context, exact retries,
and unchanged state on a blocked zero approval.

## Revisit When

Shipping and final pallet depletion receive an explicit lifecycle/disposition
policy.
