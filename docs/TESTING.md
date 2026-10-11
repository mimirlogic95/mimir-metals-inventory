# Mimir Metals Finished Goods Inventory — Testing

## Purpose

This document defines the V1 testing strategy for Mimir Metals Finished Goods Inventory.

The goal is to verify that the app is:

- Correct
- Safe to use
- Easy to understand
- Reliable on phones and tablets
- Resistant to duplicate or stale inventory changes
- Faithful to the documented worker workflow

Testing should focus first on inventory integrity and floor usability.

A polished screen is not considered correct if the underlying inventory behavior is wrong.

---

# Testing Principles

## 1. Test the Business Rules First

The highest-value tests protect inventory behavior.

Examples:

- A worker cannot pull more boxes than exist.
- A held pallet cannot be shipped.
- A duplicate request cannot remove inventory twice.
- An adjustment does not change inventory until approved.
- FIFO identifies the oldest eligible pallet.
- A pallet move preserves history.

These rules matter more than cosmetic UI details.

---

## 2. Test What the Worker Actually Does

Tests should mirror real floor workflows.

The most important paths are:

- Create pallet
- Store pallet
- Find inventory
- Pull boxes
- Move pallet
- Count inventory
- Approve/reject adjustment
- Ship pallet
- View history

Avoid spending too much time testing implementation details that workers never interact with.

---

## 3. Test the Server Separately From the UI

The frontend should never be the only thing protecting inventory.

Server-side tests should confirm that invalid actions are rejected even if the UI is bypassed.

Examples:

- Directly call pull logic with too many boxes.
- Directly attempt supervisor actions as a worker.
- Submit stale quantity data.
- Reuse an idempotency key.
- Attempt to ship a held pallet.

---

## 4. Use Fictional Data Only

All test data must use fictional Mimir Metals values.

Do not use:

- Real employer data
- Real customer names
- Real proprietary part numbers
- Real heat numbers
- Real lot numbers
- Real PO numbers
- Real BOL numbers

---

# Testing Layers

V1 should use four main testing layers:

1. Unit tests
2. Component tests
3. Integration tests
4. End-to-end tests

Each layer protects a different type of failure.

---

# Unit Tests

## Purpose

Unit tests verify small business rules and calculations in isolation.

These should be fast and deterministic.

## Required Unit Test Areas

### Packing Calculations

Test:

```text
boxes × pieces per box = total pieces
```

Examples:

31 boxes × 700 = 21,700

6 boxes × 700 = 4,200

25 boxes × 700 = 17,500

---

### Full / Partial Derivation

Test:

- 48 of 48 boxes = FULL
- 31 of 48 boxes = PARTIAL
- 1 of 48 boxes = PARTIAL
- 0 boxes + shipped state = SHIPPED

Mission 11 enforces facility-remaining accounting: staging preserves current
boxes/pieces; dispatch sets both to zero and clears current location while
the immutable `shipped` event records the full negative change from the actual
remaining balance. The old Find fixture with a positive shipped balance is
replaced with a realistic zero-balance shipped fixture. Find must still filter
by `stored` lifecycle, not just positive quantity.

After confirming the CLI link is **Mimir Metals Inventory Development**, run
`supabase/tests/shipping_dispatch.sql` via `db query --linked --file`. It begins
one transaction and ends with `ROLLBACK`; users, pallets, and events are
fictional. It checks authorization, RPC grants/search paths, read-only browser
tables, staging from rack/packing/unlocated hot jobs, shared staging capacity,
direct final-box dispatch, exact retry, stale version/location, held/shipped
rejection, reference normalization, audit math, quantity/location/packing
preservation, and forced-audit-failure rollback. Persistent parallel races and
browser dispatch require separate fixture-specific authorization; rollback-only
SQL does not prove a live two-connection race.

