# Mimir Metals Finished Goods Inventory — Security

## Purpose

This document defines the security rules for Mimir Metals Finished Goods Inventory V1.

The system tracks finished-goods inventory, pallet movement, shipping pulls, physical counts, supervisor approvals, and transaction history.

The security goal is not to create an enterprise security program for V1.

The goal is to make sure the application:

- Protects inventory integrity
- Protects user accounts
- Keeps secrets out of the codebase
- Enforces worker and supervisor permissions
- Prevents unauthorized inventory changes
- Preserves the audit trail
- Uses fictional demo data only
- Fails safely when something goes wrong

---

# Security Principles

## 1. Never Trust the Client

The browser is not a trusted authority.

The frontend may:

- Display data
- Collect input
- Calculate previews
- Show role-based controls

The frontend must NOT be trusted to decide:

- Whether a user is authorized
- Whether a quantity is valid
- Whether an adjustment can be approved
- Whether a pallet can be shipped
- Whether a location is valid
- Whether a transaction is duplicated
- Whether stale inventory data is still current

All sensitive rules must be enforced server-side.

---

## 2. Protect Inventory Integrity First

The most important asset in this application is accurate inventory state.

A security bug that allows unauthorized or duplicated inventory changes is a serious failure.

Protected operations include:

- Create pallet
- Store pallet
- Pull boxes
- Move pallet
- Count inventory
- Approve adjustment
- Reject adjustment
- Place hold
- Release hold
- Stage for shipping
- Ship pallet

These actions must use protected server-side database functions or equivalent secure backend operations.

---

## 3. Preserve the Audit Trail

Inventory history is append-only for normal users.

Existing inventory transactions must not be editable or deletable through the application.

Corrections must create new transactions.

Example:

Bad:

```text
Change old transaction from -6 boxes to -4 boxes
```

Correct:

```text
Original transaction remains
New correcting transaction is added
```

This protects traceability.

---

# Data Classification

V1 should treat data in three practical categories.

## Public / Low Sensitivity

Examples:

- Fictional demo part descriptions
- Fictional rack locations
- Generic product documentation
- Public README content

---

## Internal Application Data

Examples:

- Pallet IDs
- Heat numbers
- Lot numbers
- Inventory quantities
- PO references
- BOL references
- User display names
- Transaction history
- Adjustment reasons

This data should only be available to authenticated users unless the deployment is intentionally configured as a public fictional demo.

---

## Secrets

Examples:

- Supabase service-role key
- Database passwords
- Private API tokens
- Deployment tokens
- Private signing keys

Secrets must never be exposed to the browser or committed to GitHub.

---

# Demo Data Rule

The repository and default demo deployment must use fictional Mimir Metals data only.

Do not include:

- Real employer data
- Real customer data
- Real production quantities
- Real proprietary part numbers
- Real heat numbers
- Real lot numbers
- Real PO numbers
- Real BOL numbers
- Real machine production records
- Real internal business documents

If real customer data is ever added in the future, it must be done intentionally under a separate customer-specific security and data-handling plan.

---

# Authentication

Supabase Auth will manage user authentication.

V1 roles:

- `worker`
- `supervisor`

Authentication credentials should be handled only through the authentication provider.

Do not create custom password storage.

Do not store plaintext passwords.

Do not log passwords.

---

# Authorization

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

The app must enforce both.

## Worker Permissions

Workers may:

- Read active parts
- Read packing specifications
- Read pallet inventory
- Read rack locations
- Read transaction history
- Create pallets
- Store pallets
- Pull boxes
- Move pallets
- Record physical counts
- Submit adjustment requests

Workers may not:

- Approve adjustments
- Reject adjustments
- Place holds
- Release holds
- Directly edit protected pallet quantities
- Delete transaction history

---

## Supervisor Permissions

Supervisors may do everything a worker can do.

Supervisors may additionally:

- Approve adjustment requests
- Reject adjustment requests
- Place pallets on hold
- Release pallets from hold

Supervisor authorization must be checked server-side.

Hiding a button in the UI is not sufficient.

---

# Supabase Row Level Security

Row Level Security should be enabled for application tables.

At minimum:

- `profiles`
- `parts`
- `packing_specs`
- `locations`
- `pallets`
- `inventory_transactions`
- `adjustment_requests`

