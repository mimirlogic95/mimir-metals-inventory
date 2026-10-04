# AGENTS.md

## Purpose

This file defines how AI coding agents and human contributors should work inside the Mimir Metals Finished Goods Inventory repository.

The goal is to keep development disciplined, understandable, secure, and aligned with the actual manufacturing-floor problem.

This repository should not become a collection of disconnected AI-generated features.

Build the smallest correct version of the documented product, one mission at a time.

---

# Product Context

Mimir Metals Finished Goods Inventory is a mobile-first finished-goods tracking application for manufacturing shops.

The primary user is a worker on the floor.

Core V1 tasks are:

- Create pallet
- Store pallet
- Find inventory
- Pull boxes
- Move pallet
- Count inventory
- Approve/reject adjustments
- Ship product
- View pallet history

The worker experience must remain simple.

The system underneath must remain strict about:

- Inventory integrity
- Transaction traceability
- Authorization
- Duplicate protection
- Concurrency
- Historical accuracy

---

# Source of Truth

When instructions conflict, use this priority order:

1. Direct task instructions from the current user/request
2. `SECURITY.md`
3. `docs/PRODUCT.md`
4. `docs/WORKFLOW.md`
5. `docs/DATA-MODEL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/TESTING.md`
8. `TYPESCRIPT_ENGINEERING_STANDARD.md`
9. Existing implementation and tests
10. This file

Do not silently invent new product behavior when the documentation is clear.

If implementation and documentation disagree, stop and identify the mismatch before spreading the inconsistency.

---

# V1 Scope Discipline

V1 includes:

- Phone/tablet-first PWA
- Worker/supervisor authentication
- Parts
- Packing specifications
- Pallet IDs
- Full and partial pallets
- Pallet labels
- QR scanning
- Rack locations
- Storage recommendations
- FIFO
- Box pulls
- Pallet moves
- Counts
- Supervisor adjustments
- Holds
- Shipping staging
- PO/BOL references
- Transaction history

Do not add these unless explicitly requested:

- AI chatbot
- Full ERP features
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
- Complex offline synchronization

Do not turn a focused inventory app into ShopBrain prematurely.

---

# Data Boundary

This repository uses fictional Mimir Metals data only.

Never add:

- Real employer data
- Real customer names
- Real proprietary part numbers
- Real heat numbers
- Real lot numbers
- Real PO/BOL values
- Real production quantities
- Real workplace screenshots containing sensitive information
- Real internal documents

If a task appears to require real production data, stop and ask for an approved fictional substitute.

---

# Worker-First UX Rule

Every new screen should answer four questions immediately:

1. What am I doing?
2. What did I scan or select?
3. What will happen if I confirm?
4. Did the transaction succeed?

Design for:

- Phones first
- Tablets second
- Large touch targets
- Minimal typing
- Strong contrast
- Large quantities
- Clear status text
- One main action per screen
- Sticky bottom primary actions when useful
- Manual fallback when scanning fails

Avoid:

- Tiny desktop tables
- Hidden controls
- Hover-only actions
- Office-dashboard clutter
- Long forms
- Complex navigation
- Decorative features that slow the workflow

If a worker would ask "why do I have to press this?", simplify it.

---

# Core Inventory Rule

Inventory changes must be transaction-based.

Never silently overwrite inventory state.

Example:

Bad:

```text
current_boxes: 31 -> 25
```

with no event history.

Correct:

```text
BOX_PULL
previous_boxes: 31
box_change: -6
new_boxes: 25
```

and then update the pallet's current state atomically.

The current pallet record answers:

> What is true now?

The transaction history answers:

> How did it become true?

Both are required.

---

# Server Authority Rule

The frontend is not the authority for inventory.

The server/database must validate:

- User identity
- Role
- Current pallet state
- Current quantity
- Hold state
- Shipping eligibility
- Location validity
- Adjustment status
- Idempotency
- Concurrency
- Authoritative piece calculations

The client may calculate previews for usability.

The server must independently calculate or verify the saved result.

Never move protected inventory logic into client-only code to make development easier.

---

# Atomic Write Rule

Important inventory changes must happen in one protected backend operation.

Preferred pattern:

```text
Client request
  -> authenticated server/database function
  -> validate current state
  -> insert transaction
  -> update pallet current state
  -> commit together
```

If any step fails, the operation must roll back.

