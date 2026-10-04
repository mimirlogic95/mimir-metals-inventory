# Mimir Metals Finished Goods Inventory — Data Model

## Purpose

This document defines the V1 data model for Mimir Metals Finished Goods Inventory.

The model is designed to support:

- Pallet-level inventory
- Full and partial pallets
- Packing rules
- QR-based pallet and location identification
- FIFO
- Box pulls
- Pallet moves
- Physical counts
- Supervisor-approved adjustments
- Hot jobs
- PO and BOL references
- Complete transaction traceability

The data model should stay simple enough for V1 while preserving a clean path for future manufacturing modules.

---

# Core Modeling Principles

## 1. The Pallet Is the Main Inventory Object

Inventory is tracked at the pallet level.

Each pallet has:

- A permanent internal database ID
- A permanent human-readable pallet code
- Current quantity
- Current location
- Current lifecycle status
- Heat and lot traceability
- Complete transaction history

Example pallet code:

`MM-P-0004821`

---

## 2. Every Inventory Change Is a Transaction

Inventory quantities and locations must never be silently overwritten.

Every inventory-changing action creates an immutable transaction record.

Examples:

- PALLET_CREATED
- STORED
- BOX_PULL
- MOVED
- COUNT_MATCHED
- ADJUSTMENT_REQUESTED
- ADJUSTMENT_APPROVED
- ADJUSTMENT_REJECTED
- HOLD_PLACED
- HOLD_RELEASED
- SHIPPING_STAGING
- SHIPPED

The pallet table stores the current state for fast reads.

The transaction table stores the complete historical record.

---

## 3. Current State and History Must Stay Consistent

When inventory changes, the system must:

1. Validate the action.
2. Insert the transaction.
3. Update the pallet's current state.
4. Commit both changes together.

If any part fails, neither change should be saved.

This prevents situations where the transaction history says one thing while the current pallet record says another.

---

## 4. Historical Packing Math Must Not Change Later

Packing specifications can change over time.

For that reason, every pallet should store a snapshot of the packing values that were used when the pallet was created.

Example:

A part currently uses:

- 700 pieces per box
- 48 boxes per full pallet

If the packing standard later changes to 650 pieces per box, an older pallet must still preserve its original 700-piece calculation.

The pallet therefore stores the packing values used at creation time.

---

## 5. Human-Readable Codes Are Separate From Database IDs

Database relationships should use UUID primary keys.

Workers should use human-readable codes.

Examples:

Internal database ID:

`7bc143f8-...`

Worker-facing pallet code:

`MM-P-0004821`

Worker-facing location code:

`B-003-AC`

This keeps database relationships stable while keeping the floor workflow understandable.

---

# V1 Tables

V1 should begin with these primary tables:

1. `profiles`
2. `parts`
3. `packing_specs`
4. `locations`
5. `pallets`
6. `inventory_transactions`
7. `adjustment_requests`

Supabase Auth manages authentication separately through `auth.users`.

---

# Table: profiles

## Purpose

Stores application-specific information about authenticated users.

Supabase Auth owns login credentials.

`profiles` stores the manufacturing role and display information used by the app.

## Fields

### id

Type:

`uuid`

Primary key.

Must match the associated Supabase `auth.users.id`.

---

### display_name

Type:

`text`

Example:

`Brian G.`

Used throughout the floor UI and transaction history.

---

### role

Type:

enum or constrained text.

Allowed V1 values:

- `worker`
- `supervisor`

---

### employee_code

Type:

`text`

Nullable.

Example:

`BG`

May be used for compact displays or labels.

---

### active

Type:

`boolean`

Default:

`true`

Inactive users should not be able to create new transactions.

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Table: parts

## Purpose

Stores the master list of finished-goods parts.

## Fields

### id

Type:

`uuid`

Primary key.

---

### part_number

Type:

`text`

Unique.

Example:

`MM-A3815`

---

### description

Type:

`text`

Example:

`3/8 x 1-5/8 Headed Anchor`

---

### product_family

Type:

`text`

Examples:

- `1/4 Anchor`
- `3/8 Anchor`
- `1/2 Anchor`
- `5/8 Anchor`
- `3/4 Shear Connector`
- `7/8 Shear Connector`

This field is used by storage-location recommendations.

---

### active

Type:

`boolean`

Default:

`true`

Inactive parts should remain available in historical records but should not be used for new pallets.

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Table: packing_specs

## Purpose

Stores the current standard packing rules for each part.

## Relationship

Each active part has one active V1 packing specification.

Future versions may support packing-spec version history.

## Fields

### id

Type:

`uuid`

Primary key.

---

### part_id

Type:

`uuid`

Foreign key to:

`parts.id`

Unique in V1.

---

### pieces_per_box

Type:

`integer`

Required.

Must be greater than zero.

---

### boxes_per_full_pallet

Type:

`integer`

Required.

Must be greater than zero.

---

### pieces_per_full_pallet

Type:

`integer`

This may be stored or calculated as:

`pieces_per_box * boxes_per_full_pallet`

The server should validate the value if it is stored.

---

### estimated_box_weight_lb

Type:

`numeric`

Nullable.

---

### estimated_full_pallet_weight_lb

Type:

`numeric`

Nullable.

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Table: locations

## Purpose

Stores physical warehouse locations and staging areas.

A location is never permanently tied to one part.

## Fields

### id

Type:

`uuid`

Primary key.

---

### location_code

Type:

`text`

Unique.

Example:

`B-003-AC`

This is the value encoded in the location QR code.

---

### location_type

Type:

enum or constrained text.

Suggested V1 values:

- `rack`
- `shipping_staging`
- `packing`

---

### zone

Type:

`text`

Nullable.

Example:

`B`

Useful for grouping warehouse areas.

---

### rack

Type:

`text`

Nullable.

Example:

`003`

---

### position

Type:

`text`

Nullable.

Example:

`AC`

---

### availability_status

Type:

enum or constrained text.

Suggested values:

- `open`
- `occupied`
- `unavailable`

For V1, rack occupancy should normally be derived from active pallets assigned to the location.

The application should avoid creating a separate source of truth that can disagree with pallet location data.

---

### preferred_product_family

Type:

`text`

Nullable.

This is optional guidance only.

It must not prevent a worker from storing a different product family in the location.

---

### active

Type:

`boolean`

Default:

`true`

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Table: pallets

## Purpose

Stores the current state of every finished-goods pallet.

This table is optimized for fast floor use.

Historical changes are stored in `inventory_transactions`.

## Fields

### id

Type:

`uuid`

Primary key.

---

### pallet_code

Type:

`text`

Unique.

Example:

`MM-P-0004821`

This is the value encoded in the pallet QR code.

The pallet code must never be reused.

---

### part_id

Type:

`uuid`

Foreign key to:

`parts.id`

Required.

---

### heat_number

Type:

`text`

Required for V1 unless a future product type explicitly does not use heat tracking.

Example:

`MM10984723`

---

### lot_number

Type:

`text`

Required.

Example:

`MM261003-07`

---

### machine_code

Type:

`text`

Nullable.

Example:

`MM-14`

This remains simple text in V1 because machine management is outside the scope of this application.

---

### packed_by_user_id

Type:

`uuid`

Foreign key to:

`profiles.id`

---

### packed_at

Type:

`timestamptz`

---

### pieces_per_box_snapshot

Type:

`integer`

Required.

Stores the packing specification used when the pallet was created.

---

### boxes_per_full_pallet_snapshot

Type:

`integer`

Required.

Stores the full-pallet box quantity used when the pallet was created.

---

### estimated_box_weight_lb_snapshot

Type:

`numeric`

Nullable.

---

### original_boxes

Type:

`integer`

Required.

Must be greater than zero.

This is the number of boxes on the pallet at creation.

---

### original_pieces

Type:

`integer`

Required.

Should equal:

`original_boxes * pieces_per_box_snapshot`

---

### current_boxes

Type:

`integer`

Required.

Must be zero or greater.

---

### current_pieces

Type:

`integer`

Required.

Must be zero or greater.

Should equal:

`current_boxes * pieces_per_box_snapshot`

for normal V1 box-level transactions.

---

### current_location_id

Type:

`uuid`

Nullable foreign key to:

`locations.id`

A newly created pallet may temporarily have no rack location.

For `rack` locations, no more than one pallet whose lifecycle is not `shipped` may reference the same location. Pallets in `packing` and `shipping_staging` locations may share a location.

---

### lifecycle_status

Type:

enum or constrained text.

Suggested V1 values:

- `created`
- `stored`
- `shipping_staging`
- `on_hold`
- `shipped`

Do not mix FULL/PARTIAL with lifecycle status.

Full or partial should be derived from quantity.

---

### hold_reason

Type:

`text`

Nullable.

Only meaningful when the pallet is on hold.

---

### lifecycle_status_before_hold

Type:

The same enum or constrained text used by `lifecycle_status`.

Nullable.

When `lifecycle_status` is `on_hold`, this stores the prior eligible lifecycle state:

- `created`
- `stored`
- `shipping_staging`

The protected hold-release operation restores this value and then clears it. This prevents a hold from losing whether the pallet was awaiting storage, stored in a rack, or already in shipping staging.

The value must be null whenever the pallet is not on hold.

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Derived Pallet Values

These values should normally be derived rather than stored as separate sources of truth.

## Full vs Partial

If:

`current_boxes >= boxes_per_full_pallet_snapshot`

the UI may display:

`FULL`

If:

`current_boxes < boxes_per_full_pallet_snapshot`

and current boxes are greater than zero:

`PARTIAL`

If current boxes equal zero and the pallet has shipped:

`SHIPPED`

---

## Current Piece Quantity

For normal V1 behavior:

`current_pieces = current_boxes * pieces_per_box_snapshot`

The server should calculate or validate this.

The client should not be trusted to submit arbitrary piece totals.

---

# Table: inventory_transactions

## Purpose

Stores the immutable audit trail for every meaningful pallet event.

This is the most important historical table in the system.

Normal worker and supervisor workflows should never update or delete existing transaction rows.

## Fields

### id

Type:

`uuid`

Primary key.

---

### pallet_id

Type:

`uuid`

Foreign key to:

`pallets.id`

Required.

---

### transaction_type

Type:

enum or constrained text.

Suggested V1 values:

- `pallet_created`
- `label_printed`
- `stored`
- `box_pull`
- `moved`
- `count_matched`
- `adjustment_requested`
- `adjustment_approved`
- `adjustment_rejected`
- `hold_placed`
- `hold_released`
- `shipping_staging`
- `shipped`

---

### actor_user_id

Type:

`uuid`

Foreign key to:

`profiles.id`

Required.

Identifies the person who performed the action.

---

### occurred_at

Type:

`timestamptz`

Required.

Prefer database-generated timestamps.

---

### previous_boxes

Type:

`integer`

Nullable.

---

### box_change

Type:

`integer`

Nullable.

Examples:

`-6` for a box pull.

`-2` for an approved negative adjustment.

---

### new_boxes

Type:

`integer`

Nullable.

---

### previous_pieces

Type:

`integer`

Nullable.

---

### piece_change

Type:

`integer`

Nullable.

---

### new_pieces

Type:

`integer`

Nullable.

---

### previous_location_id

Type:

`uuid`

Nullable foreign key to:

`locations.id`

---

### new_location_id

Type:

`uuid`

Nullable foreign key to:

`locations.id`

---

### po_reference

Type:

`text`

Nullable.

---

### bol_reference

Type:

`text`

Nullable.

---

### reason_code

Type:

`text`

Nullable.

Examples:

- `shipping`
- `hot_job`
- `transfer`
- `damage`
- `count_error`
- `unrecorded_shipping_pull`
- `packing_correction`
- `other`

---

### reason_notes

Type:

`text`

Nullable.

Used when additional explanation is necessary.

---

### adjustment_request_id

Type:

`uuid`

Nullable foreign key to:

`adjustment_requests.id`