RLS policies should follow least privilege.

The frontend should only be able to perform the minimum direct operations needed.

Sensitive inventory mutations should preferably happen through protected database functions rather than open table updates.

---

# Protected Database Functions

Important write operations should use server-side functions.

Examples:

```text
create_pallet(...)
store_pallet(...)
pull_boxes(...)
move_pallet(...)
count_pallet(...)
approve_adjustment(...)
reject_adjustment(...)
place_hold(...)
release_hold(...)
stage_pallet_for_shipping(...)
ship_pallet(...)
```

Each function should:

1. Identify the authenticated user.
2. Verify the user's role.
3. Validate all inputs.
4. Load current server state.
5. Check current pallet status.
6. Check current quantity.
7. Check location validity when relevant.
8. Prevent stale updates.
9. Prevent duplicate submission.
10. Insert the audit transaction.
11. Update current pallet state.
12. Commit atomically.

---

# Service-Role Key Rule

The Supabase service-role key must NEVER be included in frontend code.

Never place it in:

- `src/`
- Browser JavaScript
- Vite public environment variables
- Client bundles
- QR data
- Public documentation
- Screenshots
- Demo videos

The service-role key bypasses normal Row Level Security and must be treated as highly privileged.

If privileged server-side code ever needs it, keep it in a protected server environment only.

---

# Environment Variables

Use environment variables for deployment-specific configuration.

Example browser-safe values:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not commit real values to GitHub.

Use:

`.env.example`

to document required variables without including secrets.

The actual environment file should be ignored by Git.

---

# Git Rules

Never commit:

- `.env`
- Secrets
- API keys
- Database passwords
- Service-role keys
- Private certificates
- Access tokens
- Customer exports
- Real production data
- Debug dumps containing sensitive information

Before pushing changes, review:

```text
git status
git diff
```

If a secret is accidentally committed, deleting the file later is not enough.

The secret must be rotated.

---

# Input Validation

All external input must be validated.

Examples:

- Pallet codes
- Part numbers
- Location codes
- Box quantities
- Heat numbers
- Lot numbers
- PO references
- BOL references
- Adjustment reasons
- Free-text notes

Client-side validation is for usability.

Server-side validation is required for security and integrity.

---

# Quantity Security

Never trust quantity calculations submitted by the client.

Example:

Client requests:

`pull 6 boxes`

The server should calculate:

```text
6 × pieces_per_box_snapshot
```

The client should not be allowed to submit an arbitrary piece quantity such as:

`remove 999999 pieces`

The server owns the calculation.

---

# Stale Update Protection

The application must protect against outdated client state.

Example:

Worker A sees 25 boxes.

Worker B also sees 25 boxes.

Worker A removes 10.

Current balance becomes 15.

Worker B tries to remove 20 based on the old screen.

The backend must reject the second operation.

Use database transactions, row locking, conditional updates, or equivalent safe concurrency control.

---

# Duplicate Submission Protection

Important write operations should support idempotency keys.

This prevents accidental duplicate actions caused by:

- Double tapping
- Poor Wi-Fi
- Browser retries
- Repeated submit attempts

If the same request is retried with the same idempotency key, the server should return the existing result rather than apply the inventory change again.

---

# QR Security

QR codes should contain stable identifiers only.

## Pallet QR

Example:

`MM-P-0004821`

## Location QR

Example:

`B-003-AC`

Do not embed:

- Credentials
- Tokens
- Secrets
- Full inventory records
- Authorization information
- Internal database UUIDs unless necessary
- URLs containing privileged actions

Scanning a QR should identify an object.

Scanning alone must not perform a destructive action.

A worker should always review and confirm before inventory changes.

---

# URL and Route Security

Do not assume a route is protected simply because it is hidden from navigation.

Example:

`/adjustments`

If only supervisors should approve adjustments, the backend must reject unauthorized approval attempts even if a worker manually enters the route.

Client-side routing is not an authorization boundary.

---

# Count Security

Mission 9 Count uses an authenticated-only protected RPC. Workers may report
observed boxes and create a pending adjustment request, but cannot directly
insert protected request/history rows, update pallet quantities, or set review
fields. The server derives actor and pieces, checks active role and reviewed
state after locking the pallet, and preserves the current inventory on every
Count outcome. Mission 10 adds separate supervisor-only decision RPCs.