Do not implement critical inventory changes as several unrelated client writes.

---

# Concurrency Rule

Assume two workers can act on the same pallet at nearly the same time.

Every inventory-changing operation must protect against stale state.

Example:

- Worker A sees 25 boxes.
- Worker B sees 25 boxes.
- Worker A pulls 10.
- Current inventory becomes 15.
- Worker B attempts to pull 20.

The backend must reject Worker B's stale request.

Never trust the quantity shown on the worker's old screen.

---

# Idempotency Rule

Important write operations should use idempotency protection.

This includes:

- Create pallet
- Store
- Pull
- Move
- Adjustment approval
- Hold/release
- Ship

Poor Wi-Fi, browser retries, or double taps must not create duplicate inventory changes.

---

# Adjustment Rule

Workers do not directly overwrite inventory after a mismatched count.

Correct flow:

```text
Count mismatch
  -> adjustment request
  -> supervisor review
  -> approve or reject
```

Inventory changes only after valid supervisor approval.

Do not bypass this flow.

---

# Hold Rule

A pallet on hold must not:

- Appear as normal FIFO inventory
- Be pulled through normal shipping workflow
- Be shipped

Hold enforcement must exist server-side.

UI warnings alone are not enough.

---

# Packing Snapshot Rule

When a pallet is created, preserve the packing values used at creation.

Example:

- pieces per box
- boxes per full pallet
- estimated box weight

Do not recalculate old pallet history using the current master packing spec.

Historical pallet math must remain stable even if packing standards change later.

---

# QR Rule

QR codes identify objects.

They do not perform destructive actions.

Pallet QR example:

`MM-P-0004821`

Location QR example:

`B-003-AC`

Do not encode mutable inventory data, credentials, privileged URLs, or secrets in QR codes.

Scan first.

Show what was scanned.

Require confirmation before inventory changes.

---

# Preferred Technology

Unless the product requirements change, use:

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zod
- Supabase
- PostgreSQL
- Supabase Auth
- PostgreSQL functions / Supabase RPC
- Vitest
- React Testing Library
- Playwright for end-to-end tests

Do not introduce another framework or backend service without a clear need.

---

# Repository Organization

Preferred structure:

```text
src/
├── app/
├── features/
├── components/
├── domain/
├── lib/
├── hooks/
└── types/

supabase/
├── migrations/
├── seed.sql
└── functions/

docs/
├── PRODUCT.md
├── WORKFLOW.md
├── DATA-MODEL.md
├── ARCHITECTURE.md
├── TESTING.md
└── decisions/
```

Feature-specific code should live close to the feature.

Do not dump unrelated logic into generic `utils` files.

---

# TypeScript Rules

Follow `TYPESCRIPT_ENGINEERING_STANDARD.md`.

Key requirements:

- Strict TypeScript
- Avoid `any`
- Validate unknown input
- Prefer explicit domain types
- Keep business logic outside JSX
- Keep Supabase access centralized
- Use pure functions for calculations
- Use worker-readable domain errors
- Remove dead code
- Keep functions understandable

Do not weaken type safety to make generated code compile.

---

# Security Rules

Follow `SECURITY.md`.

Never:

- Disable RLS to fix an application bug
- Put service-role secrets in frontend code
- Commit `.env`
- Commit tokens or passwords
- Trust client-supplied role information
- Make transaction history editable
- Expose raw technical errors to workers
- Bypass authorization for demos

If security rules appear inconvenient, fix the implementation instead of weakening the rule.

---

# Database Migration Rules

All schema changes must be represented as migrations.

Do not manually change the remote database without recording the change in the repository.

Each migration should:

- Be narrowly scoped
- Have a clear purpose
- Preserve existing data when applicable
- Add constraints where business rules require them
- Be safe to apply predictably

When adding or changing a database function, update tests and documentation if behavior changes.

---

# Row Level Security Rules

Enable RLS on application tables.

Worker and supervisor permissions must be enforced through database policy and protected operations.

Do not assume hiding UI is authorization.

When adding a table, decide explicitly:

- Who can read it?
- Who can insert?
- Who can update?
- Who can delete?
- Should writes happen only through RPC?

Document unusual decisions.

---

# Testing Before Completion

A task is not done just because the screen works.

Run relevant checks.

Expected project commands should eventually include:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

If the repository does not yet have one of these scripts, do not invent a successful result.

