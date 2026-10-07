# Mimir Metals Finished Goods Inventory — Architecture

## Purpose

This document defines the V1 software architecture for Mimir Metals Finished Goods Inventory.

The goal is to build a mobile-first manufacturing application that is:

- Simple for workers to use
- Reliable enough for inventory transactions
- Easy to maintain
- Easy to deploy
- Secure by default
- Ready to grow without becoming overengineered

The architecture should support the current finished-goods workflow without trying to become a full ERP system.

---

# Architecture Summary

V1 will use a browser-based Progressive Web App backed by Supabase.

High-level architecture:

```text
Phone / Tablet
    |
    v
React + TypeScript PWA
    |
    v
Supabase Client
    |
    +----------------------+
    |                      |
    v                      v
PostgreSQL + RLS       Supabase Auth
    |
    v
Server-side database functions / RPC
    |
    v
Atomic inventory transactions
```

The frontend handles presentation and user interaction.

The database and server-side functions enforce inventory rules.

The client must never be the final authority for inventory quantities, role permissions, or transaction integrity.

---

# Chosen V1 Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

## Application Type

- Progressive Web App
- Mobile-first
- Responsive for tablets and desktop

## Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security
- PostgreSQL functions / Supabase RPC for protected inventory operations

## Validation

- Zod

## Server State

- TanStack Query

## Forms

- React Hook Form where useful

## QR

- Browser camera QR scanning library
- QR generation library

## Printing

- Browser-based HTML/CSS pallet label templates
- Print-specific styles

## Hosting

Frontend:

- Netlify or Vercel

Backend:

- Supabase hosted project

## Source Control

- GitHub

---

# Why Vite Instead of a Larger Framework

V1 is primarily an authenticated client application.

It does not currently require:

- Search-engine optimization
- Server-rendered public pages
- Complex server routing
- Marketing-site rendering
- A custom Node backend

Vite keeps the frontend small and understandable.

If future requirements justify a server framework, the application can evolve later.

Do not introduce additional framework complexity before the product needs it.

---

# Architectural Principles

## 1. Worker Experience Comes First

The architecture must support a fast floor workflow.

Technical decisions should not force unnecessary steps into the UI.

The worker should see:

- Large controls
- Fast feedback
- Clear loading states
- Clear success states
- Clear errors
- Minimal typing

Complexity should stay behind the interface.

---

## 2. Server Is the Authority

The frontend may calculate values for immediate display.

Example:

31 boxes × 700 pieces = 21,700 pieces

However, the server must independently validate or calculate the authoritative value before saving.

The client must not be trusted for:

- Current quantity
- Piece totals
- Role authorization
- FIFO eligibility
- Adjustment approval
- Hold state
- Location validity
- Duplicate transaction prevention

---

## 3. Inventory Writes Are Atomic

An inventory-changing operation must not be implemented as several unrelated client writes.

Bad:

```text
1. Client inserts transaction
2. Client updates pallet
3. Client updates location
```

If step 2 fails, the system becomes inconsistent.

Preferred:

```text
Client calls one protected server operation
    |
    v
Server validates current state
    |
    v
Transaction inserted
    |
    v
Pallet current state updated
    |
    v
Commit together
```

If any step fails, the entire operation rolls back.

---

## 4. Transaction History Is Append-Only

Normal application workflows must not edit or delete inventory transactions.

Corrections happen through new transactions.

Example:

Wrong quantity:

25 boxes

Physical count:

23 boxes

Do not rewrite the old event.

Create:

`ADJUSTMENT_APPROVED -2 boxes`

This preserves traceability.

---

## 5. Current State Is Optimized for Floor Use

The `pallets` table stores the current state so the app can answer quickly:

- Where is it?
- How many boxes remain?
- Is it on hold?
- Has it shipped?

The transaction table explains how that state was reached.

This is intentional duplication of current state and history, protected by atomic server operations.

---

# Frontend Architecture

The frontend should be organized by product feature rather than by generic file type alone.

