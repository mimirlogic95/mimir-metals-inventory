# Mimir Metals Finished Goods Inventory — TypeScript Engineering Standard

## Purpose

This document defines the TypeScript engineering rules for Mimir Metals Finished Goods Inventory.

The goal is to keep the codebase:

- Understandable
- Predictable
- Maintainable
- Safe
- Easy to review
- Friendly to future contributors
- Resistant to AI-generated code sprawl

This is not a style guide for style's sake.

These rules exist to protect the product from becoming difficult to reason about as features are added.

---

# Core Engineering Principles

## 1. Prefer Clarity Over Cleverness

Code should be obvious to a competent developer reading it later.

Prefer:

```ts
const remainingBoxes = currentBoxes - boxesToPull;
```

over unnecessarily abstract or compressed logic.

Do not optimize for fewer lines.

Optimize for:

- Readability
- Correctness
- Testability
- Explicit business rules

---

## 2. Strict TypeScript Is Required

Use TypeScript strict mode.

The project should enable:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Do not weaken compiler settings to silence errors.

Fix the type problem instead.

---

## 3. Avoid `any`

Do not use `any` unless there is a documented, unavoidable reason.

Prefer:

- Explicit interfaces
- Type aliases
- Generics
- `unknown`
- Runtime validation

Bad:

```ts
function handlePallet(data: any) {}
```

Better:

```ts
function handlePallet(data: Pallet) {}
```

If input is untrusted:

```ts
function parsePallet(data: unknown): Pallet {}
```

---

## 4. Untrusted Data Must Be Validated

TypeScript types do not validate runtime data.

Anything coming from:

- Supabase
- URL parameters
- QR scans
- Forms
- local storage
- external APIs
- user input

must be treated as untrusted until validated.

Use Zod where appropriate.

Example:

```ts
const palletCodeSchema = z
  .string()
  .regex(/^MM-P-\d{7}$/);
```

---

## 5. Business Rules Must Not Live Only in UI Components

React components should not become the only place where inventory logic exists.

Bad:

```ts
if (boxes < fullPalletBoxes) {
  badge = "PARTIAL";
}
```

embedded in many different components.

Better:

```ts
export function getPalletFillStatus(
  currentBoxes: number,
  fullPalletBoxes: number,
): PalletFillStatus {
  return currentBoxes >= fullPalletBoxes ? "full" : "partial";
}
```

Business logic should live in reusable domain functions.

---

# Naming Standards

## Variables and Functions

Use:

`camelCase`

Examples:

```ts
currentBoxes
palletCode
calculateRemainingPieces()
submitAdjustment()
```

---

## Components and Types

Use:

`PascalCase`

Examples:

```ts
PalletCard
ScanPanel
InventoryTransaction
AdjustmentRequest
```

---

## Constants

Use descriptive names.

For true constants:

```ts
const MAX_NOTE_LENGTH = 500;
```

Do not use unexplained magic numbers.

Bad:

```ts
if (note.length > 500) {}
```

Better:

```ts
if (note.length > MAX_NOTE_LENGTH) {}
```

---

## Boolean Names

Boolean names should read clearly as true or false.

Prefer:

```ts
isOnHold
isLoading
hasPermission
canApprove
shouldRetry
```

Avoid vague names such as:

```ts
status
flag
enabledThing
```

---

# File Naming

React components:

```text
PalletCard.tsx
PullReview.tsx
ScanPanel.tsx
```

Domain and utility files:

```text
pallet.ts
inventory.ts
formatQuantity.ts
```

Schemas:

```text
createPallet.schema.ts
pullBoxes.schema.ts
```

API/data-access files:

```text
pallet.api.ts
inventory.api.ts
adjustments.api.ts
```

Tests:

```text
pallet.test.ts
PullBoxesPage.test.tsx
```

---

# React Component Rules

## Keep Components Focused

A component should have one clear responsibility.

Avoid giant components that handle:

- Data fetching
- Form validation
- Business logic
- Navigation
- QR scanning
- Rendering
- Error mapping

all in one file.

