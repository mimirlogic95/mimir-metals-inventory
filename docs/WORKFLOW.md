# Mimir Metals Finished Goods Inventory — Workflow

## Purpose

This document defines how workers and supervisors use Mimir Metals Finished Goods Inventory during normal finished-goods operations.

The application is designed for phones and tablets used on the manufacturing floor.

The workflow should remain simple, fast, and understandable with minimal training.

The core rule is:

> One task per screen. Scan when possible. Type only when necessary. Confirm every inventory-changing action.

---

## Primary Users

### Worker

Typical worker roles include:

- Packer
- Forklift driver
- Shipping worker
- Machine operator

Workers can:

- Create pallets
- Store pallets
- Find inventory
- Pull boxes
- Move pallets
- Count inventory
- Submit adjustment requests
- View pallet history

Workers cannot directly overwrite inventory quantities.

---

### Supervisor

Supervisors can do everything a worker can do.

Supervisors can also:

- Approve inventory adjustments
- Reject inventory adjustments
- Place pallets on hold
- Release pallets from hold

---

# Core Floor Workflow

The standard finished-goods flow is:

Production  
→ Packing  
→ Pallet Creation  
→ Pallet Label  
→ Storage  
→ Find / Pull / Move / Count  
→ Shipping

A hot job may skip warehouse storage:

Production  
→ Packing  
→ Pallet Creation  
→ Shipping Staging  
→ Shipping

Every inventory-changing step creates a transaction.

---

# Home Screen

The home screen should immediately present the main worker actions.

Primary actions:

- CREATE PALLET
- STORE
- FIND
- PULL BOXES
- MOVE
- COUNT

Secondary actions:

- SHIPPING
- HISTORY

The worker should not need to navigate through menus to reach the core actions.

---

# Workflow 1 — Create Pallet

## Goal

Create a new finished-goods pallet record after parts are packed.

## Steps

1. Worker taps **CREATE PALLET**.
2. Worker selects or searches for the part.
3. The app displays the stored packing specification.
4. Worker enters the number of boxes on the pallet.
5. The app displays a piece-quantity and FULL/PARTIAL preview.
6. Worker enters:
   - Heat number
   - Lot number
   - Machine code, when useful
7. Worker reviews the complete pallet without saving it yet.
8. Worker taps **CREATE PALLET**.
9. The protected database operation derives the worker from the authenticated session, reloads the active part and packing specification, calculates pieces, snapshots packing values, and generates a permanent pallet ID.
10. The database creates the pallet and **PALLET CREATED** transaction atomically.
11. A success screen shows the authoritative saved quantities.
12. Worker opens and prints the pallet label.

Operator identity and packing time come from the authenticated profile and database clock. Destination selection, storage, and hot-job staging are separate later workflows and are not performed by Create Pallet.

If the connection fails, the screen shows **NOT SAVED YET** and retries with the same idempotency key. A retry that already succeeded returns the same pallet rather than creating another one.

## Example

Part:

`MM-A3815`

Packing standard:

- 700 pieces per box
- 48 boxes per full pallet
- 33,600 pieces per full pallet

Worker enters:

`31 boxes`

The app calculates:

`21,700 pieces`

Status:

`PARTIAL PALLET`

Generated pallet ID:

`MM-P-0004821`

---

# Workflow 2 — Print Pallet Label

## Goal

Create a large, scannable label for the physical pallet.

## Required Label Information

The label should display:

- Mimir Metals
- Pallet ID
- Part number
- Description
- Box count
- Piece count
- Full or partial status
- Heat number
- Lot number
- Packing date
- QR code

## Example

`MM-P-0004821`

`MM-A3815`

31 BOXES

21,700 PCS

PARTIAL PALLET

The QR code identifies the pallet ID.

The printable V1 browser label uses a 4×6-inch print layout. Its QR payload contains only the stable pallet code, never quantities, location, credentials, or mutable JSON.

---

# Workflow 3 — Store Pallet

## Goal

Assign a pallet to a physical warehouse location.

## Steps