Suggested structure:

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── layout/
│
├── features/
│   ├── create-pallet/
│   ├── store-pallet/
│   ├── find-inventory/
│   ├── pull-boxes/
│   ├── move-pallet/
│   ├── count-inventory/
│   ├── adjustments/
│   ├── shipping/
│   └── pallet-history/
│
├── components/
│   ├── ui/
│   ├── scanning/
│   └── feedback/
│
├── domain/
│   ├── pallet/
│   ├── inventory/
│   ├── location/
│   └── transaction/
│
├── lib/
│   ├── supabase/
│   ├── validation/
│   ├── qr/
│   └── printing/
│
├── hooks/
├── types/
└── main.tsx
```

---

# Feature Modules

Each feature should own its workflow-specific code.

Example:

```text
features/pull-boxes/
├── PullBoxesPage.tsx
├── PullReview.tsx
├── pullBoxes.schema.ts
├── pullBoxes.api.ts
└── pullBoxes.types.ts
```

Avoid one giant application component.

Avoid placing all business logic inside page components.

---

# Shared UI Components

Shared components should remain small and reusable.

Examples:

- PrimaryButton
- SecondaryButton
- StatusBadge
- QuantityDisplay
- PalletCard
- LocationCard
- ScanPanel
- LoadingState
- ErrorState
- SuccessState
- StickyActionBar
- NumericInput

Do not build a large generic design system before the app needs one.

---

# Routing

Use a simple client-side router.

Suggested routes:

```text
/
 /create-pallet
 /store
 /find
 /pull
 /move
 /count
 /shipping
 /adjustments
 /pallet/:palletCode
 /pallet/:palletCode/history
```

Route names should reflect worker tasks.

Avoid exposing implementation language in URLs.

---

# State Management

## Local UI State

Use React state for:

- Open/closed controls
- Step selection
- Temporary numeric input
- Scanner state
- Confirmation dialogs

## Server State

Use TanStack Query for:

- Pallet lookups
- Part lists
- Location availability
- FIFO results
- Transaction history
- Pending adjustments

TanStack Query should manage:

- Loading
- Error states
- Refetching
- Cache invalidation

Do not introduce a global state library unless a real need appears.

---

# Forms and Validation

Use Zod schemas for user-input validation.

React Hook Form may be used where forms become complex enough to benefit from it.

Examples:

- Create pallet
- Pull boxes
- Count inventory
- Adjustment reason
- Shipping references

Validation should happen twice:

1. Client-side for fast worker feedback
2. Server-side for authoritative enforcement

Client validation improves usability.

Server validation protects data integrity.

---

# Supabase Architecture

Supabase provides:

- Authentication
- PostgreSQL database
- Row Level Security
- Database functions
- API access
- Realtime capability if needed later

V1 should not use every Supabase feature simply because it exists.

---

# Authentication

Supabase Auth manages login credentials.

Application roles live in:

`profiles`

V1 roles:

- worker
- supervisor

The frontend may use role information to show or hide controls.

However, hidden controls are not security.

The backend must enforce role permissions independently.

---

# Authorization

Use PostgreSQL Row Level Security for table access.

Use protected database functions for sensitive write operations.

Examples:

Worker may:

- Read active parts
- Read locations
- Read inventory
- Create pallets
- Store pallets
- Pull boxes
- Move pallets
- Submit counts
- Submit adjustment requests

Supervisor may additionally:

- Approve adjustments
- Reject adjustments
- Place holds
- Release holds

Direct client updates to protected inventory fields should be restricted.

---

# Protected Inventory Operations

Important inventory changes should be implemented as server-side functions.

Suggested V1 operations:

```text
create_pallet(...)
store_pallet(...)
pull_boxes(...)
move_pallet(...)
record_count(...)
request_adjustment(...)
approve_adjustment(...)
reject_adjustment(...)
place_hold(...)
release_hold(...)
stage_for_shipping(...)
ship_pallet(...)
```

Each operation should:

1. Identify the authenticated user.
2. Check authorization.
3. Validate arguments.
4. Load current pallet state.
5. Validate current state.
6. Calculate authoritative quantities.
7. Insert the transaction.
8. Update current pallet state.
9. Commit atomically.
10. Return the resulting state.

Mission 4 implements `create_pallet` as a `SECURITY DEFINER` function with an empty fixed search path, fully qualified object references, execution revoked from `public` and `anon`, and execution granted only to `authenticated`. It derives its actor from `auth.uid()` and verifies an active worker or supervisor profile. Browser roles retain no direct mutation privileges on pallets or transaction history.

Mission 5 adds `store_pallet` under the same security boundary. It accepts a created pallet from no location or packing, an active rack destination, and an idempotency key. It derives actor and current pallet state on the server, serializes retries by key, locks the pallet and affected locations, checks capacity, then updates current state and appends a zero-quantity-change `stored` transaction in one database transaction. A matching retry returns its recorded result; a changed request with the same key fails. Store does not act as Move and does not accept held or shipped pallets. The browser's rack-availability read is only a preview, never an authorization to occupy a rack.

Mission 7 adds `pull_boxes` under the same browser-read-only boundary. It accepts a pallet code, positive whole-box removal, both expected reviewed balances, a retry key, and optional PO/BOL references. It derives the actor, serializes matching retry keys, locks the pallet, rejects stale or ineligible state, and uses the pallet packing snapshot for authoritative piece arithmetic. Pallet quantity and one append-only `box_pull` event commit or roll back together. Exact retries return the original event; changed requests and actors cannot claim its key. A pull cannot consume the final boxes until Shipping defines the terminal transition. No RLS policy or direct browser write grant is broadened.

Mission 8 adds `move_pallet` with the same fixed empty search path, authenticated-only execution, and no direct browser write grants. It accepts the reviewed source location, different rack destination, and idempotency key. After the pallet row lock it rejects non-stored, held, shipped, non-rack, and stale-source states; it then locks source/destination location rows in stable ID order, rechecks destination occupancy, updates only current location, and writes one zero-quantity-change `moved` event atomically. Exact retries return the original event from history before live-state validation. Quantity, packing snapshots, lifecycle, and `packed_at` are preserved; Find refetches current rack while FIFO order remains tied to packed age.

Pallet codes come from a protected PostgreSQL sequence and are formatted server-side. The same function serializes matching idempotency keys before checking history, so simultaneous retries return one pallet. The browser never supplies authoritative pieces, packing snapshots, pallet codes, actors, or timestamps.

For Store and Move, validation includes a concurrency-safe rack-capacity check. The protected operation locks the pallet, then locks the affected `locations` rows in stable ID order and verifies that no other non-shipped pallet occupies the destination rack. It keeps those locks through the pallet update and history insert. Packing and shipping staging locations deliberately allow multiple pallets, but Move accepts rack-to-rack transitions only.

The schema also enforces this invariant with triggers that use the same location-row lock. A global unique constraint on `pallets.current_location_id` is not valid because it would incorrectly limit shared packing and shipping-staging locations. A partial unique index cannot inspect `locations.location_type`, which is on another table.

---

# Idempotency

Inventory-changing requests should include an idempotency key.

Example:

```text
pull-1e2b7c4a-...
```

The server stores the key with the transaction.

If the same request is accidentally submitted twice, the second submission should not create a second inventory change.

This matters because workers may experience:

- Double taps
- Weak Wi-Fi
- Browser retries
- Uncertain response timing

---

# Concurrency

The backend must protect against two users modifying the same pallet using stale data.

Example:

Worker A and Worker B both see 25 boxes.

Worker A pulls 10.

Current inventory becomes 15.

Worker B then attempts to pull 20 based on the old screen.

The backend must reject Worker B's stale operation.

Implementation may use:

- PostgreSQL row locking
- Conditional updates
- Transaction-level validation

The exact implementation can be chosen during database development.

The requirement is non-negotiable:

> Never allow stale client state to create negative or impossible inventory.

---

# QR Architecture

## Pallet QR

The pallet QR contains only:

`MM-P-0004821`

It should not contain:

- Quantity
- Heat
- Lot
- Location
- Full pallet data

The QR is a stable identifier.

Current information always comes from the database.

---

## Location QR

The location QR contains only:

`B-003-AC`

The app validates the location after scanning.

---

## Scanner Flow

Typical scan architecture:

```text
Camera
  |
  v