The follow-up `20261010130000_allow_shipping_from_inactive_sources.sql`
replaces only `ship_pallet`: existing pallets may dispatch from an inactive
rack or shipping-staging source, while staging into an inactive destination
still fails. The same rollback-only suite covers both inactive sources,
shipment audit math, exact retries, held/unauthorized/stale rejection, and
inactive-destination denial. No fixture or active-flag change persists.

The guarded `shipping_dispatch_concurrency.mjs` checks the exact development
project and five dedicated open `M11-LIVE-RACK-01`–`05` fixtures before its
four persistent races. `shipping_dispatch_browser_fixtures.mjs` similarly
checks the exact project, active fictional worker, unused fixture identifiers,
and empty `M11-BROWSER-RACK-01` before creating the two approved browser
pallets. Both scripts have a no-write `--verify-only` mode; `--execute-approved`
requires separate fixture-specific authorization and preserves audit history.

Do not store FULL/PARTIAL as a separate source of truth unless requirements change.

---

### Pull Preview

Given:

- 31 current boxes
- 700 pieces per box
- 6 requested boxes

Expect:

- 6 boxes removed
- 4,200 pieces removed
- 25 boxes remaining
- 17,500 pieces remaining

---

### Pull Validation

Test:

- Pull 1 from 31 = allowed
- Pull 31 from 31 = rejected in Mission 7; final depletion belongs to Shipping
- Pull 32 from 31 = rejected
- Pull 0 = rejected
- Pull negative quantity = rejected
- Pull decimal quantity = rejected

---

### Adjustment Calculations

Given:

System:

25 boxes

Counted:

23 boxes

Expect:

-2 boxes

If pieces per box = 700:

Expect:

-1,400 pieces

---

### FIFO Selection

Test that the oldest eligible pallet is chosen.

Exclude:

- Shipped pallets
- Held pallets
- Pallets with zero inventory
- Pallets for other parts

Use `packed_at` ascending.

Use a deterministic tie-breaker.

---

### QR Validation

Valid pallet code:

`MM-P-0004821`

Invalid examples:

- empty string
- random URL
- malformed pallet code
- location code used as pallet code

Valid location code:

`B-003-AC`

---

### Status Logic

Test lifecycle rules such as:

- Created pallet may be stored.
- Stored pallet may be moved.
- Held pallet cannot be shipped.
- Shipped pallet cannot be pulled.
- Zero-balance pallet cannot be pulled.

---

# Component Tests

## Purpose

Component tests verify worker-facing UI behavior without requiring the entire application.

Use React Testing Library or equivalent.

## Required Component Areas

### Numeric Quantity Input

Verify:

- Large controls work.
- Value increments/decrements.
- Invalid negative values are blocked.
- Confirm button state changes appropriately.

---

### Pallet Card

Verify it clearly displays:

- Pallet ID
- Part
- Box count
- Piece count
- Location
- Full/partial status
- Hold state if applicable

---

### FIFO Badge

Verify:

- Oldest eligible pallet displays **PULL FIRST**.
- Non-FIFO pallets do not.
- Held pallet does not display pull recommendation.

---

### Status Badges

Verify text exists in addition to color.

Examples:

- FULL
- PARTIAL
- ON HOLD
- SHIPPED

---

### Scan Confirmation

Verify that a scanned code does not immediately modify inventory.

Scanning should first display:

- What was scanned
- Current details
- Next action

---

### Sticky Action Bar

Verify primary actions remain visible and usable at mobile screen sizes.

---

### Success State

After a simulated successful action, verify the worker sees:

- What happened
- Pallet ID
- New quantity or location
- Timestamp/user when relevant

---

### Error State

Verify worker-friendly messages for:

- Pallet not found
- Location occupied
- Quantity too high
- Pallet on hold
- Duplicate/uncertain submission

---

# Integration Tests

## Purpose

Integration tests verify that multiple layers work together.

These tests should cover frontend-to-data-access or backend/database behavior depending on the implementation.

---

# Integration Test — Create Pallet