1. Worker taps **STORE**.
2. Worker enters the pallet code printed on the QR label. Camera scanning is deferred.
3. The app displays pallet details for confirmation.
4. Worker enters an active rack-location code. Camera scanning and location recommendations are deferred.
5. The app displays whether the rack appears open or occupied. This read is advisory; the server checks again when saving.
6. The app reviews the pallet, part, quantities, and destination.
7. Worker taps **STORE PALLET**.
8. The protected `store_pallet` operation updates the pallet to `stored` and records a **STORED** transaction atomically.
9. A success screen shows the server-returned pallet and destination.

Store accepts a `created` pallet with no current location or a packing-area location. Already stored pallets require a future Move workflow; shipped and on-hold pallets are not eligible. Store destinations must be active racks. Packing and shipping staging remain shared-capacity location types for other workflows, but they are not Store destinations.

## Rack Capacity Rule

Before committing storage, the protected Store operation locks the pallet, locks the source and destination location rows in stable ID order, and rechecks rack occupancy. A normal rack accepts only one non-shipped pallet, including an on-hold pallet. Packing and shipping staging locations may contain multiple pallets, but Store does not target them.

If another active pallet already occupies the rack, storage is rejected and the worker sees:

**LOCATION OCCUPIED**

`B-003-AC already contains a pallet.`

`Scan another location.`

## Example

Pallet:

`MM-P-0004821`

Entered location:

`B-003-AC`

Worker confirms:

`B-003-AC`

Result:

`MM-P-0004821 STORED AT B-003-AC`

---

# Workflow 4 — Find Inventory

## Goal

Quickly locate finished goods and identify which inventory should be used first.

## Search Options

The initial Find screen searches active parts by:

- Part number
- Description

Pallet ID, location, lot, and heat search are later extensions, not part of this screen yet.

## Search Result

The app should show:

- Total available pieces
- Total boxes
- Number of pallets
- Individual pallet locations
- Full or partial status
- Lot
- Packing date
- Hold status

## FIFO Behavior

The available list is rack inventory only: stored pallets in a rack with positive current boxes and pieces. The summary sums those pallets' current boxes and current pieces, not the current master packing specification. Created/packing and shipping-staging pallets are distinct workflows and are not counted as available warehouse inventory.

Eligible pallets are sorted oldest first by database `packed_at`, then `created_at`, then pallet ID for stable ties. This is a recommendation, not an allocation.

The oldest eligible pallet is clearly marked:

**PULL FIRST**

Pallets on hold, shipped pallets, and empty pallets are excluded from the available list and FIFO recommendation. If positive-quantity held inventory exists for the part, Find shows a separate notice without adding it to available totals.

Workers can refresh the live read. While reloading or after a failed refresh, the screen does not present cached quantities as current. A pallet opens a read-only detail with a **PULL BOXES** action that opens a reloadable `/pull?code=...` route. Returning to Find after a successful pull refetches current totals and FIFO order.

---

# Workflow 5 — Pull Boxes

## Goal

Remove one or more boxes from an existing pallet while keeping the remaining pallet in inventory.

## Steps

1. Worker opens **PULL BOXES** from Home and manually enters a pallet code, or opens a pallet from Find and taps **PULL BOXES**. Camera scanning is deferred.
2. The app loads current pallet, part, rack, box/piece balance, FULL/PARTIAL state, and current FIFO guidance from the database. A held, shipped, empty, or non-rack pallet cannot proceed.
3. Worker enters a positive whole-box quantity. The app previews boxes/pieces **REMOVING** and **REMAINING** using the pallet's packing snapshot.
4. Worker may enter optional PO and BOL references. No paperwork or reason is required for a normal partial pull.
5. Worker taps **REVIEW PULL**. The app refreshes current state and FIFO guidance; if the balance, lifecycle, or location changed, it asks for another review.
6. The review shows pallet, part, rack, current quantity, removal, remainder, FIFO guidance, and references. Nothing has changed yet.
7. Worker taps **CONFIRM PULL**. The protected `pull_boxes` RPC locks the pallet and compares both reviewed box and piece balances to its actual state, then calculates pieces, updates the pallet, and inserts one `box_pull` transaction atomically.
8. The success screen shows the authoritative server-returned removal, remainder, and rack. The worker may finish or view the refreshed pallet.

