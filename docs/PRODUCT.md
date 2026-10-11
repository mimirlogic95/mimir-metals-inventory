# Mimir Metals Finished Goods Inventory

## Product Summary

Mimir Metals Finished Goods Inventory is a mobile-first finished-goods tracking system for small and mid-sized manufacturing shops.

It is designed for workers on the floor, not office users.

The goal is simple:

> Know what finished product you have, how much you have, where it is, and what happened to it.

The app tracks finished goods from packing through storage and shipping using phones and tablets, QR codes, pallet IDs, FIFO logic, and transaction history.

---

## Primary User

The primary user is a manufacturing-floor worker.

Typical users include:

- Packers
- Forklift drivers
- Shipping workers
- Machine operators
- Supervisors

The interface should be simple enough that a worker can understand what to do within a few seconds.

---

## Core Product Principle

The worker should not need to understand inventory software.

The software should understand the worker's job.

The app should therefore use:

- Large touch targets
- Large readable text
- Minimal typing
- Camera-based QR scanning
- One primary task per screen
- Clear confirmations
- Simple manufacturing language
- Strong mobile and tablet usability

---

## Primary Inventory Object

The pallet is the main inventory object.

Every pallet receives a unique permanent pallet ID.

Example:

`MM-P-0004821`

A pallet may contain:

- Part number
- Description
- Product family
- Heat number
- Lot number
- Machine
- Operator
- Packing date
- Number of boxes
- Pieces per box
- Total pieces
- Expected weight
- Current location
- Full or partial status
- PO reference
- BOL reference
- Transaction history

---

## Core Worker Actions

V1 focuses on these primary actions:

- CREATE PALLET
- STORE
- FIND
- PULL BOXES
- MOVE
- COUNT

Secondary actions include:

- SHIPPING
- HISTORY

---

## Pallet Creation

Each part has a stored packing specification.

Example:

Part:
`MM-A3815`

Description:
`3/8 x 1-5/8 Headed Anchor`

Packing standard:

- 700 pieces per box
- 48 boxes per full pallet
- 33,600 pieces per full pallet
- 56 lb estimated box weight

If a worker enters 31 boxes, the app automatically calculates:

- 31 boxes
- 21,700 pieces
- PARTIAL PALLET

The worker should not need to calculate piece totals manually.

---

## Full and Partial Pallets

Both full and partial pallets are valid inventory.

A pallet does not need to be full before it can be stored.

Example:

`MM-P-0004821`

- 31 boxes
- 21,700 pieces
- Status: PARTIAL

Partial pallets may later have boxes removed, be moved, counted, or shipped.

---

## Pallet Labels

Each pallet receives a Mimir Metals pallet label.

The label should be easy to read from several feet away.

Example:

MIMIR METALS

`MM-P-0004821`

`MM-A3815`

3/8 x 1-5/8  
HEADED ANCHOR

31 BOXES  
21,700 PCS

PARTIAL PALLET

Heat: MM10984723  
Lot: MM261003-07

Large QR code

Packed: 10/03/2026

The pallet QR identifies the unique pallet record.

---

## Storage Locations

Warehouse locations use unique QR codes.

Example:

`B-003-AC`

A location is not permanently assigned to a specific part.

Any pallet may be stored in any valid open location.

Typical workflow:

1. Scan pallet QR
2. Scan rack-location QR
3. Confirm storage
4. Record transaction

---

## Smart Storage Grouping

The app should recommend open locations near similar product families.

Example:

For a 3/8-inch anchor pallet:

- B-003-AC — same family nearby
- B-003-AD — same family nearby
- B-004-AA — nearby open location

The recommendation should help organize the warehouse without forcing the worker to use a specific location.

The worker may always scan a different valid location.

---

## FIFO

Inventory should use FIFO:

First In, First Out.

When shipping searches for a part, the oldest eligible inventory should be clearly marked:

**PULL FIRST**

Pallets on hold should not be recommended for normal FIFO pulls.

---

## Pulling Boxes

Shipping may remove individual boxes from a stored pallet.

Example:

Current pallet:

- 31 boxes
- 21,700 pieces

Shipping pull:

- 6 boxes
- 4,200 pieces

Remaining inventory:

- 25 boxes
- 17,500 pieces

The pull should create a transaction that may include:

- Worker
- Timestamp
- PO
- BOL
- Reason
- Quantity removed
- Quantity remaining

---

## Transaction-Based Inventory

Inventory values must never be silently overwritten.

Every inventory change creates a transaction.

Example:

- Pallet created: +31 boxes
- Shipping pull: -6 boxes
- Adjustment: -2 boxes
- Current inventory: 23 boxes

The same rule applies to location changes.

Example:

- Created in packing
- Stored at B-003-AC
- Moved to B-004-AB

This provides a traceable history of what happened to each pallet.

---

## Physical Counts

Workers may perform physical inventory counts.

V1 counts boxes on a positive-balance stored rack pallet, including a rack pallet
on hold whose previous state was stored. Created/packing, shipping-staging,
shipped, empty, and unlocated pallets are not part of this warehouse Count flow.
The server derives counted pieces from the pallet's packing snapshot. A physical
zero is a valid observation, not an instruction to deplete or ship inventory.