Given:

Part:

`MM-A3815`

Packing:

700 pieces per box

Worker creates:

31 boxes

Expect:

- Unique pallet code generated
- current_boxes = 31
- current_pieces = 21,700
- original_boxes = 31
- original_pieces = 21,700
- packing snapshot stored
- PALLET_CREATED transaction created
- actor stored
- timestamp stored

Also verify:

- Only authenticated active workers/supervisors can execute the RPC.
- The client cannot submit a piece count or packing snapshot.
- A matching idempotent retry returns the first pallet and transaction.
- Reusing a key for changed input fails.
- Zero/negative boxes and inactive parts fail.
- A forced transaction-insert failure rolls back the pallet insert.
- Generated codes are unique and match `MM-P-` plus seven digits.

---

# Integration Test — Store Pallet

Given:

Pallet:

`MM-P-0004821`

Destination:

`B-003-AC`

Expect:

- Pallet current location updated
- STORED transaction created
- Previous/new location stored
- Operation succeeds atomically

If location is invalid:

Expect rejection.

If another active pallet already occupies the destination rack:

Expect:

- Request rejected with `LOCATION OCCUPIED`
- Existing pallet remains assigned to the rack
- Incoming pallet location remains unchanged
- No STORED transaction is inserted

If the destination is `packing` or `shipping_staging` and already contains pallets:

Expect Store to reject the destination because this workflow accepts active racks only. The underlying capacity rule still permits multiple pallets at those shared locations for other workflows.

Run two concurrent Store requests for different pallets targeting the same empty rack.

Expect exactly one request to succeed. The other request must wait for the destination-location lock and then fail with `LOCATION OCCUPIED`.

Mission 5 also verifies `created` → `stored` from no location or packing, rejects stored/shipped/on-hold pallets and inactive/non-rack destinations, and checks active-profile authorization, an exact idempotent retry, changed-request key conflicts, and state/history atomicity. The local Store UI tests cover lookups, occupied previews, review-before-save, success, and retry-key reuse. Real concurrency and RPC privilege checks must run against the linked development PostgreSQL database before Mission 5 is considered fully validated.

After verifying that the CLI is linked to the intended **development** project, run:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/store_pallet.sql
node supabase/tests/store_pallet_concurrency.mjs <verified-development-project-ref>
```

The SQL test uses fictional rows and rolls back. The concurrency script requires the CLI-linked reference, the local Supabase URL, and the authenticated CLI project list to identify **Mimir Metals Inventory Development** before it writes anything; add `--verify-only` after the reference to check that guard without creating records. The full test signs in as the ignored local development worker, creates two fictional pallets, submits Store calls simultaneously to one empty rack, verifies one success/one `LOCATION OCCUPIED`, checks a retry and history, and leaves the fictional records in place to preserve immutable inventory history. It prints one unstored fictional pallet code and one open rack code for the manual browser walkthrough. Do not run it against production.

---

# Integration Test — Pull Boxes

After verifying the CLI link is **Mimir Metals Inventory Development**, run the rollback-only fictional Pull suite:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/pull_boxes.sql
```

It verifies active worker and supervisor access; unauthenticated/inactive rejection; held, shipped, empty, created, and staging rejection; invalid, excessive, full-balance, and stale pulls; snapshot-derived piece math; unchanged rack; optional PO/BOL; one transaction; exact retry and changed-request/actor conflicts; direct browser-write denial; fixed empty `SECURITY DEFINER` search path; and rollback when the audit insert fails. All fixture writes roll back.

For a real parallel race, first run the no-write target guard, then run the development-only script with the **separately verified** linked reference:

```text
node --check supabase/tests/pull_boxes_concurrency.mjs
node supabase/tests/pull_boxes_concurrency.mjs <verified-development-project-ref> --verify-only
node supabase/tests/pull_boxes_concurrency.mjs <verified-development-project-ref>
```