QR decoded
  |
  v
Code validated locally
  |
  v
Database lookup
  |
  v
Worker confirmation screen
```

A successful scan should never automatically perform a destructive inventory action.

Scanning identifies.

Confirmation changes inventory.

---

# Pallet Label Architecture

V1 should generate labels from application data.

Preferred approach:

- React label component
- Print-specific CSS
- Dedicated label route or print view
- Browser print dialog

Example:

```text
/pallet/MM-P-0004821/label
```

V1 should not require a proprietary printer SDK.

The Create Pallet success state provides this browser print view directly. The label is sized for a 4×6-inch print page and generates a QR containing only the returned permanent `pallet_code`.

Industrial printer integration may be added later if required.

---

# PWA Architecture

The application should be installable to a phone or tablet home screen.

V1 PWA requirements:

- Web app manifest
- Application icons
- Standalone display support
- Responsive layout
- HTTPS
- Basic app-shell caching

V1 should NOT queue inventory-changing writes while offline.

That is deliberate.

---

# Offline and Poor Wi-Fi Behavior

Full offline transaction synchronization is out of scope for V1.

The reason is inventory integrity.

Two offline devices could otherwise create conflicting changes.

V1 behavior:

If online:

- Normal operation

If connection drops before save:

- Show **NOT SAVED YET**
- Keep the worker's entered data where practical
- Allow retry
- Use the same idempotency key

If save succeeds but the response is lost:

- Retry using the same idempotency key
- Server returns the original result rather than creating a duplicate

Read-only app-shell caching may still allow the UI to load.

Inventory writes require confirmed server communication.

---

# FIFO Architecture

Mission 6 uses a typed, authenticated Supabase read query against existing `pallets` and `locations`; no new database object or privileged read RPC is required. PostgreSQL filters to stored, positive-quantity rack pallets for one part and orders by `packed_at`, `created_at`, then pallet ID. The data-access module pages the complete result so API row limits cannot quietly undercount inventory. RLS and SELECT-only browser grants remain the authorization boundary.

Eligibility:

- Matching part
- `stored` lifecycle with an actual rack location
- Current boxes and current pieces greater than zero
- Not shipped, on hold, created, or in shipping staging

Ordering:

1. `packed_at ASC`
2. `created_at ASC`
3. immutable pallet `id ASC`

The frontend displays the first eligible result as:

**PULL FIRST**

The frontend sums current quantities from the complete eligible result and marks only its first pallet. It derives FULL/PARTIAL from the pallet snapshot. A separate held count provides an unavailable notice without affecting totals or FIFO. Refresh and focus refetch current data; loading and failed refreshes hide cached inventory rather than presenting it as current. This read cannot mutate inventory.

The Pull screen obtains fresh FIFO guidance through the same Find read before review. **PULL FIRST** remains advisory; a non-FIFO pallet warns and identifies the oldest eligible rack but is not rejected solely for FIFO order. The Pull RPC validates pallet state and quantities, not FIFO allocation. A successful pull invalidates Find and Pull query caches so returning to Find refetches balances and order. A lost response is retried with the same frozen payload and idempotency key; the UI does not optimistically claim success.

---

# Storage Recommendation Architecture

V1 recommendations should remain rule-based.

Inputs:

- Product family
- Open locations
- Nearby pallets
- Zone / rack structure

Simple scoring example:

```text
open location                        required
same product family nearby           +high score
same warehouse zone                  +medium score
nearby open location                 +small score
```

The recommendation is advisory.

The worker may choose another valid location.

No machine learning or optimization service is required.

---

# Error Architecture

Backend errors should map to worker-readable messages.

Examples:

Backend condition:

`PALLET_NOT_FOUND`

UI:

**PALLET NOT FOUND**

---

Backend condition:

`INSUFFICIENT_BOXES`

UI:

**QUANTITY TOO HIGH**

---

Backend condition:

`PALLET_ON_HOLD`

UI:

**PALLET ON HOLD**

---

Backend condition:

`LOCATION_OCCUPIED`

UI:

**LOCATION OCCUPIED**

`B-003-AC already contains a pallet.`

`Scan another location.`

Do not show raw SQL, Supabase, stack-trace, or network error text to workers.

Technical details may be logged separately.

---

# Logging

V1 should distinguish between:

## Business Audit History

Stored in:

`inventory_transactions`

This answers:

- Who did it?
- What changed?
- When?
- Why?

## Technical Logs

Used for:

- Application errors
- Failed requests
- Unexpected exceptions
- Deployment debugging

Technical logs are not a replacement for transaction history.

---

# Testing Architecture

Testing should exist at multiple levels.

## Unit Tests

For:

- Packing calculations
- Status derivation
- Validation
- FIFO helper rules
- Formatting

## Component Tests

For:

- Quantity input
- Pallet cards
- Scan confirmation
- Error states
- Success states

## Integration Tests

For:

- Create pallet
- Box pull
- Move pallet
- Adjustment approval
- Authorization
- Duplicate submission

## End-to-End Tests

At minimum:

- Create and store
- Find and pull
- Count and approve adjustment
- Move pallet

The detailed testing rules live in `docs/TESTING.md`.

---

# Environment Structure

Suggested environments:

## Local

Developer machine.

Uses local or dedicated development Supabase data. The repository has been validated against a dedicated Supabase Cloud development project; each checkout links locally through ignored CLI metadata.

Until the authentication-screen mission, Vite development mode may use `VITE_DEV_AUTH_EMAIL` and `VITE_DEV_AUTH_PASSWORD` to sign in a fictional development account when no session exists. The helper still uses Supabase Auth and the normal active-profile/RPC authorization checks. It is unavailable in production builds, and populated credentials remain in ignored local environment configuration.

---

## Preview

Used for branch or pull-request testing.

Must use fictional demo data.

---

## Production Demo

Publicly reachable or controlled showcase environment.

Uses fictional Mimir Metals data only unless a future customer implementation explicitly supplies authorized data.

Never point development code at a real customer's production database.

---

# Environment Variables

Secrets and environment-specific settings must use environment variables.

Examples:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The Supabase anonymous public key may be exposed to the browser as designed by Supabase.

Privileged service-role secrets must never be exposed to the frontend.

Never commit:

- Service-role keys
- Private tokens
- Passwords
- Database passwords
- Production secrets

More detailed rules belong in `SECURITY.md`.

---

# Repository Structure

Suggested V1 repository structure:

```text
mimir-metals-inventory/
├── docs/
│   ├── PRODUCT.md
│   ├── WORKFLOW.md
│   ├── DATA-MODEL.md
│   ├── ARCHITECTURE.md
│   ├── TESTING.md
│   └── decisions/
│       └── README.md
│
├── src/
│   ├── app/
│   ├── features/
│   ├── components/
│   ├── domain/
│   ├── lib/
│   ├── hooks/
│   └── types/
│
├── public/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/
│
├── AGENTS.md
├── SECURITY.md
├── TYPESCRIPT_ENGINEERING_STANDARD.md
├── README.md
├── .env.example
├── package.json
└── vite.config.ts
```

---

# Dependency Rules

Add dependencies only when they solve a real requirement.

Prefer:

- Mature libraries
- Small focused libraries
- Active maintenance
- Good TypeScript support
- Clear licenses

Avoid:

- Large UI frameworks that fight the floor-first design
- Multiple libraries solving the same problem
- Abandoned packages
- Dependencies added only for convenience when simple code is clearer

---

# Architectural Boundaries

## UI Layer

Responsible for:

- Display
- User input
- Navigation
- Loading / error / success states

Not responsible for:

- Final inventory authority
- Security decisions
- Atomic transaction enforcement

---

## Domain Layer

Responsible for:

- Shared business terminology
- Pure calculations
- Derived display state
- Input shaping
- Domain validation that can run client-side

Examples:

- Full vs partial display
- Quantity previews
- Formatting

---

## Data Access Layer

Responsible for:

- Supabase queries
- RPC calls
- Query keys
- Response mapping

UI components should not scatter raw Supabase queries everywhere.

---

## Database / Server Layer

Responsible for:

- Authorization
- Current-state validation
- Atomic transactions
- Inventory calculations
- Concurrency protection
- Idempotency
- Audit integrity

This layer is the final authority.

---

# What We Are Not Building

V1 architecture should not include:

- Microservices
- Kubernetes
- Event streaming platforms
- Message queues
- Custom GraphQL server
- Separate Node API without a demonstrated need
- AI service
- Native mobile apps
- Individual box tracking
- ERP integration
- Machine/IoT integration
- Complex offline synchronization
- Data warehouse
- Advanced analytics platform

These may be reconsidered only when product requirements justify them.

---

# Architecture Decision Records

Important technical decisions should be recorded in:

`docs/decisions/`

Examples:

- Why pallet-level instead of box-level tracking?
- Why transaction-based inventory?
- Why PWA instead of native mobile?
- Why Vite?
- Why Supabase?
- Why no offline writes in V1?

An architecture decision record should explain:

- Context
- Decision
- Reason
- Tradeoffs
- Consequences

Keep records short.

---

# V1 Architecture Acceptance Criteria

The architecture is successful when:

1. A phone or tablet can run the full worker workflow.
2. The UI remains simple while the backend enforces inventory rules.
3. A client cannot directly create impossible inventory values.
4. Every inventory change creates an audit transaction.
5. Quantity and history changes succeed or fail together.
6. Duplicate submissions do not duplicate inventory changes.
7. Concurrent stale updates are rejected safely.
8. Worker and supervisor permissions are enforced server-side.
9. QR codes identify pallets and locations without embedding mutable data.
10. Poor Wi-Fi cannot silently create uncertain inventory changes.
11. The app can be deployed without proprietary hardware.
12. The codebase remains understandable to a small development team.
13. V1 stays focused on finished goods instead of expanding into ERP scope.

---

# Final Architecture Rule

Keep the frontend easy.

Keep the business rules explicit.

Keep inventory authority on the server.

Keep every change traceable.

If a technical choice makes the worker experience harder or the inventory history less trustworthy, it is the wrong choice for V1.