A matching count records who confirmed the physical quantity without creating
an adjustment request or changing the pallet. A discrepancy creates one pending
request and a linked audit event; pallet quantities and lifecycle remain unchanged.
While a request is pending, another discrepancy request for that pallet is blocked.
An active supervisor reviews the request separately; Count itself never changes inventory.

If the physical count does not match the system quantity, the worker may submit an adjustment request.

The worker cannot directly overwrite inventory.

Adjustment request data should include:

- System quantity
- Physical quantity
- Difference
- Worker
- Timestamp
- Reason

A supervisor must approve or reject the adjustment.

---

## Supervisor Approval

Supervisors may approve or reject inventory adjustments.

Approval requires a different active supervisor from the count requester, an
unchanged count-time pallet version/state, and a positive resulting box balance.
An approved correction updates current boxes and snapshot-derived pieces and
creates one immutable adjustment transaction. A held rack pallet stays held.
Rejection requires a brief reason, adds a zero-change decision event, and does
not change the pallet. A reported physical zero remains valid Count evidence,
but V1 cannot approve a zero-box result; the supervisor may reject it for
recount or investigation. Shipping/final depletion is a separate workflow.

The previous quantity is never erased from history.

The system should record:

- Worker who performed the count
- Supervisor who approved the adjustment
- Timestamp
- Reason
- Previous quantity
- New quantity

---

## Hot Jobs

Some pallets may go directly from packing to shipping.

Normal flow:

Production → Packing → Warehouse → Shipping

Hot-job flow:

Production → Packing → Shipping Staging → Shipped

The pallet still receives a pallet ID and complete transaction history.

It simply skips warehouse storage.

In Mission 11, a created hot-job pallet stages from packing (or no location)
before dispatch. Staging preserves its current quantity and means **NOT SHIPPED
YET**. A stored rack pallet may stage or dispatch directly. Dispatch ships the
entire *remaining* pallet quantity, including a partial or final-box pallet;
it is not a replacement for a partial Pull Boxes operation. After dispatch,
current facility boxes/pieces are zero and current location is clear, while
the immutable shipment event preserves the actual shipped quantity, source,
actor, timestamp, and optional PO/BOL references. Held pallets cannot ship.

---

## Pallet History

Every pallet should have a complete event history.

Example:

- 10:14 AM — PALLET CREATED — 31 boxes / 21,700 pieces
- 10:23 AM — STORED — B-003-AC
- 1:42 PM — SHIPPING PULL — 6 boxes removed
- Oct 5 — MOVED — B-003-AC to B-004-AB
- Oct 8 — PHYSICAL COUNT — 23 boxes
- Oct 8 — ADJUSTMENT APPROVED — 2 boxes removed
- Oct 12 — SHIPPED

The system stores both current state and historical events.

V1 History looks up one pallet by its permanent code, including shipped pallets,
and shows its authoritative current state separately from originally packed
quantity and the quantity recorded in a shipment event. It presents every
authorized saved event newest-first, with older events available on demand.
Physical Count and adjustment requests are observations until an approval
actually changes inventory; a rejection never changes the balance. Shipping
staging changes location but not quantity, while dispatch reduces facility
inventory to zero. History is read-only and does not broaden Find's definition
of available rack stock.

---

## V1 Scope

V1 includes:

- Mobile-first phone and tablet interface
- Unique pallet IDs
- Pallet creation
- Full and partial pallets
- Pallet QR labels
- Rack-location QR scanning
- Storage
- Suggested storage locations
- Inventory search
- FIFO recommendations
- Individual box pulls
- Pallet moves
- Physical counts
- Supervisor-approved adjustments
- PO and BOL references
- Transaction history
- Worker and supervisor roles

---

## Not V1

Do not add these features to V1:

- AI chatbot
- Full ERP replacement
- Accounting
- Purchasing
- Customer portal
- Machine monitoring
- Tooling inventory
- Individual box QR tracking
- Zebra scanner integration
- IoT
- Voice assistant
- Predictive analytics
- Advanced warehouse mapping
- Complex management dashboards

---

## Technology Direction

The expected V1 technology stack is:

- React
- TypeScript
- Tailwind CSS
- Progressive Web App
- Supabase
- PostgreSQL
- Supabase Auth
- Phone/tablet camera QR scanning
- QR generation
- Browser-based pallet label printing
- GitHub
- Netlify or Vercel

---

## Product Goal

Mimir Metals Finished Goods Inventory should answer five questions quickly:

1. What do we have?
2. How much do we have?
3. Where is it?
4. Which inventory should we use first?
5. What happened to it?

The product should make finished-goods inventory faster, easier, more accurate, and traceable without forcing workers to learn complicated warehouse software.

---

## Long-Term Direction

Mimir Metals Finished Goods Inventory may eventually become part of a larger manufacturing platform.

Possible future flow:

Setup → Production → QC → Finished Goods → Inventory → Shipping

Each module should remain independently useful.

The priority is to solve real manufacturing-floor problems first and connect systems later.