## Example

Before:

- 31 boxes
- 21,700 pieces

Pull:

- 6 boxes
- 4,200 pieces

After:

- 25 boxes
- 17,500 pieces

## Rules

Mission 7 supports **partial pulls only**. Pulling the final boxes would leave a zero-balance pallet in `stored` without a defined terminal transition; the Shipping workflow owns that final movement. Pulling all remaining boxes shows **WHOLE PALLET — USE SHIPPING**. This is a scope boundary, not a new lifecycle state.

FIFO is a recommendation, not an allocation rule. The current oldest eligible stored rack pallet shows **PULL FIRST**. A different pallet shows **NOT FIFO PALLET**, names the oldest eligible pallet and location, and may still be pulled after review.

The server derives the actor from Supabase Auth, requires an active worker or supervisor, and rejects holds, shipped/non-rack pallets, invalid quantities, stale reviewed balances, and pulls above available stock. A stale request shows **INVENTORY CHANGED** and requires a refresh and new review. A too-large request shows **TOO MANY BOXES**.

Each confirmed request has an idempotency key. If a response is lost, the screen shows **NOT SAVED YET** and retries the *same frozen request and key*. A matching retry returns the original event without another quantity change. A changed request or actor cannot reuse the key. No offline write is queued.

---

# Workflow 6 — Move Pallet

## Goal

Move a stored pallet between two racks while preserving quantity, FIFO age, and movement history. Move is not Store or Shipping.

## Steps

1. Worker opens **MOVE** from Home and enters a pallet code, or taps **MOVE PALLET** in Find detail. Camera scanning is deferred; lowercase codes normalize to uppercase.
2. The app loads the pallet's authoritative current rack, part, quantity, fill state, and lifecycle. Only `stored` pallets in a rack may proceed. Created pallets use Store; shipped, unlocated, and on-hold pallets cannot Move. A hold must be released through a later protected workflow before relocation.
3. Worker enters a different active rack. The app shows **OPEN** or **LOCATION OCCUPIED**. Packing and shipping staging are not Move destinations even though those location types can contain multiple pallets.
4. **REVIEW MOVE** refreshes the pallet and destination and shows pallet, part, **FROM**, **TO**, boxes, and pieces. Nothing is saved yet.
5. **CONFIRM MOVE** calls the protected `move_pallet` RPC with the reviewed source-location ID and a retry key. It locks the pallet and source/destination racks, rejects a changed source or occupied destination, updates only current location, and appends one `moved` event atomically.
6. The success screen displays the server-returned FROM/TO and unchanged quantity. Find refreshes from the database; moving does not change `packed_at` or FIFO age.

A stale review shows **LOCATION CHANGED** and requires refresh. A failed pallet or rack lookup shows **COULDN'T LOAD** because no write was attempted. Only an uncertain **CONFIRM MOVE** result shows **NOT SAVED YET** and retries the same frozen request/key; an exact retry returns the original event without moving again. No offline write is queued. The database occupancy trigger remains the final rack-capacity guard.

## Example

From:

`B-003-AC`

To:

`B-004-AB`

The original location remains in transaction history.

---

# Workflow 7 — Physical Count

## Goal

Compare physical inventory with system inventory.

## Steps

1. Worker taps **COUNT**.
2. Worker enters the pallet code manually, or arrives from Find pallet detail.
   Camera scanning remains deferred.
3. The app displays the current SYSTEM box and piece quantities and location.
4. Worker enters the physical box count.
5. If the count matches:
   - Record an immutable `count_matched` event with zero quantity change.
6. If the count does not match:
   - Show the difference.
   - Require a reason.
   - Create a pending adjustment request and linked `adjustment_requested` event.
7. The worker cannot directly change inventory.

## Example

System:

`25 boxes`

Physical:

`23 boxes`

Difference:

`-2 boxes`

The app creates an adjustment request.