Break complex workflows into meaningful pieces.

---

## Prefer Composition

Build screens from smaller components.

Example:

```tsx
<PalletSummary />
<QuantityInput />
<ShippingReferenceFields />
<StickyActionBar />
```

Avoid deep inheritance or overly generic component systems.

---

## Keep Business Logic Outside JSX

Bad:

```tsx
{currentBoxes - pullBoxes < fullPalletBoxes &&
  currentBoxes - pullBoxes > 0 ? (
    <Badge>PARTIAL</Badge>
  ) : null}
```

Better:

```ts
const preview = calculatePullPreview(...);
```

Then:

```tsx
<Badge>{preview.fillStatus}</Badge>
```

---

## Do Not Store Derived State Unless Necessary

Bad:

```ts
const [currentBoxes, setCurrentBoxes] = useState(31);
const [currentPieces, setCurrentPieces] = useState(21700);
```

when pieces can be calculated directly.

Prefer:

```ts
const currentPieces = currentBoxes * piecesPerBox;
```

Avoid creating multiple sources of truth.

---

# Hooks

Custom hooks should represent reusable behavior, not arbitrary code extraction.

Good examples:

```ts
usePallet()
usePalletHistory()
useLocationSuggestions()
usePendingAdjustments()
```

Avoid hooks that hide large amounts of unrelated behavior.

---

# State Management

Use React local state for temporary UI state.

Examples:

- Current step
- Open dialog
- Scanner active
- Numeric input
- Temporary form values

Use TanStack Query for server state.

Examples:

- Pallet details
- Inventory search
- Locations
- Transaction history
- Adjustment requests

Do not copy server state into global state unless there is a specific need.

---

# Data Access Rules

Raw Supabase access should be centralized.

Avoid this pattern throughout random UI files:

```ts
supabase
  .from("pallets")
  .select("*");
```

Prefer dedicated data-access modules:

```ts
getPalletByCode()
searchInventory()
pullBoxes()
movePallet()
```

This makes database changes easier later.

---

# Database Types

Generate TypeScript database types from Supabase when practical.

Prefer typed database interactions.

Do not manually guess database row shapes in many files.

If generated types exist, treat them as infrastructure types.

Map them into domain types when the application benefits from cleaner naming or safer boundaries.

---

# Domain Types

Domain types should reflect the language used in the product.

Examples:

```ts
type PalletLifecycleStatus =
  | "created"
  | "stored"
  | "shipping_staging"
  | "on_hold"
  | "shipped";
```

```ts
type UserRole = "worker" | "supervisor";
```

Avoid generic strings when a finite union is known.

---

# Enums vs Union Types

Prefer string literal unions for most V1 domain values.

Example:

```ts
type AdjustmentStatus =
  | "pending"
  | "approved"
  | "rejected";
```

Use enums only when they provide a clear advantage.

---

# Null and Undefined

Be explicit.

Use:

- `null` when data is intentionally empty in persisted/database state.
- `undefined` when a value has not been provided in application code.

Do not casually mix both.

Example:

```ts
type Pallet = {
  currentLocationId: string | null;
};
```

---

# Functions

## Prefer Small Pure Functions for Calculations

Example:

```ts
export function calculatePieces(
  boxes: number,
  piecesPerBox: number,
): number {
  return boxes * piecesPerBox;
}
```

Pure functions are easier to test.

---

## Use Guard Clauses

Prefer:

```ts
if (!pallet) {
  throw new Error("Pallet not found");
}

if (pallet.isOnHold) {
  throw new Error("Pallet is on hold");
}
```

over deeply nested conditionals.

---

## Keep Function Parameters Understandable

Avoid functions with long positional argument lists.

Bad:

```ts
pullBoxes(id, 6, 4200, "PO1", "BOL1", userId, key);
```

Better:

```ts
pullBoxes({
  palletId,
  boxesToPull,
  poReference,
  bolReference,
  idempotencyKey,
});
```

---

# Error Handling

## Use Domain Errors

Technical errors should be translated into domain meaning.

Examples:

```ts
PalletNotFoundError
InsufficientInventoryError
PalletOnHoldError
LocationOccupiedError
UnauthorizedActionError
DuplicateTransactionError
```

The UI should not depend on raw database error strings.

---

## Do Not Swallow Errors

Bad:

```ts
try {
  await pullBoxes(...);
} catch {
  // ignore
}
```

Every error should be:

- Handled
- Shown appropriately
- Logged where useful
- Or rethrown

---

## Worker-Facing Messages

Keep technical errors away from floor users.

Bad:

```text
PostgrestError 23505
```

Good:

```text
THIS ACTION MAY ALREADY BE SAVED

Check pallet history before retrying.
```

---

# Async Code

Use `async/await` consistently.

Prefer:

```ts
const pallet = await getPalletByCode(code);
```

over unnecessary promise chains.

Do not start asynchronous work without handling:

- Loading state
- Success state
- Failure state

---

# Forms

Use React Hook Form when a form is complex enough to justify it.

Simple numeric inputs do not need a form framework automatically.

Use Zod schemas for shared validation.

Example:

```ts
const pullBoxesSchema = z.object({
  boxesToPull: z.number().int().positive(),
  poReference: z.string().trim().max(100).optional(),
  bolReference: z.string().trim().max(100).optional(),
});
```

---

# Numeric Rules

Inventory quantities are integers in V1.

Use integer types and validation for:

- Boxes
- Pieces

Weights may use decimals.

Never use floating-point arithmetic for countable inventory quantities.

---

# Date and Time Rules

Store timestamps as database `timestamptz`.

In TypeScript:

- Treat received timestamps as ISO strings or normalized Date objects.
- Format them only at the presentation layer.
- Do not invent client timestamps for authoritative inventory events.

Use database/server timestamps for transactions.

---

# QR Parsing

QR scan results are untrusted strings.

Validate before lookup.

Example:

```ts
const result = palletCodeSchema.safeParse(scannedValue);

if (!result.success) {
  return showInvalidPalletCode();
}
```

Do not execute actions directly from scanned text.

---

# Security-Sensitive Code

The following rules are mandatory:

- Never embed service-role secrets in frontend code.
- Never bypass authorization to make a demo work.
- Never trust role information only from UI state.
- Never use client-only validation for inventory writes.
- Never make audit history editable for convenience.
- Never disable Row Level Security to fix a frontend bug.

If a security rule blocks development, fix the architecture instead.

---

# Comments

Comments should explain why, not narrate obvious code.

Bad:

```ts
// subtract boxes
const remaining = current - pulled;
```

Good:

```ts
// Use the pallet's packing snapshot so historical pallets
// remain correct if the master packing spec changes later.
const piecesRemoved =
  boxesToPull * pallet.piecesPerBoxSnapshot;
```

---

# TODO Comments

TODOs must be actionable.

Good:

```ts
// TODO(v1-labels): add print-size calibration for 4x6 labels.
```

Bad:

```ts
// TODO fix later
```

Do not use TODOs to hide broken required behavior.

---

# Dead Code

Remove:

- Unused components
- Unused imports
- Old experiments
- Commented-out implementations
- Abandoned helper functions

Git already preserves history.

Do not turn source files into archives.

---

# Dependency Rules

Before adding a package, ask:

1. Do we already have a library that solves this?
2. Is the dependency actively maintained?
3. Does it support TypeScript well?
4. Is its license acceptable?
5. Is the dependency worth the maintenance cost?

Do not add packages for trivial functionality.

---

# Formatting and Linting

Use automated formatting and linting.

Recommended:

- ESLint
- Prettier

Formatting should not be debated manually.

