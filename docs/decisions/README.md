# Architecture Decision Records

## Purpose

This folder stores short Architecture Decision Records (ADRs) for Mimir Metals Finished Goods Inventory.

Use an ADR when the project makes a meaningful technical or product-architecture decision that future contributors may need to understand later.

The goal is simple:

> Record why an important decision was made so we do not have to rediscover the reasoning six months from now.

ADRs should be short, practical, and easy to read.

---

# When to Create an ADR

Create an ADR when a decision materially affects:

- Architecture
- Security
- Data modeling
- Inventory integrity
- Authentication or authorization
- Offline behavior
- Major dependencies
- Core product workflow
- Deployment approach
- Long-term maintainability

Examples:

- Why pallet-level tracking instead of box-level tracking?
- Why transaction-based inventory?
- Why React + TypeScript + Vite?
- Why Supabase?
- Why a PWA instead of native mobile apps?
- Why QR codes contain only stable identifiers?
- Why V1 does not allow offline inventory writes?
- Why workers cannot directly adjust inventory?
- Why packing values are snapshotted onto pallets?
- Why FIFO is advisory rather than automatic allocation?

---

# When NOT to Create an ADR

Do not create ADRs for minor implementation details.

Examples that usually do not need an ADR:

- Renaming a button
- Moving a component to another folder
- Changing spacing or colors
- Replacing one small helper function
- Minor refactors
- Routine bug fixes
- Adding a test case

Use judgment.

The decision should be important enough that someone could reasonably ask later:

> Why did we build it this way?

---

# File Naming

Use this format:

```text
0001-short-decision-name.md
0002-next-decision.md
0003-another-decision.md
```

Examples:

```text
0001-pallet-level-inventory.md
0002-transaction-based-inventory.md
0003-pwa-over-native-mobile.md
0004-supabase-backend.md
0005-no-offline-writes-v1.md
```

Use sequential numbering.

Do not reuse ADR numbers.

---

# ADR Status

Each ADR should have one status.

Allowed values:

- Proposed
- Accepted
- Superseded
- Deprecated

Most committed architectural decisions should be:

`Accepted`

If a later ADR replaces an older one, mark the old ADR:

`Superseded`

and link to the new decision.

---

# ADR Template

Copy this template for new decisions:

```md
# ADR-XXXX: Decision Title

## Status

Accepted

## Date

YYYY-MM-DD

## Context

What problem or decision are we facing?

What constraints matter?

Why does this decision need to be made?

## Decision

What are we choosing?

State the decision clearly and directly.

## Reason

Why is this the best choice for this project right now?

## Tradeoffs

What are we giving up?

What alternatives did we consider?

## Consequences

What does this decision mean for:

- The worker experience
- The codebase
- The database
- Security
- Testing
- Future development

## Revisit When

What future condition would justify reconsidering this decision?
```

---

# Writing Style

ADRs should be:

- Short
- Plain English
- Specific
- Honest about tradeoffs
- Focused on one decision

Do not write an essay.

Do not use vague language like:

> This technology is modern and powerful.

Instead write:

> We chose Vite because V1 is an authenticated client application and does not require server rendering or SEO.

---

# Decision Rules

An ADR should describe the decision that actually exists in the project.

Do not create ADRs for hypothetical future features.

Do not record a decision as accepted before the project has actually chosen it.

If the decision changes later, do not silently rewrite history.

Create a new ADR and supersede the old one.

---

# Source-of-Truth Relationship

ADRs explain why decisions were made.

They do not replace the project documentation.

Current behavior still belongs in:

- `docs/PRODUCT.md`
- `docs/WORKFLOW.md`
- `docs/DATA-MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `SECURITY.md`
- `TYPESCRIPT_ENGINEERING_STANDARD.md`

If an ADR changes current architecture or behavior, update the relevant documentation too.

---

# Initial ADR Candidates

The first useful ADRs for this project will likely be:

1. Pallet-level inventory instead of individual box tracking
2. Transaction-based inventory with current-state snapshots
3. PWA instead of native mobile applications
4. Supabase/PostgreSQL backend
5. No offline inventory writes in V1
6. Packing specification snapshots on each pallet
7. Server-authoritative inventory mutations
8. FIFO as a recommendation instead of automatic allocation

Create these only when needed.

Do not generate all of them just to fill the folder.

---

# Final Rule

Use ADRs to preserve reasoning, not bureaucracy.

If a decision is important enough that forgetting the reason could cause future rework, write it down.