The script requires the linked ref, local development URL, and authenticated CLI project list to agree on **Mimir Metals Inventory Development**. It creates and stores a fictional pallet, tests simultaneous stale Pull requests, an exact retry, fractional input rejection at the live RPC boundary, final quantity, and one Pull event. Those fictional records remain in development to preserve immutable history. Never run it against production.

The browser walkthrough should start from Find, open an eligible pallet's **PULL BOXES** action, review a small partial pull, confirm, verify server-returned success and one PostgreSQL Pull event, then return to Find and verify refreshed totals and FIFO. Also check Home → Pull manual lookup, a stale or oversized error where practical, and 320px/390px/768px layouts. Do not report this browser check as passed without actually performing it.

Given:

31 boxes

Pull:

6 boxes

Expect:

- Pallet becomes 25 boxes
- Pallet becomes 17,500 pieces
- BOX_PULL transaction created
- Previous values stored
- Change values stored
- New values stored
- PO/BOL saved if supplied

---

# Integration Test — Pull Too Many

Given:

25 boxes

Request:

30 boxes

Expect:

- Request rejected
- Pallet remains 25 boxes
- No transaction inserted

---

# Integration Test — Move Pallet

Given:

Current:

`B-003-AC`

Destination:

`B-004-AB`

Expect:

- Current location becomes B-004-AB
- MOVED transaction records both locations

If B-004-AB contains another active pallet:

Expect:

- Request rejected with `LOCATION OCCUPIED`
- Pallet remains at B-003-AC
- No MOVED transaction is inserted

Move rejects `packing` and `shipping_staging` destinations. Their shared-capacity schema rule remains relevant to later workflows, not to Mission 8 Move.

After verifying that the CLI is linked to **Mimir Metals Inventory Development**, run the rollback-only fictional Move test:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/move_pallet.sql
```

It covers worker/supervisor access, inactive/unauthenticated denial, fixed `SECURITY DEFINER` boundary, direct-write denial, eligible and ineligible lifecycle/source/destination states, occupied racks including held occupants, reviewed-source stale rejection, exact retry and key conflicts, unchanged quantity/snapshot/lifecycle, correct Move history, and rollback on forced audit failure.

For real parallel requests on the verified development project, run the no-write guard first:

```text
node --check supabase/tests/move_pallet_concurrency.mjs
node supabase/tests/move_pallet_concurrency.mjs <verified-development-project-ref> --verify-only
node supabase/tests/move_pallet_concurrency.mjs <verified-development-project-ref>
```

The script checks CLI link, environment host, and authenticated project identity, then creates fictional pallets and tests two pallets competing for one rack and two destination requests competing on one pallet. Exactly one succeeds in each race. It verifies one `LOCATION OCCUPIED`, one `LOCATION CHANGED`, unchanged quantity, exact retry, and no duplicate Move history. It leaves fictional audit records intact. Do not run against production.

Browser validation should cover Home manual lookup and Find → pallet detail → Move, an open destination, review-before-save, one confirmed Move, server-returned success, updated Find rack with unchanged FIFO age, an occupied-rack warning, and 320px/390px/768px layouts. UI tests distinguish a failed pallet/rack read (**COULDN'T LOAD**) from an uncertain confirmation (**NOT SAVED YET**) and verify that confirmation retries keep the same request key. Do not report browser checks as passed unless actually exercised.

Also verify that:

- An on-hold pallet occupies rack capacity.
- A shipped pallet left with a historical current-location reference does not occupy rack capacity.
- A location containing multiple active pallets cannot be changed from a shared type to `rack`.

---

## Mission 9 Count database validation

Mission 9 rollback-only SQL validation is `supabase/tests/count_pallet.sql`.
After verifying the CLI link is **Mimir Metals Inventory Development**, run:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/count_pallet.sql
```