Mission 9 Count accepts positive-balance stored rack pallets and on-hold rack
pallets whose saved previous lifecycle was stored. It rejects created, staging,
shipped, empty, and unlocated pallets. The worker enters boxes only; the server
uses `pieces_per_box_snapshot` for counted pieces and proposed difference. Zero
physical boxes is allowed as a discrepancy. No Count outcome changes pallet
quantity, lifecycle, or location. A supervisor decision is a later workflow.

Before saving, Count locks the pallet and compares system boxes, pieces, and
location with what the worker reviewed. A stale review fails with `INVENTORY
CHANGED`; the worker refreshes and recounts. One unresolved discrepancy request
per pallet is allowed, even if the pallet later changes, to avoid competing
supervisor decisions. The worker selects a short reason for a discrepancy and
may add a brief note. Exact retries reuse the same request key. Lookup failures
say `COULDN'T LOAD`; an uncertain confirmation says `NOT SAVED YET` and retries
the same frozen request. Find totals do not change until a later approved
adjustment actually changes inventory.

---

# Workflow 8 — Supervisor Adjustment Approval

## Goal

Require authorization before an inventory discrepancy changes the system quantity.

## Steps

1. Supervisor opens pending adjustment requests.
2. Supervisor reviews:
   - Pallet ID
   - Part
   - System quantity
   - Physical quantity
   - Difference
   - Worker
   - Reason
   - Timestamp
3. Supervisor chooses:
   - APPROVE
   - REJECT
4. If approved:
   - Create an **ADJUSTMENT APPROVED** transaction.
   - Update pallet quantity.
5. If rejected:
   - Preserve the request and rejection in history.
   - Do not change inventory quantity.

## Rule

No approved adjustment should erase the original quantity or prior event history.

---

# Workflow 9 — Hot Job

## Goal

Allow product to move directly from packing to shipping without warehouse storage.

## Steps

1. Worker creates pallet normally.
2. Worker selects:
   - HOT JOB / SHIPPING
3. The pallet receives its normal unique pallet ID.
4. The pallet is assigned:
   - SHIPPING STAGING
5. The app records the staging transaction.
6. Shipping completes the shipment.
7. The app records the **SHIPPED** transaction.

## Rule

Hot jobs still require full transaction history.

Skipping storage must not mean skipping traceability.

---

# Workflow 10 — Shipping

## Goal

Help shipping locate and pull the correct inventory quickly.

## Steps

1. Worker opens **SHIPPING**.
2. Worker searches by:
   - PO
   - Part
   - Pallet
3. The app shows eligible inventory.
4. FIFO recommendation is displayed.
5. Worker selects or scans the pallet.
6. Worker removes the required boxes.
7. PO and BOL references may be recorded.
8. The app creates the appropriate pull transaction.
9. If the pallet is fully consumed:
   - The pallet can transition to SHIPPED.
10. If boxes remain:
   - The pallet remains active inventory.

---

# Workflow 11 — View Pallet History

## Goal

Show the complete traceable story of a pallet.

## Example Timeline

10:14 AM  
PALLET CREATED  
31 boxes / 21,700 pieces

10:23 AM  
STORED  
B-003-AC

1:42 PM  
SHIPPING PULL  
-6 boxes

Oct 5  
MOVED  
B-003-AC → B-004-AB

Oct 8  
PHYSICAL COUNT  
23 boxes found

Oct 8  
ADJUSTMENT APPROVED  
-2 boxes

Oct 12  
SHIPPED

## Rule

History is read-only.

Historical transactions should not be edited or deleted through the normal worker interface.

---

# Pallet Statuses

V1 pallet statuses may include:

- CREATED
- FULL
- PARTIAL
- STORED
- SHIPPING STAGING
- ON HOLD
- SHIPPED

Status names should remain understandable to floor workers.

Do not introduce unnecessary technical status names.

---

# Location Rules

Locations represent physical warehouse positions.

Example:

`B-003-AC`

Each location can be:

- OPEN
- OCCUPIED
- UNAVAILABLE

A location is not permanently tied to a part.