Links approval/rejection transactions to the request that caused them.

---

### idempotency_key

Type:

`text`

Unique when present.

Used to prevent accidental duplicate submissions caused by:

- Poor Wi-Fi
- Repeated button taps
- Browser retries
- User retry after uncertain network state

---

### metadata

Type:

`jsonb`

Nullable.

Use only for small event-specific details that do not justify a new V1 column.

Do not use `metadata` as a dumping ground for core business data.

---

### created_at

Type:

`timestamptz`

---

# Table: adjustment_requests

## Purpose

Stores inventory discrepancies that require supervisor approval.

A worker cannot directly change current inventory through a physical count mismatch.

## Fields

### id

Type:

`uuid`

Primary key.

---

### pallet_id

Type:

`uuid`

Foreign key to:

`pallets.id`

Required.

---

### requested_by_user_id

Type:

`uuid`

Foreign key to:

`profiles.id`

Required.

---

### system_boxes

Type:

`integer`

Required.

Quantity the system showed when the worker performed the count.

---

### counted_boxes

Type:

`integer`

Required.

Physical quantity counted by the worker.

---

### box_difference

Type:

`integer`

Required.

Calculated as:

`counted_boxes - system_boxes`

---

### system_pieces

Type:

`integer`

Required.

---

### counted_pieces

Type:

`integer`

Required.

Calculated from the pallet's packing snapshot.

---

### piece_difference

Type:

`integer`

Required.

---

### reason_code

Type:

`text`

Required.

Suggested V1 values:

- `unrecorded_shipping_pull`
- `damaged_product`
- `packing_correction`
- `count_error`
- `other`

---

### reason_notes

Type:

`text`

Nullable.

---

### status

Type:

enum or constrained text.

Allowed values:

- `pending`
- `approved`
- `rejected`

---

### reviewed_by_user_id

Type:

`uuid`

Nullable foreign key to:

`profiles.id`

Must refer to a supervisor when status becomes approved or rejected.

---

### reviewed_at

Type:

`timestamptz`

Nullable.

---

### review_notes

Type:

`text`

Nullable.

---

### created_at

Type:

`timestamptz`

---

### updated_at

Type:

`timestamptz`

---

# Relationships

The main relationships are:

`auth.users`  
→ one-to-one → `profiles`

`parts`  
→ one-to-one in V1 → `packing_specs`

`parts`  
→ one-to-many → `pallets`

`locations`  
→ one-to-many over time → `pallets`

`pallets`  
→ one-to-many → `inventory_transactions`

`pallets`  
→ one-to-many → `adjustment_requests`

`profiles`  
→ one-to-many → `inventory_transactions`

`profiles`  
→ one-to-many → `adjustment_requests`

---

# Pallet Creation Transaction

When a new pallet is created, the system should perform one atomic operation.

## Example

Create pallet:

`MM-P-0004821`

Values:

- Part: MM-A3815
- Original boxes: 31
- Pieces per box snapshot: 700
- Original pieces: 21,700
- Current boxes: 31
- Current pieces: 21,700
- Lifecycle status: created

Then insert:

Transaction type:

`pallet_created`

Transaction values:

- previous boxes: 0
- box change: +31
- new boxes: 31
- previous pieces: 0
- piece change: +21,700
- new pieces: 21,700

Both records must succeed together.

---

# Box Pull Transaction

Example:

Current pallet:

- 31 boxes
- 21,700 pieces

Worker pulls:

- 6 boxes

Server calculates:

- 4,200 pieces removed
- 25 boxes remaining
- 17,500 pieces remaining

Transaction:

`box_pull`

Values:

- previous boxes: 31
- box change: -6
- new boxes: 25
- previous pieces: 21,700
- piece change: -4,200
- new pieces: 17,500

Then update the pallet current state.

The client should submit the requested box count.

The server should calculate the piece change.

---

# Move Transaction

Example:

Current location:

`B-003-AC`

New location:

`B-004-AB`

Transaction:

`moved`

Values:

- previous location: B-003-AC
- new location: B-004-AB