It checks active worker/supervisor access, anonymous/inactive rejection,
countable lifecycle rules, zero/higher/lower counts, snapshot piece math,
matched/discrepancy audit events, pending uniqueness, stale reviewed state,
idempotent retries, and atomic rollback on forced history failure. The
development-only `supabase/tests/count_pallet_concurrency.mjs` additionally
checks a real simultaneous discrepancy race and stale Count after Pull; it
creates fictional persistent records and must never run against production.

---

## Mission 10 supervisor adjustment validation

After verifying the CLI link is **Mimir Metals Inventory Development**, run:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/adjustment_decisions.sql
```

The fictional SQL fixture begins a transaction and ends with `ROLLBACK`. It
tests authenticated-only, active-supervisor approval/rejection; no direct
browser writes; Count evidence/version capture; negative, positive, and held
approval; zero-result blocking and rejection; move-away-and-return staleness;
legacy pending-request staleness; self-approval denial; reviewer attribution;
before/change/after audit math; exact retries and actor/payload conflicts.
The prior database foundation fixture also runs after Mission 10; its request
and RLS assertions use isolated fictional rows so live development history does
not change test expectations.

Persistent concurrency and browser scenarios require separate direct approval
for the specific fictional fixtures and permanent events. Do not use the
existing MM-P-0000013 pending request without specific authorization. On the
supervisor screen, verify count-time versus current values, a deliberate
confirmation step, positive/negative difference clarity, held/zero warnings,
worker access denial, and exact-key retry after uncertain confirmation. Check
320px, 390px, and 768px layouts; no horizontal overflow or tiny actions.

---

# Integration Test — Matching Count

Given:

System:

25 boxes

Counted:

25 boxes

Expect:

- No inventory quantity change
- COUNT_MATCHED transaction created

---

# Integration Test — Adjustment Request

Given:

System:

25 boxes

Counted:

23 boxes

Expect:

- Pending adjustment request created
- Pallet remains at 25 boxes
- Inventory is not changed yet

---

# Integration Test — Adjustment Approval

Given:

Pending request:

25 → 23

Supervisor approves.

Expect:

- Pallet becomes 23 boxes
- Piece quantity recalculated
- Request status = approved
- Supervisor identity stored
- ADJUSTMENT_APPROVED transaction created

All changes should succeed together.

---

# Integration Test — Adjustment Rejection

Given a pending request.

Supervisor rejects.

Expect:

- Pallet quantity unchanged
- Request status = rejected
- Reviewer stored
- ADJUSTMENT_REJECTED transaction created

---

# Integration Test — Worker Cannot Approve

Given:

Authenticated role = worker

Attempt:

Approve adjustment

Expect:

- Authorization failure
- No inventory change
- No approval transaction

This must fail server-side, not only in the UI.

---

# Integration Test — Pallet Hold

Given active pallet.

Supervisor places hold.

Expect:

- Status reflects hold
- HOLD_PLACED transaction created

Then attempt normal shipping pull.

Expect:

- Rejected

After supervisor releases hold:

- HOLD_RELEASED transaction created
- Normal eligibility restored

---

# Integration Test — Duplicate Submission

Given a valid box pull with idempotency key:

`abc-123`

Submit twice.

Expect:

- Inventory changes only once
- One effective transaction
- Retry returns safe existing result or equivalent
- No duplicate inventory removal

---

# Integration Test — Stale Update

Given:

25 boxes

Worker A pulls 10.

Inventory becomes 15.

Worker B attempts to pull 20 using stale state.

Expect:

- Worker B request rejected
- Inventory remains 15
- No invalid transaction created

---

# Integration Test — Packing Snapshot

Create pallet when:

pieces_per_box = 700

Later change master packing spec to:

650

Expect existing pallet:

- Still uses 700
- Historical quantity remains correct
- Pull calculations use pallet snapshot

---

# End-to-End Tests

## Purpose

End-to-end tests verify complete worker workflows in a running application.

Use Playwright or equivalent.

At minimum, V1 must automate the four acceptance workflows below.

---

# E2E Flow A — Create and Store

Start:

Home

Steps:

1. Tap CREATE PALLET.
2. Select MM-A3815.
3. Enter 31 boxes.
4. Confirm calculated 21,700 pieces.
5. Enter fictional heat/lot information.
6. Create pallet.
7. Verify unique pallet ID.
8. Open/print label preview.
9. Continue to STORE.
10. Select or simulate scan of B-003-AC.
11. Confirm storage.

Expect:

- Success screen
- Correct location
- Correct quantity
- Pallet history contains creation and storage events

---

# E2E Flow B — Find and Pull

Start:

Home

Steps:

1. Tap FIND.
2. Search MM-A3815.
3. Verify total inventory.
4. Verify oldest eligible pallet displays PULL FIRST.
5. Open pallet.
6. Tap PULL BOXES.
7. Enter 6 boxes.
8. Verify pull review.
9. Confirm pull.

Expect:

- Quantity reduced by 6 boxes
- Piece quantity recalculated
- Success screen
- History contains BOX_PULL

---

# E2E Flow C — Count and Adjust

Start:

Home

Steps:

1. Tap COUNT.
2. Select pallet with 25 system boxes.
3. Enter physical count 23.
4. Verify mismatch screen.
5. Select reason.
6. Submit adjustment.
7. Sign in/use supervisor role.
8. Open pending adjustment.
9. Approve.

Expect:

- Inventory remains 25 before approval
- Inventory becomes 23 after approval
- History shows request and approval
- Both worker and supervisor identities appear

---

# E2E Flow D — Move

Start:

Home

Steps:

1. Tap MOVE.
2. Select pallet.
3. Verify current location.
4. Select/scan new location.
5. Confirm move.

Expect:

- New location shown
- Success screen
- History contains old and new location

---

# E2E Flow E — Hot Job

Steps:

1. Create pallet.
2. Open SHIPPING using the created pallet code.
3. Verify no rack assignment is required.
4. Review and confirm move to SHIPPING STAGING.
5. Ship pallet.

Expect:

- Complete traceability
- No warehouse rack required
- History shows staging and shipment

---

# E2E Flow F — Hold

Steps:

1. Supervisor places pallet on hold.
2. Worker searches inventory.
3. Verify hold is visually obvious.
4. Attempt normal pull/shipping.

Expect:

- Action blocked
- Worker-friendly hold message

Then:

5. Supervisor releases hold.
6. Retry eligible operation.

Expect success.

---

# Mobile Testing

The app is phone-first.

Every major flow should be manually checked on a narrow mobile viewport.

Minimum test widths should include approximately:

- 320px
- 375px
- 390px
- 430px

Also test at tablet widths.

Verify:

- No horizontal scrolling
- No clipped text
- No hidden primary buttons
- Bottom action bars remain above safe areas
- Numeric controls are easy to tap
- Important quantities are readable
- Scanning controls are visible
- Modals/dialogs fit the screen

---

# Touch Testing

Core controls should have touch targets of at least 44–48px.

Prefer larger targets for:

- Create
- Store
- Pull
- Move
- Count
- Confirm
- Scan
- Numeric increment/decrement

Do not accept tiny desktop-style controls on core floor screens.

---

# Accessibility Testing

At minimum verify:

- Inputs have labels.
- Buttons have accessible names.
- Focus is visible.
- Keyboard navigation works where reasonable.
- Statuses use text plus color.
- Contrast is sufficient.
- Error messages are associated with the relevant control.
- Dynamic success/error messages are announced where practical.

---

# QR Testing

Test:

- Valid pallet QR
- Valid location QR
- Wrong code type
- Invalid QR content
- Unknown pallet
- Unknown location
- Inactive location
- Repeated scan
- Camera permission denied
- Manual entry fallback

Scanning should never directly perform a destructive transaction.

---

# Poor Wi-Fi / Failure Testing

Simulate:

- Request timeout before save
- Save succeeds but response is lost
- Retry using same idempotency key
- Connection lost before confirmation
- Connection lost after input
- Connection restored

Expected behavior:

- Never falsely show success
- Preserve input where practical
- Avoid duplicate transactions
- Show clear retry guidance

---

# Security Testing

Security tests must include:

- Unauthenticated access rejected
- Worker cannot approve adjustment
- Worker cannot place/release hold
- Direct table mutation blocked where required
- RLS policies behave correctly
- Service-role key absent from frontend
- Protected RPC validates role
- Arbitrary client quantity rejected
- Held pallet shipping rejected
- Shipped pallet pull rejected
- Transaction history mutation rejected

---

# Database Foundation Validation

The rollback-only Mission 6 Find/FIFO fixture is `supabase/tests/find_inventory.sql`. After verifying the CLI link points to **Mimir Metals Inventory Development**, run:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/find_inventory.sql
```

