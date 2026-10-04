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
2. Worker scans the pallet QR code.
3. The app displays pallet details for confirmation.
4. The app recommends open storage locations.
5. Recommendations prioritize:
   - Open locations
   - Same product family nearby
   - Nearby open space
6. Worker either:
   - Accepts a suggested location, or
   - Scans a different valid location
7. Worker scans the rack-location QR code.
8. The app confirms:
   - Pallet ID
   - Destination location
9. Worker taps **CONFIRM STORAGE**.
10. The app records a **STORED** transaction.
11. The app updates the pallet's current location.
12. A success screen confirms the action.

## Rack Capacity Rule

Before committing storage, the future protected Store operation must lock the pallet, lock the destination location, and recheck its current occupancy. A normal rack accepts only one active pallet. Packing and shipping staging locations may contain multiple pallets.

If another active pallet already occupies the rack, storage is rejected and the worker sees:

**LOCATION OCCUPIED**

`B-003-AC already contains a pallet.`

`Scan another location.`

## Example

Pallet:

`MM-P-0004821`

Suggested location:

`B-003-AC`

Worker scans:

`B-003-AC`

Result:

`MM-P-0004821 STORED AT B-003-AC`

---

# Workflow 4 — Find Inventory

## Goal

Quickly locate finished goods and identify which inventory should be used first.

## Search Options

Worker may search by:

- Part number
- Description
- Pallet ID
- Location
- Lot number
- Heat number

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

Eligible inventory is sorted oldest first.

The oldest eligible pallet is clearly marked:

**PULL FIRST**

Pallets on hold are excluded from FIFO recommendations.

---

# Workflow 5 — Pull Boxes

## Goal

Remove one or more boxes from an existing pallet while keeping the remaining pallet in inventory.

## Steps

1. Worker taps **PULL BOXES**.
2. Worker scans or selects a pallet.
3. The app shows current:
   - Box quantity
   - Piece quantity
4. Worker enters the number of boxes being removed.
5. The app calculates:
   - Pieces being removed
   - Remaining boxes
   - Remaining pieces
6. Worker may enter:
   - PO
   - BOL
   - Reason
7. Worker taps **REVIEW PULL**.
8. The app displays a confirmation summary.
9. Worker taps **CONFIRM PULL**.
10. The app records a **SHIPPING PULL** or other appropriate transaction.
11. The app updates the pallet's current quantity.
12. A success screen confirms the new balance.

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

The app must not allow a worker to pull more boxes than are available.

If the requested amount exceeds available inventory, the app must block confirmation and show:

**QUANTITY TOO HIGH**

---

# Workflow 6 — Move Pallet

## Goal

Move a pallet from one storage location to another while preserving movement history.

## Steps

1. Worker taps **MOVE**.
2. Worker scans the pallet QR.
3. The app displays the current location.
4. Worker scans the destination rack QR.
5. The app validates the destination.
6. The app shows:
   - Current location
   - New location
7. Worker taps **CONFIRM MOVE**.
8. The app records a **MOVE** transaction.
9. The app updates the pallet's current location.
10. A success screen confirms the move.

Before committing a move, the future protected Move operation must lock the pallet, lock the source and destination locations in stable ID order, and recheck destination occupancy. It must reject an occupied rack while allowing multiple pallets in packing or shipping staging. The same **LOCATION OCCUPIED** message used by Store applies.

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
2. Worker scans the pallet QR.
3. The app displays the system box quantity.
4. Worker enters the physical box count.
5. If the count matches:
   - Record a successful count event.
6. If the count does not match:
   - Show the difference.
   - Require a reason.
   - Create an adjustment request.
7. The worker cannot directly change inventory.

## Example

System:

`25 boxes`

Physical:

`23 boxes`

Difference:

`-2 boxes`

The app creates an adjustment request.

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