---

# Adjustment Security

Inventory adjustment approval is a privileged action.

The server must verify:

- Adjustment exists
- Adjustment is still pending
- Current user has supervisor authorization
- Pallet still exists
- Current inventory has not changed in a way that invalidates the request
- Resulting quantity is valid

Mission 10 requires `auth.uid()` to resolve to an active supervisor inside each
protected decision RPC. The Count requester cannot approve their own request.
Rejection requires a supervisor reason. Both RPCs use an empty `search_path`,
explicit authenticated-only EXECUTE grants, unique decision retry keys, and
the pallet-before-request lock order. Browser roles cannot directly update
pallet quantities or request review fields or insert decision events.

Approval checks the count-time pallet version, quantity, rack, lifecycle,
pre-hold context, packing-snapshot math, and linked Count evidence after
locking. Any intervening pallet update, including a move away and back or a
hold/release cycle, makes a request stale. Pre-Mission-10 pending requests have
no trustworthy historical version and cannot be approved. Approval of a
zero-box result is forbidden with `ZERO BALANCE NOT SUPPORTED`; the request and
inventory remain unchanged so the supervisor can reject/recount. Held pallet
approval preserves its hold and rack. Exact retries return one saved result;
unknown network outcomes must retry the same frozen key rather than make a
second decision.

The existing adjustment-request SELECT policy remains in place: a worker can
read their own requests, while active supervisors can read all. The supervisor
queue checks role before querying; that UI check does not replace RLS or the
RPC authorization boundary.

If current state changed after the count, require review or recount rather than applying stale numbers.

---

# Hold Security

A pallet on hold must not be shipped or included in normal FIFO pulls.

The backend must enforce this.

The UI should also show the hold clearly.

Hold placement and release should be recorded as transactions.

---

# Shipping Security

Mission 11 staging and dispatch use protected authenticated-only RPCs with an
empty fixed search path, fully qualified tables, and actors from `auth.uid()`.
An active worker or supervisor is required. Browser roles have no direct
pallet-update or transaction-insert privilege. Each RPC locks the pallet and
checks reviewed version, quantity, lifecycle, and location. Held or shipped
pallets cannot be staged or dispatched again. Exact retries return the original
saved event; a changed payload or actor cannot claim its key. Dispatch and
immutable shipment history commit or roll back together. No offline shipping
write is queued.

Shipping operations should verify:

- Pallet exists
- Pallet has available inventory
- Pallet is not already shipped
- Pallet is not on hold
- Quantity requested is valid
- PO/BOL references are valid text if supplied
- Transaction succeeds atomically

---

# Error Handling

Do not expose raw technical errors to workers.

Bad:

```text
PostgrestException: duplicate key violates unique constraint...
```

Good:

```text
THIS ACTION MAY ALREADY BE SAVED

Check pallet history before retrying.
```

Technical details may be logged securely for development.

Worker-facing errors should be plain language.

---

# Logging Rules

Do not log:

- Passwords
- Access tokens
- Refresh tokens
- Service-role keys
- Full authorization headers
- Sensitive environment variables

Business audit events belong in:

`inventory_transactions`

Technical logs should contain only what is needed for troubleshooting.

---

# Session Security

Use the authentication provider's normal secure session handling.

The application should:

- Require authentication for protected production views
- Log users out when the auth session becomes invalid
- Avoid manually storing auth tokens in insecure custom storage
- Avoid copying tokens into logs or URLs

---

# Browser Security

Because this is a browser-based PWA:

- Serve over HTTPS
- Do not disable browser security features
- Avoid unsafe inline script patterns where possible
- Sanitize or safely render user-entered text
- Do not render free-text notes as raw HTML

React's default text escaping should be preserved.

Do not use `dangerouslySetInnerHTML` for worker-entered content.

---

# Dependency Security

Dependencies should be:

- Actively maintained
- Necessary
- TypeScript-friendly where possible
- Reviewed before addition

Avoid installing multiple libraries that solve the same problem.

Run dependency vulnerability checks regularly.

Examples:

```text
npm audit
```