It creates fictional stored FULL/PARTIAL, held, shipped, empty, created/packing, and shipping-staging pallets in a transaction that rolls back. It checks oldest-first ordering, exact-timestamp tie-breaking by pallet ID, available totals from current quantities, hold exclusion, snapshot-derived fill status, and authenticated read-only privileges. Frontend tests cover part-number/description search, no-match and no-inventory states, summary, one PULL FIRST badge, location, held notice, detail, refresh failure, and retry.

For the separate live browser check, `supabase/tests/find_inventory_live_fixture.sql` can add one idempotent **fictional** MM-A3815 held pallet in the verified development project. It writes created, stored, and hold history atomically, leaves that audit history in place, and must never be run against production. It exists only to confirm the browser's held notice and that held stock does not inflate available totals or receive PULL FIRST.

The linked Supabase development database can run the rollback-only foundation test directly against PostgreSQL:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/database_foundation.sql
```

The script uses fictional temporary records and rolls back all test changes. It verifies schema objects, packing and inventory arithmetic, hold consistency, historical foreign-key restrictions, idempotency, rack capacity, shared packing/staging capacity, RLS visibility, and browser-role write restrictions.

Never run database validation against an unknown project. Confirm the linked project is the intended development environment first.

The rollback-only Create Pallet RPC validation runs separately:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/create_pallet.sql
```

