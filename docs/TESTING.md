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
- Pull 31 from 31 = allowed
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

Expect storage to remain allowed, subject to the other workflow rules.

Run two concurrent Store requests for different pallets targeting the same empty rack.

Expect exactly one request to succeed. The other request must wait for the destination-location lock and then fail with `LOCATION OCCUPIED`.

---

# Integration Test — Pull Boxes

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

Moving multiple pallets into the same `packing` or `shipping_staging` location remains allowed.

Also verify that:

- An on-hold pallet occupies rack capacity.
- A shipped pallet left with a historical current-location reference does not occupy rack capacity.
- A location containing multiple active pallets cannot be changed from a shared type to `rack`.

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
2. Choose HOT JOB / SHIPPING.
3. Verify no rack assignment is required.
4. Move to SHIPPING STAGING.
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

The linked Supabase development database can run the rollback-only foundation test directly against PostgreSQL:

```text
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/database_foundation.sql
```

The script uses fictional temporary records and rolls back all test changes. It verifies schema objects, packing and inventory arithmetic, hold consistency, historical foreign-key restrictions, idempotency, rack capacity, shared packing/staging capacity, RLS visibility, and browser-role write restrictions.

Never run database validation against an unknown project. Confirm the linked project is the intended development environment first.

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