Do not automatically apply breaking security upgrades without testing.

---

# Package Lock Rule

Commit the package lock file.

For npm:

`package-lock.json`

This keeps dependency versions reproducible.

---

# File Uploads

V1 does not require file uploads.

Do not add file-upload capability without a clear product requirement.

If added later, define:

- Allowed file types
- Maximum size
- Storage location
- Malware handling
- Access control
- Retention rules

---

# Rate Limiting

V1 does not require complex public API rate limiting.

However, sensitive operations should not be designed in a way that allows uncontrolled repeated writes.

Idempotency, authentication, and server-side validation are required from the beginning.

Additional rate limiting may be added if the app becomes publicly exposed or abused.

---

# Data Retention

V1 should preserve:

- Pallets
- Inventory transactions
- Adjustment requests
- Historical part references
- Historical location references

Normal users should not delete historical records.

If data-retention requirements change later, deletion or archival rules should be implemented intentionally.

---

# Database Backups

For a real deployment, database backup and recovery must be considered part of operations.

At minimum:

- Use Supabase backup capabilities appropriate to the deployment tier.
- Know how to restore data.
- Do not assume audit history is safe just because it is in PostgreSQL.

A demo deployment may use simpler backup expectations, but a customer production deployment should have a documented backup plan.

---

# Production vs Demo Environments

Keep demo and future customer production environments separate.

Do not:

- Reuse production credentials in development
- Point local development at a customer production database
- Mix fictional demo data with customer data
- Use customer secrets in screenshots or demos

---

# Public Demo Rule

If a public demo is deployed:

- Use fictional data only.
- Prefer demo-only accounts or limited access.
- Do not expose privileged supervisor functionality without protection.
- Do not expose real secrets.
- Do not let anonymous users mutate a shared inventory database unless intentionally sandboxed.

---

# Security Review Before Deployment

Before each production-style deployment, verify:

- RLS is enabled.
- Worker permissions are correct.
- Supervisor permissions are correct.
- Service-role key is not in the frontend.
- No secrets are committed.
- No real employer or customer data is present.
- Inventory mutations use protected functions.
- Duplicate submission protection works.
- Stale-update protection works.
- Hold restrictions work.
- Adjustment authorization works.
- Transaction history cannot be edited by normal users.
- HTTPS is enabled.
- Environment variables are configured correctly.

---

# Minimum Security Tests

V1 security testing must include at least:

1. Worker cannot approve an adjustment.
2. Worker cannot call supervisor-only operations directly.
3. Client cannot set arbitrary inventory quantities.
4. Pull cannot exceed available inventory.
5. Held pallet cannot be shipped.
6. Shipped pallet cannot be pulled again.
7. Duplicate idempotency key does not create a second transaction.
8. Stale concurrent update is rejected.
9. Invalid location cannot be used.
10. Transaction history cannot be edited by normal users.
11. Service-role key is absent from the frontend bundle.
12. Unauthenticated users cannot perform protected actions.

---

# Security Incident Rule

If a security issue is discovered:

1. Stop exposing the affected functionality if necessary.
2. Identify what data or capability was affected.
3. Rotate compromised credentials immediately.
4. Preserve logs and audit information.
5. Fix the root cause.
6. Test the fix.
7. Document the incident and decision.

Do not hide security failures by deleting history.

---

# Responsible Disclosure

If this repository becomes public and the application is used outside a private demo environment, add a responsible disclosure contact.

Suggested future wording:

> Please do not open public issues for vulnerabilities that expose sensitive information. Contact the project maintainer privately.

Do not publish sensitive reproduction details before a fix is available.

---

# Security Boundaries

The V1 application is not designed to provide:

- Payment processing
- Financial-account storage
- Medical-data storage
- Government-classified data handling
- Enterprise identity management
- Full SIEM capability
- Zero-trust network architecture
- Device management

Do not claim security capabilities the product does not provide.

---

# Final Security Rule

The UI may be simple.

The security rules may not be.

For every protected action, the system must be able to answer:

- Who is making this request?
- Are they allowed to do it?
- Is the current data still valid?
- Is the requested change valid?
- Has this request already been applied?
- Will the audit trail remain intact?

If those questions are not answered server-side, the operation is not secure enough for V1.