Then update:

`pallets.current_location_id`

---

# Count Match Transaction

If the worker counts the same quantity shown by the system:

System:

25 boxes

Physical:

25 boxes

No inventory quantity changes.

Create:

`count_matched`

This creates evidence that the pallet was physically verified.

---

# Adjustment Approval Transaction

Example:

System quantity:

25 boxes

Physical quantity:

23 boxes

Difference:

-2 boxes

Worker creates a pending adjustment request.

No pallet quantity changes yet.

If supervisor approves:

1. Validate that the request is still pending.
2. Validate the current pallet quantity.
3. Calculate the approved change.
4. Insert `adjustment_approved` transaction.
5. Update pallet current quantity.
6. Mark adjustment request approved.
7. Save supervisor and timestamp.

All steps must occur atomically.

---

# FIFO Rules

FIFO should use the oldest eligible inventory.

Suggested V1 ordering:

1. Pallet is not shipped.
2. Pallet is not on hold.
3. Pallet has current_boxes greater than zero.
4. Pallet matches requested part.
5. Sort by `packed_at` ascending.
6. Use `created_at` as a deterministic tie-breaker if needed.

The UI marks the first eligible pallet:

**PULL FIRST**

FIFO is a recommendation for the worker, not a destructive automatic allocation engine in V1.

---

# Storage Recommendation Data

V1 storage recommendations should use simple rules.

Inputs may include:

- Pallet product family
- Open rack locations
- Product families stored nearby
- Warehouse zone

Suggested priority:

1. Valid open location
2. Same family nearby
3. Nearby open location
4. Other valid open location

Do not create advanced warehouse optimization in V1.

---

# Location Occupancy

For V1, a location with `location_type = rack` may contain only one active pallet. An active pallet for this rule is any pallet whose lifecycle status is not `shipped`, including a pallet that is on hold.

Locations with `location_type = packing` or `location_type = shipping_staging` may contain multiple active pallets. Pallets with no current location and shipped pallets do not occupy rack capacity.

Avoid maintaining two unrelated truths such as:

`locations.status = occupied`

and separately:

`pallet.current_location_id = location`

without validation.

Preferred approach:

- Pallet assignment is the source of truth.
- Occupancy is derived by querying active pallets at a location.
- A database trigger locks the affected `locations` rows and rejects a second active pallet assigned to a rack.
- Changing a shared location to `rack` is rejected while it contains more than one active pallet.
- Future protected Store and Move RPCs must lock the pallet first, lock the source and destination location rows in stable ID order, and recheck destination occupancy before updating the pallet and inserting history.
- If a cached location status is later added for performance, it must be maintained transactionally.

A partial unique index on `pallets.current_location_id` cannot express this rule because `location_type` belongs to `locations`. A global unique constraint would also incorrectly prevent multiple pallets in packing and shipping staging.

When a rack is occupied, the worker-facing error is:

**LOCATION OCCUPIED**

`B-003-AC already contains a pallet.`

`Scan another location.`

---

# Shipping References

V1 does not require a separate shipping-order system.

PO and BOL references may be stored directly on relevant inventory transactions.

Examples:

- Box pull
- Shipping staging
- Shipped

This avoids building an ERP shipping module before it is needed.

A separate shipping-order model can be added later if requirements justify it.

---

# QR Data

## Pallet QR

The QR should contain only a stable identifier.

Example:

`MM-P-0004821`

Do not encode full pallet details in the QR.

The app uses the pallet code to load current data from the database.

---

## Location QR

The QR should contain the location code.

Example:

`B-003-AC`

The app validates that the location exists and is active before allowing a transaction.

---

# Timestamp Rules

All database timestamps should use:

`timestamptz`

Store timestamps in UTC.

Display them in the user's local time zone.

Transaction timestamps should preferably be generated by the database, not trusted from the client device.

---

# Data Validation Rules

V1 should enforce at least these rules:

- Part numbers are unique.
- Pallet codes are unique and never reused.
- Location codes are unique.
- Pieces per box must be greater than zero.
- Boxes per full pallet must be greater than zero.
- Original boxes must be greater than zero.
- Current boxes cannot be negative.
- Current pieces cannot be negative.
- Pull quantity cannot exceed available boxes.
- Shipped pallets cannot be used for new pulls.
- Pallets on hold cannot be shipped through normal workflow.
- Workers cannot directly approve their own adjustment unless they also hold supervisor authorization and the security rules explicitly allow it.
- Adjustment requests can only move from pending to approved or rejected.
- Inventory transaction history is append-only for normal users.

---

# Concurrency Rules

Two workers may attempt to act on the same pallet at nearly the same time.

The server must protect against stale updates.

Example:

Worker A sees:

25 boxes

Worker B also sees:

25 boxes

Worker A pulls 10.

The real balance becomes:

15 boxes

Worker B must not be allowed to submit a stale pull of 20 based on the old 25-box value.

Inventory-changing operations should therefore:

- Run server-side
- Lock or safely validate the pallet row
- Check current quantity at transaction time
- Reject stale or invalid operations
- Commit the transaction and pallet update atomically

---

# Duplicate Submission Protection

Every important write action should support an idempotency key.

This protects against:

- Double taps
- Network retries
- Browser resubmission
- Poor factory Wi-Fi

If the same idempotency key is submitted twice, the system should not create two inventory transactions.

---

# Deletion Rules

Normal application users should not delete:

- Pallets
- Transactions
- Adjustment requests
- Parts that have historical use
- Locations that have historical use

Instead:

- Parts become inactive.
- Locations become inactive.
- Pallets remain historical.
- Transactions remain immutable.

This protects traceability.

---

# Seed Data

Development and demo environments should use fictional Mimir Metals data only.

Example parts:

- MM-A141 — 1/4 x 1-1/8 Anchor
- MM-A3815 — 3/8 x 1-5/8 Headed Anchor
- MM-A1212 — 1/2 x 12-1/8 Headed Anchor
- MM-A586 — 5/8 x 6-3/16 Anchor
- MM-SC343 — 3/4 x 3-3/16 Shear Connector
- MM-SC785 — 7/8 x 5-3/16 Shear Connector
- MM-SC18 — 1 x 8-1/4 Shear Connector

Example locations:

- B-001-AA
- B-001-AB
- B-001-AC
- B-001-AD
- B-002-AA
- B-002-AB
- B-002-AC
- B-002-AD
- B-003-AA
- B-003-AB
- B-003-AC
- B-003-AD
- B-004-AA
- B-004-AB

No real employer, customer, proprietary part, heat, lot, quantity, or production data should be included in the repository.

---

# Future Extensions

Do not add these to the V1 schema unless the real product requires them.

Possible future tables include:

- work_orders
- customers
- shipping_orders
- box_units
- machines
- quality_holds
- production_runs
- travelers
- qc_inspections
- warehouse_zones
- label_templates

The V1 schema should not anticipate every future ShopBrain feature.

Add new entities only when the product workflow actually needs them.

---

# Data Model Acceptance Criteria

The V1 data model is acceptable when it can accurately represent all of these scenarios:

1. Create a full pallet.
2. Create a partial pallet.
3. Store a pallet in a rack.
4. Recommend nearby family storage.
5. Find all available pallets for a part.
6. Determine FIFO order.
7. Pull several boxes from a pallet.
8. Prevent a pull larger than available inventory.
9. Move a pallet between locations.
10. Record a matching physical count.
11. Create a mismatched count adjustment request.
12. Approve or reject an adjustment.
13. Place and release a pallet hold.
14. Send a pallet to shipping staging.
15. Ship a pallet.
16. Show complete pallet history.
17. Prevent duplicate inventory-changing submissions.
18. Prevent stale concurrent quantity updates.
19. Preserve packing math even if the master packing specification changes later.
20. Preserve all historical events without destructive edits.

---

# Final Rule

The current pallet record tells us:

> What is true now?

The transaction history tells us:

> How did it become true?

Both are required.

If the system cannot answer both questions reliably, the inventory model is incomplete.