State what was actually run.

Critical inventory changes require tests.

Bug fixes should include regression coverage when practical.

---

# Required End-to-End Flows

Do not consider V1 complete until these work:

## Create and Store

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

## Find and Pull

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

## Count and Adjust

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

## Move

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

# Development Mission Rule

Work in small missions.

Preferred pattern:

1. Read the relevant docs.
2. Restate the task internally.
3. Inspect the existing implementation.
4. Make the smallest coherent change.
5. Add/update tests.
6. Run checks.
7. Review the diff.
8. Report exactly what changed.

Do not build three future missions while assigned one.

Do not opportunistically redesign unrelated features.

---

# Before Editing Code

Before making meaningful changes:

- Read the relevant documentation.
- Inspect existing code and tests.
- Check whether a similar pattern already exists.
- Identify affected security and data rules.
- Avoid creating duplicate abstractions.

Do not assume the repository is empty or outdated.

---

# Before Adding a Dependency

Ask:

1. Is this requirement real?
2. Can existing dependencies solve it?
3. Is the package actively maintained?
4. Does it support TypeScript well?
5. Is the license acceptable?
6. Does the benefit justify the maintenance cost?

Avoid dependency sprawl.

---

# Error Message Rule

Workers should receive plain-language errors.

Examples:

Preferred:

```text
QUANTITY TOO HIGH

Requested: 50 boxes
Available: 48 boxes
```

Avoid:

```text
PostgrestError 23514 check constraint violation
```

Technical details belong in secure logs.

---

# Code Comment Rule

Comments should explain why.

Do not narrate obvious syntax.

Good:

```ts
// Use the pallet snapshot so historical quantities remain correct
// if the master packing specification changes later.
```

Bad:

```ts
// multiply boxes by pieces
```

---

# Documentation Rule

When behavior changes, update the relevant documentation.

Examples:

- Product behavior -> `docs/PRODUCT.md`
- Worker flow -> `docs/WORKFLOW.md`
- Data shape -> `docs/DATA-MODEL.md`
- Technical structure -> `docs/ARCHITECTURE.md`
- Security behavior -> `SECURITY.md`
- Testing expectations -> `docs/TESTING.md`
- Engineering conventions -> `TYPESCRIPT_ENGINEERING_STANDARD.md`

Do not let documentation drift from the implementation.

---

# Architecture Decision Records

Use `docs/decisions/` for meaningful decisions.

Create an ADR when a decision:

- Changes architecture
- Introduces a major dependency
- Changes inventory modeling
- Changes authentication/authorization approach
- Changes offline behavior
- Changes the primary technology stack

Keep ADRs short.

Include:

- Context
- Decision
- Reason
- Tradeoffs
- Consequences

Do not create ADRs for trivial implementation details.

---

# Git and Commit Rules

Keep commits focused.

Use clear messages such as:

```text
feat: add pallet creation flow
feat: add location storage transaction
fix: prevent duplicate box pull
test: cover stale pull rejection
docs: document hold behavior
```

Avoid vague messages such as:

```text
update
stuff
changes
fix
```

Before finishing a task, inspect the diff.

Do not commit secrets, generated junk, or unrelated files.

---

# Definition of Done

A task is complete when:

- The requested behavior works.
- The change follows documented product rules.
- Security rules are preserved.
- Type checking passes.
- Relevant tests pass.
- Loading states exist where needed.
- Error states exist where needed.
- Mobile behavior is checked.
- Inventory-changing writes remain server-authoritative.
- Transaction history remains correct.
- No real proprietary data is introduced.
- Documentation is updated if behavior changed.
- No unrelated changes are bundled in.

---

# Stop Conditions

Stop and ask for clarification instead of guessing when:

- Product docs conflict materially.
- A task would require real proprietary data.
- A requested feature breaks a documented security rule.
- A schema change would destroy or rewrite historical traceability.
- A task expands V1 into a major new product area.
- The required behavior cannot be implemented safely with the current architecture.
- A destructive production action is unclear.

Do not hide uncertainty behind generated code.

---

# Final Agent Rule

Build software that a tired worker can use and a careful developer can trust.

Keep the interface simple.

Keep the data model explicit.

Keep inventory changes atomic.

Keep history immutable.

Keep security server-side.

Keep the scope small.

Do not confuse more code with a better product.