It uses fictional temporary identities and inventory records and rolls back every test change.

---

# Data Integrity Testing

Verify:

- No negative box counts
- No negative piece counts
- Unique pallet codes
- Unique location codes
- Unique idempotency keys where present
- Piece math matches pallet snapshot
- Adjustment state transitions are valid
- Shipped pallets are not treated as active stock
- Held pallets are excluded from FIFO
- Inactive parts cannot create new pallets

---

# Transaction Audit Testing

For each inventory-changing operation verify the transaction records:

- Pallet
- Actor
- Timestamp
- Type
- Previous quantity
- Change amount
- New quantity
- Previous location when applicable
- New location when applicable
- Reason when applicable
- PO/BOL when applicable

The transaction should contain enough information to explain the change later.

## Mission 12 History validation

History tests cover code normalization and reload-safe lookup, shipped-zero
current state versus original and dispatched quantities, actor fallback,
signed box/piece formatting, all V1 event labels plus unknown fallback,
Count/request observation versus approved correction, rejection, staging versus
dispatch, safe read failures, and bounded older-event pagination. The API tests
assert timestamp-and-ID ordering, keyset cursor filtering, explicit profile
projection, minimal transaction fields (no unrestricted notes or metadata),
and rejection of inactive profiles in the UI. These tests do not
claim the pre-existing broad authenticated table-read RLS is hardened.

Against the verified fictional development database, compare representative
Pull, Move, Count, adjustment, hot-job shipment, and direct-shipment records
with the rendered timeline using read-only queries. Never create a transaction
solely to populate History. If older-page loading fails, the UI must retain
already loaded events and warn that the timeline is incomplete. Browser checks
should include 320px, 390px, and 768px widths where permitted; unverified
screens must be reported, not assumed to pass.

