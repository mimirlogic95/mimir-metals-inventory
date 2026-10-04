# Mimir Metals Finished Goods Inventory

Mobile-first finished-goods inventory tracking for manufacturing floors.

Mimir Metals Finished Goods Inventory is designed for workers who need to quickly answer:

- What do we have?
- How much do we have?
- Where is it?
- Which pallet should we pull first?
- What happened to it?

The system tracks finished pallets from packing through storage and shipping using phones/tablets, QR codes, pallet IDs, FIFO logic, and a complete transaction history.

> This repository uses fictional Mimir Metals data only. Do not add real employer, customer, production, part, heat, lot, PO, BOL, or proprietary manufacturing data.

---

## V1 Goal

Build a simple, reliable floor application that lets a worker:

- Create a pallet
- Print a pallet label
- Store a pallet
- Find inventory
- Follow FIFO
- Pull individual boxes
- Move a pallet
- Count inventory
- Submit an adjustment
- Approve/reject adjustments as a supervisor
- Track hot jobs
- Stage and ship pallets
- View complete pallet history

The app is designed phone-first and tablet-ready.

No specialized barcode scanner is required for V1.

---

## Core Product Rule

Every inventory change is a transaction.

Inventory should never be silently overwritten.

Example:

```text
PALLET CREATED
+31 boxes

BOX PULL
-6 boxes

ADJUSTMENT APPROVED
-2 boxes

CURRENT
23 boxes
```

The pallet record answers:

> What is true now?

The transaction history answers:

> How did it become true?

Both are required.

---

## Primary Worker Actions

The home screen is intentionally simple:

- CREATE PALLET
- STORE
- FIND
- PULL BOXES
- MOVE
- COUNT

Secondary actions:

- SHIPPING
- HISTORY

The worker should be able to understand the app with minimal training.

---

## Pallet Tracking

Each pallet receives a permanent unique pallet code.

Example:

```text
MM-P-0004821
```

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
- Current location
- Full/partial state
- PO/BOL references
- Transaction history

---

## QR Workflow

V1 uses phone/tablet camera scanning.

### Pallet QR

Example:

```text
MM-P-0004821
```

### Location QR

Example:

```text
B-003-AC
```

QR codes identify objects.

Scanning alone must not perform a destructive inventory action.

The worker sees what was scanned, reviews the action, and confirms it.

---

## Storage Recommendations

Warehouse locations are flexible.

The system may recommend storage near similar product families.

Example:

```text
3/8" Anchor

Suggested:
B-003-AC  Same family nearby
B-003-AD  Same family nearby
B-004-AA  Nearby open location
```

The recommendation is advisory.

The worker may choose another valid open location.

---

## FIFO

Available inventory is ordered by FIFO:

First In, First Out.

The oldest eligible pallet should be clearly marked:

```text
PULL FIRST
```

Held or shipped pallets are excluded from normal FIFO recommendations.

---

## Technology

Planned V1 stack:

- React
- TypeScript
- Vite
- Tailwind CSS
- Progressive Web App
- TanStack Query
- Zod
- Supabase
- PostgreSQL
- Supabase Auth
- PostgreSQL functions / Supabase RPC
- Vitest
- React Testing Library
- Playwright
- GitHub
- Netlify or Vercel

---

## Architecture

The frontend is optimized for worker usability.

The backend/database is the authority for inventory.

Sensitive inventory operations must be:

- Authenticated
- Authorized
- Server-validated
- Atomic
- Idempotent
- Protected from stale concurrent updates
- Recorded in transaction history

Important writes should not be performed as several unrelated client-side database operations.

---

## Main V1 Data

Core tables:

- `profiles`
- `parts`
- `packing_specs`
- `locations`
- `pallets`
- `inventory_transactions`
- `adjustment_requests`

Supabase Auth manages authentication separately.

---

## Supabase Development Database

A dedicated Supabase Cloud development project is used to execute migrations, seed fictional data, validate database rules, and generate TypeScript database types. It is not a production or customer database.

Authenticate and link each checkout locally:

```bash
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 projects list --output pretty
npx --yes supabase@2.119.0 link --project-ref <development-project-ref>
```

Project-link metadata is stored under the ignored `supabase/.temp/` directory. Before applying changes, verify the linked project name and preview pending migrations:

```bash
npx --yes supabase@2.119.0 migration list --linked
npx --yes supabase@2.119.0 db push --linked --dry-run
```

Apply reviewed migrations and, for a development database only, the fictional seed:

```bash
npx --yes supabase@2.119.0 db push --linked
npx --yes supabase@2.119.0 db push --linked --include-seed
```

Run the rollback-only database foundation validation and regenerate database types after schema changes:

```bash
npx --yes supabase@2.119.0 db query --linked --file supabase/tests/database_foundation.sql
npx --yes supabase@2.119.0 gen types typescript --linked --schema public > src/types/database.generated.ts
```

Copy `.env.example` to an ignored local `.env` when browser configuration is needed. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` local; never commit real environment values, database passwords, access tokens, service-role keys, or production credentials.

---

## Worker and Supervisor Roles

### Worker

Can:

- Create pallets
- Store pallets
- Find inventory
- Pull boxes
- Move pallets
- Count inventory
- Submit adjustment requests
- View history

### Supervisor

Can do everything a worker can do, plus:

- Approve adjustments
- Reject adjustments
- Place holds
- Release holds

Permissions must be enforced server-side.

---

## Project Documentation

Read these before changing behavior:

- [Product](docs/PRODUCT.md)
- [Workflow](docs/WORKFLOW.md)
- [Data Model](docs/DATA-MODEL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Security](SECURITY.md)
- [TypeScript Engineering Standard](TYPESCRIPT_ENGINEERING_STANDARD.md)
- [Agent Instructions](AGENTS.md)

Architecture decisions are recorded in:

```text
docs/decisions/
```

---

## Source-of-Truth Order

When project instructions conflict, use this order:

1. Current task instructions
2. `SECURITY.md`
3. `docs/PRODUCT.md`
4. `docs/WORKFLOW.md`
5. `docs/DATA-MODEL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/TESTING.md`
8. `TYPESCRIPT_ENGINEERING_STANDARD.md`
9. Existing implementation and tests
10. `AGENTS.md`

---

## Planned Repository Structure

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

## V1 Acceptance Flows

### Create and Store

```text
Home
-> Create Pallet
-> Select Part
-> Enter Boxes
-> Calculate Pieces
-> Create Pallet
-> Print Label
-> Store
-> Scan Location
-> Confirm
-> Success
```

### Find and Pull

```text
Home
-> Find
-> Search Part
-> See FIFO PULL FIRST
-> Open Pallet
-> Pull Boxes
-> Review
-> Confirm
-> Updated Inventory
-> History
```

### Count and Adjust

```text
Home
-> Count
-> Scan Pallet
-> Enter Physical Count
-> Mismatch
-> Submit Adjustment
-> Supervisor Review
-> Approve/Reject
-> History
```

### Move

```text
Home
-> Move
-> Scan Pallet
-> Scan New Location
-> Confirm
-> Success
-> History
```

---

## Not V1

Do not add these unless requirements change:

- AI chatbot
- Full ERP
- Accounting
- Purchasing
- Customer portal
- Machine monitoring
- Tooling inventory
- Individual box tracking
- Zebra scanner integration
- IoT
- Voice assistant
- Predictive analytics
- Advanced warehouse maps
- Microservices
- Complex offline inventory synchronization

---

## Development Rules

Work in small missions.

For each mission:

1. Read the relevant docs.
2. Inspect the current implementation.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run checks.
6. Review the diff.
7. Update documentation if behavior changed.

Do not build future features while assigned a focused task.

---

## Expected Quality Checks

As the application is implemented, the project should support:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Do not claim a check passed unless it was actually run.

---

## Demo Readiness

Before V1 is considered ready to show, a phone should be able to complete this without developer intervention:

1. Create or load a fictional pallet.
2. Scan the pallet.
3. Store it in a scanned location.
4. Find the part.
5. Show FIFO PULL FIRST.
6. Pull several boxes.
7. Show the updated balance.
8. Open pallet history.
9. Move the pallet.
10. Show the movement in history.

If the demo requires developer tools or manual database correction, V1 is not ready.

---

## Long-Term Direction

This project may eventually connect to a larger manufacturing platform.

Possible future flow:

```text
Setup
-> Production
-> QC
-> Finished Goods
-> Inventory
-> Shipping
```

Each module should remain useful on its own.

Solve the floor problem first.

Connect systems later.