The app may recommend a location based on nearby product family grouping.

The worker may choose a different valid location.

---

# Transaction Rules

Every inventory-changing action must create a transaction.

Examples:

- PALLET CREATED
- STORED
- MOVE
- SHIPPING PULL
- COUNT
- ADJUSTMENT REQUESTED
- ADJUSTMENT APPROVED
- ADJUSTMENT REJECTED
- HOLD
- HOLD RELEASED
- SHIPPING STAGING
- SHIPPED

Each transaction should record enough information to answer:

- What happened?
- Which pallet was affected?
- Who did it?
- When did it happen?
- What changed?
- Why did it change?
- Where was it before?
- Where is it now?

---

# Confirmation Rules

Inventory-changing actions must require clear confirmation before completion.

Examples:

- CONFIRM STORAGE
- CONFIRM PULL
- CONFIRM MOVE
- SUBMIT ADJUSTMENT
- APPROVE ADJUSTMENT

After completion, the app should always show a clear success state.

Workers should never wonder whether an action was saved.

---

# Connection Failure Behavior

Factory Wi-Fi may be unreliable.

V1 does not require full offline sync.

However, if connection is lost during a transaction:

- Do not pretend the transaction succeeded.
- Show **NOT SAVED YET**.
- Allow the user to retry.
- Prevent accidental duplicate submission.

The app should never create uncertainty around whether inventory changed.

---

# Error Handling

Common errors should use plain language.

Examples:

## Pallet Not Found

**PALLET NOT FOUND**

Check the pallet ID and try again.

---

## Location Occupied

**LOCATION OCCUPIED**

Choose or scan another location.

---

## Quantity Too High

**QUANTITY TOO HIGH**

Requested:
50 boxes

Available:
48 boxes

Change the quantity before continuing.

---

## Pallet On Hold

**PALLET ON HOLD**

This pallet cannot be shipped until a supervisor releases it.

---

## Duplicate Submission

**THIS MAY ALREADY BE SAVED**

Check pallet history before retrying.

---

# Usability Rules

Every workflow should follow these rules:

- One main task per screen
- Large touch targets
- Large readable quantities
- Minimal text entry
- QR scanning when possible
- Clear manual fallback
- No hidden critical actions
- No tiny desktop-style tables
- No horizontal scrolling on phones
- Important buttons remain visible
- Bottom actions stay above device safe areas
- Critical state changes require confirmation
- Completed actions show a success screen
- Full and partial pallets are visually distinct
- FIFO recommendation is obvious
- Hold status is obvious

---

# V1 Acceptance Workflows

V1 is not complete until these flows work end to end.

## Flow A — Create and Store

Home  
→ Create Pallet  
→ Select Part  
→ Enter 31 boxes  
→ Calculate 21,700 pieces  
→ Create MM-P-0004821  
→ Print Label  
→ Store Pallet  
→ Suggest B-003-AC  
→ Scan Location  
→ Confirm Storage  
→ Success

---

## Flow B — Find and Pull

Home  
→ Find  
→ Search MM-A3815  
→ View Available Inventory  
→ See PULL FIRST  
→ Open Pallet  
→ Pull 6 Boxes  
→ Review Pull  
→ Confirm Pull  
→ Updated Inventory  
→ Transaction History Updated

---

## Flow C — Count and Adjust

Home  
→ Count  
→ Scan Pallet  
→ System Shows 25 Boxes  
→ Worker Counts 23  
→ Inventory Mismatch  
→ Submit Adjustment  
→ Supervisor Reviews  
→ Supervisor Approves  
→ Inventory Becomes 23 Boxes  
→ History Updated

---

## Flow D — Move

Home  
→ Move  
→ Scan Pallet  
→ View Current Location  
→ Scan New Location  
→ Confirm Move  
→ Success  
→ History Updated

---

# Workflow Design Principle

The application should always answer four questions for the worker:

1. What am I doing?
2. What did I scan or select?
3. What will happen if I confirm?
4. Did the transaction succeed?

If any workflow makes those answers unclear, the workflow should be simplified.