The repository should have consistent scripts such as:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "format:check": "prettier --check ."
  }
}
```

Exact tooling may evolve, but equivalent checks should remain.

---

# Testing Expectations

Code that contains business logic should be testable.

At minimum, add tests for:

- Packing calculations
- Full/partial derivation
- Pull quantity validation
- FIFO selection
- Adjustment calculations
- Domain error mapping
- QR validation

Critical bug fixes should include a regression test when practical.

---

# Accessibility

Worker-first design does not mean accessibility can be ignored.

Use:

- Semantic buttons
- Visible focus states
- Labels for inputs
- Text plus color for statuses
- Adequate contrast
- Touch targets at least 44–48px

Do not rely on color alone.

Example:

Use:

`PARTIAL`

with amber styling.

Do not use only an amber dot.

---

# Mobile Rules

All new UI must be checked at phone width first.

Avoid:

- Horizontal scrolling
- Tiny tables
- Hover-only controls
- Hidden primary actions
- Desktop-first layouts

Primary actions should remain easy to reach.

---

# Feature Development Pattern

A typical new feature should follow this order:

1. Confirm product requirement.
2. Define domain behavior.
3. Define validation.
4. Define backend operation.
5. Define data-access function.
6. Build UI.
7. Add error states.
8. Add loading states.
9. Add tests.
10. Verify mobile behavior.

Do not begin with visual components before understanding the workflow.

---

# Change Scope

Keep pull requests and commits focused.

Avoid changing unrelated code while implementing a feature.

If unrelated cleanup is discovered:

- Fix it separately, or
- Document it for later.

Small changes are easier to review and safer to revert.

---

# Commit Expectations

Use clear commit messages.

Examples:

```text
feat: add pallet creation flow
feat: add FIFO inventory search
fix: prevent duplicate box pulls
test: cover adjustment approval
docs: update pallet workflow
```

Avoid:

```text
stuff
changes
fix things
update
```

---

# Generated Code

AI-generated code is not automatically accepted.

Every generated change must still satisfy:

- Type safety
- Product requirements
- Security rules
- Architecture rules
- Tests
- Readability

Do not keep code merely because an AI produced it quickly.

Generated code should be reviewed as if it came from an unfamiliar contributor.

---

# Refactoring Rule

Refactor when it improves:

- Clarity
- Testability
- Correctness
- Maintainability

Do not refactor working code only to make it look more sophisticated.

Do not introduce patterns before the codebase needs them.

---

# Performance

Optimize obvious floor-facing problems first.

Examples:

- Slow inventory search
- Slow scan confirmation
- Large unnecessary re-renders
- Repeated network requests

Do not prematurely optimize small pure calculations.

Correctness comes before micro-optimization.

---

# Logging in TypeScript

Do not leave uncontrolled `console.log` statements throughout production code.

Use structured logging where needed.

Never log:

- Auth tokens
- Secrets
- Passwords
- Full authorization headers
- Service-role keys

---

# Import Rules

Prefer stable import aliases once configured.

Example:

```ts
import { PalletCard } from "@/components/PalletCard";
```

instead of deep relative paths such as:

```ts
import { PalletCard } from "../../../../components/PalletCard";
```

Keep import structure simple.

---

# API Response Handling

Do not allow raw transport responses to leak throughout the UI.

Prefer:

```ts
const pallet = await getPalletByCode(code);
```

over components directly handling low-level response shapes.

Normalize data at the boundary.

---

# Future Python Rule

This project does not use Python as a primary language.

Do not add Python simply because another MimirLogic project uses it.

Python may be introduced later only for a clear need such as:

- Data migration
- Reporting
- ETL
- Specialized automation
- Manufacturing integration

If Python becomes a meaningful part of the repository, add a separate Python engineering standard at that time.

---

# Definition of Done for Code Changes

A code change is not complete until:

- It satisfies the product requirement.
- TypeScript passes strict type checking.
- Linting passes.
- Relevant tests pass.
- Error states are handled.
- Loading states are handled.
- Mobile layout works.
- Security rules are preserved.
- Inventory-changing operations remain server-authoritative.
- No secrets or real proprietary data are introduced.
- Dead/debug code is removed.
- Documentation is updated when behavior changes.

---

# Final Engineering Rule

Write code so the next developer can understand:

- What this does
- Why it exists
- What business rule it protects
- Where the authoritative data comes from
- What can safely change

The goal is not to produce the most advanced-looking code.

The goal is to produce boring, dependable software that workers can trust.