---

# Test Data

Use stable fictional fixtures.

Example part:

`MM-A3815`

Description:

`3/8 x 1-5/8 Headed Anchor`

Packing:

- 700 pieces per box
- 48 boxes per full pallet

Example pallets:

- MM-P-0004712
- MM-P-0004775
- MM-P-0004821

Example locations:

- B-001-AC
- B-003-AC
- B-003-AD
- B-004-AB

Example worker:

`Brian G.`

Example supervisor:

`J. Miller`

All demo identities are fictional application fixtures unless explicitly configured otherwise.

---

# Test Environment Rules

Tests must not depend on a real customer database.

Preferred environments:

- Local test database
- Dedicated Supabase test project
- Isolated test schema where appropriate

Tests should be reproducible.

Do not require manually cleaning production-style data between runs.

---

# Test Isolation

Automated tests should create or seed the data they need.

Tests should not rely on execution order.

Bad:

```text
Test 2 only passes if Test 1 created a pallet.
```

Better:

Each test establishes its own known state.

---

# Regression Testing

When a bug is fixed, add a regression test when practical.

Example:

Bug:

Pull Boxes submitted twice on slow Wi-Fi.

Fix:

Add idempotency handling.

Regression test:

Submit same idempotency key twice and confirm one inventory change.

---

# Manual Floor Test

Before calling V1 ready for demonstration, perform a complete manual phone/tablet test.

Use printed fictional QR codes.

Recommended setup:

- One or more pallet QR labels
- Several rack-location QR labels
- Phone
- Tablet if available

Physically walk through:

- Create
- Scan
- Store
- Find
- Pull
- Move
- Count
- Approve
- History

Do not test only while sitting at a desktop.

The product is for workers moving through a physical space.

---

# Chris Demo Readiness Test

Before showing V1 to Chris, verify this exact demo sequence works without developer intervention:

1. Open app on phone.
2. Create or load fictional pallet.
3. Scan pallet QR.
4. Store pallet in a scanned location.
5. Find the part.
6. Show FIFO PULL FIRST.
7. Pull several boxes.
8. Show updated quantity.
9. Open pallet history.
10. Show creation, storage, and pull transactions.
11. Move pallet to another scanned location.
12. Show movement in history.

The demo should not require:

- Editing database rows
- Opening developer tools
- Manually correcting broken state
- Explaining why a button does not work

If the demo requires developer intervention, V1 is not demo-ready.

---

# CI Checks

Before merging or deploying, the project should run automated checks.

Recommended commands:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

When end-to-end tests are established:

```text
npm run test:e2e
```

The exact scripts may evolve, but equivalent checks should remain.

---

# Definition of Tested

A feature is considered tested when:

- Core business logic has appropriate unit coverage.
- Important UI states have component coverage.
- Backend/inventory behavior has integration coverage.
- Major worker paths work end to end.
- Error behavior is verified.
- Authorization behavior is verified where relevant.
- Mobile behavior is checked.
- No real proprietary data is used.

---

# V1 Release Gate

V1 should not be presented as complete until all of these are true:

- Create pallet works.
- Store pallet works.
- Find inventory works.
- FIFO works.
- Pull boxes works.
- Move pallet works.
- Count works.
- Supervisor adjustment works.
- Hold behavior works.
- Shipping behavior works.
- Transaction history works.
- Duplicate submission protection works.
- Stale update protection works.
- Worker/supervisor authorization works.
- Mobile layout works.
- QR/manual fallback works.
- Core automated checks pass.
- The manual Chris demo sequence passes.

---

# Final Testing Rule

A successful test suite should prove two things:

1. The inventory cannot quietly become wrong.
2. The worker can complete the job without fighting the software.

If either of those is unproven, V1 is not finished.
