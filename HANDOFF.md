# HANDOFF.md — Service Request App

**Purpose of this document:** You (the AI reading this) are being brought into an already-planned project with no prior memory of how we got here. This document gives you everything you need to act as a knowledgeable continuation of the project.

---

## 1. Who you're working with

A single non-technical/semi-technical developer, working solo, on a free-tier account with no coding-assistant tooling. All work happens through chat: write complete files, explain exactly where they go, provide exact commands to run, and wait for confirmation before proceeding to the next phase.

Do not assume continuity not documented here. `SPEC.md` is the single source of truth for product requirements, schema, roles, permissions, endpoints, and build order.

---

## 2. Project summary

A role-based, multi-unit service request / ticketing application.

- Units contain the fixed departments: IT, Maintenance, and Bio-Medical.
- Staff raise tickets.
- Team members claim and resolve tickets in their own department.
- Admins manage their own unit/department and oversee Team and Staff.
- Management has cross-unit, read-only dashboard and export access.
- Exactly one Super account has system-wide control.

Stack:

- Backend: Node.js and Express.
- Database: PostgreSQL.
- Migrations: Knex.
- Authentication: JWT and bcrypt.
- TOTP 2FA: `otplib` and `qrcode`.
- TOTP secret encryption: AES-256-GCM using Node.js `crypto`.
- Dashboard PDF export: `pdfkit`.
- Dashboard CSV export: `json2csv`.
- Frontend: React.
- Final deployment: Docker containers.

---

## 3. Current project status

---

## Current status — 2026-09-18: Phase 9 complete and public evaluation release

### Phase 9 status

Phase 9 Docker deployment, public-repository cleanup, and operational
documentation are complete and manually verified.

### Docker deployment

The root `docker-compose.yml` starts three services:

- `postgres` — PostgreSQL 16 Alpine.
- `backend` — Node.js 20 Alpine, Express, Knex migrations, and the internal
  auto-close scheduler.
- `frontend` — React/Vite production build served by Nginx.

Default host ports:

```text
Frontend: 8080
Backend: 30040
PostgreSQL: 30041
```

The backend waits for the PostgreSQL health check before starting.

The backend container runs:

```text
npm run migrate:latest
```

automatically through:

```text
backend/docker-entrypoint.sh
```

Migrations complete before `npm start` is executed. If migrations fail, the
backend does not start successfully.

### Clean-clone verification

A fresh clone from:

```text
[https://github.com/Bot-for-What/iuvo.git](https://github.com/Bot-for-What/iuvo.git)
```

was tested on 2026-09-18 using Docker Desktop Linux containers.

Verified:

- Docker images build successfully.
- PostgreSQL becomes healthy.
- Backend and frontend containers start.
- 13 Knex migrations run automatically.
- Backend starts after successful migrations.
- Auto-close scheduler starts.
- Backend health endpoint returns HTTP 200:
  ```text
  GET http://localhost:30040/health
  → {"status":"ok"}
  ```
- Frontend is exposed at:
  ```text
  http://localhost:8080
  ```
- Manual Super bootstrap command is available:
  ```text
  docker compose --env-file .env.docker exec -it backend npm run create-super
  ```
- Super password policy rejects passwords shorter than 12 characters.

### Database configuration

Docker Compose receives deployment values through the private:

```text
.env.docker
```

All documented Docker commands explicitly use:

```text
--env-file .env.docker
```

The repository contains only environment examples and no private environment
files or credentials.

A fresh database initializes using the values supplied in `.env.docker`.
Changing `DB_PASSWORD` after a PostgreSQL volume has already been initialized
does not change the existing database password. For disposable testing, the
volume may be removed and recreated. For real deployments, password changes
must be handled as a database credential rotation procedure.

### No demo-user policy

The repository intentionally contains:

- No default users.
- No default passwords.
- No Super credentials.
- No seed users.
- No demo tickets.
- No production data.
- No client-specific assets.

The only initial database records are the fixed global departments required by
the specification:

- IT.
- Maintenance.
- Bio-Medical.

The sole Super account is created interactively through the one-time bootstrap
CLI command. All ordinary users are created afterward through the application.

### Public repository cleanup

Client-specific assets were removed from the public repository.

The empty directory below is intentionally preserved with `.gitkeep`:

```text
frontend/public/client-assets/.gitkeep
```

The following client-specific assets are not present in `origin/main`:

```text
Guwahati Logo
NBWCCC
NBWCCCGW
X-NBWCCC
Ambuja Neotia
```

### Documentation completed

The public repository now includes:

```text
README.md
DEPLOYMENT.md
BACKUP-RESTORE.md
SECURITY.md
RECOVERY.md
LICENSE.md
```

The README identifies IUVO as an evaluation-only release.

The evaluation license permits demonstration, testing, education, and feedback,
but restricts sale, commercialization, hosting, sublicensing, and
redistribution without prior written permission.

### Current project status

The implementation and public evaluation release are complete.

Future work must be separately approved and must not silently change the locked
roles, permissions, ticket lifecycle, schema, or deployment policy.

---

## Current status — 2026-09-15: Atomic ticket-number allocation

### Completed and verified

The ticket-number race-condition correction is complete.

#### Database migration

- Added migration:
  - `backend/src/db/migrations/20260915120000_add_ticket_number_counters.js`
- Added the `ticket_number_counters` table.
- Counter scope is:
  ```text
  (unit_id, department_id)
  ```
- Existing ticket numbers were not changed.
- Existing counters were seeded above the highest valid numeric suffix for each unit/department scope.
- New scopes are initialized above any existing globally used number sharing the same normalized visible prefix.
- The existing global unique constraint on `tickets.ticket_number` remains in place.

#### Atomic allocation

- Replaced the old `COUNT(*) + 1` ticket-number generation.
- Ticket-number allocation now occurs inside the same transaction as ticket creation.
- Added transaction-scoped locking for safe first-use initialization and concurrent allocation.
- Added prefix-aware collision handling for globally unique visible ticket numbers.
- Allocation uses an explicitly bounded loop.
- Removed the old unbounded recursive `23505` retry from `createTicket()`.
- The load-test Staff fixture was intentionally not changed:
  - Staff creation uses `departmentId: staffDeptId`.
  - Ticket creation uses `departmentId: deptId`.
  - No `staffDepartmentId` field was added.

#### Manual verification

- Same-scope ticket creation produced:
  ```text
  MAINCAMP-BIOMEDIC-000018
  MAINCAMP-BIOMEDIC-000019
  ```
- The corresponding counter advanced to:
  ```text
  next_sequence = 20
  ```
- Prefix-collision testing confirmed that a new `LOADTEST-IT` scope does not restart at an already-used visible number.

#### Load-test verification

- 10 virtual users × 1 iteration:
  - 10 ticket creations.
  - 0 errors.
- 25 virtual users × 1 iteration:
  - 25 ticket creations.
  - 0 errors.
- 50 virtual users × 2 iterations:
  - 100 ticket creations.
  - 0 errors.
- 100 virtual users × 5 iterations:
  - 500 ticket creations.
  - 0 errors.
- Final 100-user run:
  - 1,600 total requests.
  - 0 total errors.
  - 61.8 requests/second.
- No duplicate ticket-number errors remained.
- No PostgreSQL `53300` connection-exhaustion errors occurred in the final run.

#### Final connection and security configuration

- Knex pool in development:
  ```text
  min: 5, max: 50
  ```
- Knex pool in production:
  ```text
  min: 5, max: 50
  ```
- Login rate limiter is enabled in:
  ```text
  backend/src/app.js
  ```
- The login limiter allows five failed attempts per ten-minute window and excludes successful requests from the failure count.
- The limiter must remain enabled for normal and production use.

#### Debug-log cleanup and smoke verification

- Removed temporary authentication, authorization, and ticket-route debug logging from:
  - `backend/src/app.js`
  - `backend/src/middleware/auth.middleware.js`
  - `backend/src/middleware/role.middleware.js`
  - `backend/src/routes/tickets.routes.js`
- Syntax checks passed for all four files:
  ```text
  node --check backend/src/app.js
  node --check backend/src/middleware/auth.middleware.js
  node --check backend/src/middleware/role.middleware.js
  node --check backend/src/routes/tickets.routes.js
  ```
- Backend health check passed:
  ```text
  GET /health → { "status": "ok" }
  ```

#### Manual-close route correction

The canonical manual-close endpoint is:

```text
POST /tickets/:id/close
```

The active router, controller, sanity tests, and current testing documentation use `POST`. Any older reference to:

```text
PATCH /tickets/:id/close
```

is a superseded historical note and must not be used for implementation or testing.

### Current known considerations

- Login p95 latency is high under heavy concurrency because of bcrypt CPU work.
- Ticket-list p95 latency increases under heavy concurrency because of joined queries.
- The current performance target is moderate internal concurrency.
- Additional indexes, caching, or password-hashing changes should be separately evaluated if the system must support substantially higher concurrency.
- Sanity and load tests create disposable data and should run only against development, staging, or ephemeral databases.

### Current next work

- Complete the remaining pre-Phase 9 Admin Work Queue ordering verification:
  - Needs assignment oldest-first ordering.
  - My active work oldest-first ordering.
  - Category counts matching displayed lists.
- Then continue the approved Phase 9 Docker setup work:
  - Backend Dockerfile.
  - Frontend Dockerfile.
  - Root-level `docker-compose.yml`.
  - Seed data workflow.
  - Container deployment documentation.

---

## Current status — 2026-09-10 (post–sanity tests and load testing)

### Completed and verified

- **Manual close by ticket raiser**
  - Endpoint: `POST /tickets/:id/close`.
  - Allows the original ticket raiser or Super to manually close a resolved ticket before the 48-hour auto-close window.
  - Writes a `closed` event with the authenticated actor ID.
  - Verified by sanity tests E1, E3, E4, E5.

- **Resolution remarks and repair cost audit trail**
  - Each `status_change` event to `resolved` now stores its own `resolution_remarks` and `repair_cost` in `ticket_events`.
  - Ticket detail shows the latest resolution values; audit history preserves all historical resolution events.
  - Verified by sanity tests F1–F7.

- **Ticket-number generation under concurrent load**
  - Superseded on 2026-09-15 by the atomic per-unit/per-department counter implementation documented above.
  - The old recursive retry approach is no longer active.

- **Connection pool tuning**
  - Knex pool increased to `min: 5, max: 50` in `knexfile.js`.
  - Improves concurrency without requiring schema changes.

- **Test coverage**
  - Sanity tests: `backend/sanity-tests-v3.js` — 47 tests covering auth, staff departments, ticket lifecycle, resolution fields, manual close, messaging, dashboard, and security access. All passing.
  - Load tests: `backend/load-test.js` — concurrent virtual users performing realistic workflows. Acceptable performance up to 100 concurrent users with the tuned pool.

### Known follow-up before production deployment

- **Login rate limiter**
  - The rate limiter is now enabled in `backend/src/app.js`.
  - It must remain enabled for normal and production use.

- **Performance at scale**
  - At 100 concurrent users:
    - Login p95 latency approaches ~19s (bcrypt wall).
    - Ticket list p95 latency approaches ~11–12s (complex joins under load).
  - For sustained loads above ~100 concurrent users, consider:
    - Adding indexes on `tickets(unit_id, department_id, status)`, `tickets(raised_by)`, `tickets(assigned_to)`.
    - Caching frequently accessed data.
    - Tuning bcrypt rounds or migrating to a faster password hash (e.g., argon2) if login latency becomes operationally problematic.

- **Test data cleanup**
  - Both sanity tests and load tests create disposable test data (units, users, tickets) prefixed with `sanity_` and `loadtest_`.
  - These should be cleaned from production or staging databases after testing, or tests should be run against ephemeral databases.

### How to run tests

From the `backend/` directory:

powershell
# Sanity tests (must all pass)
$env:BASE_URL="http://localhost:30040"
$env:SUPER_USERNAME="your_super_username"
$env:SUPER_PASSWORD="your_super_password"
node sanity-tests-v3.js

# Load tests (run against dev/staging, not production)
$env:BASE_URL="http://localhost:30040"
$env:SUPER_USERNAME="your_super_username"
$env:SUPER_PASSWORD="your_super_password"
$env:VIRTUAL_USERS="50"   # or 100
$env:ITERATIONS="5"
node load-test.js


Expected outcomes:
- Sanity tests: `47 passed, 0 failed`.
- Load tests (50 users, pool max 50): ≤1% errors, p95 latencies within operational tolerance for your environment.

---

# IUVO Handoff



### Visual Refinements and Audit Trail — 2026-09-08

**Status:** Complete and verified.

#### Visual Enhancements
- Message bubbles with light blue borders and role-based background tints
- Smaller, grayer message timestamps
- Pink per-ticket unread dot with blurred glow
- Pink sidebar unread badge with exclamation mark
- Increased ticket list height to show more tickets (1111px max-height)

#### Backend Fixes
- Audit trail for resolution fields: `resolution_remarks` and `repair_cost` now stored in `ticket_events` table
- Route ordering fixed in `tickets.routes.js` (message routes before `/:id` routes)
- Vite proxy configured to strip `/api` prefix
- Duplicate 404 handler removed from `app.js`
- Duplicate function definitions removed from `tickets.controller.js`

#### Verification Status
- ✅ Sidebar unread badge working (fetches `/api/tickets/unread-summary` on route change)
- ✅ Per-ticket unread dot styled pink with glow
- ✅ Reassignment resets `assignee_has_unread` for new assignee
- ✅ Message bubbles display correctly with role-based styling
- ✅ Timestamp styling applied
- ✅ Ticket list shows more tickets (increased max-height)
- ✅ Resolution fields stored in `ticket_events` for audit trail (verified with test resolutions)

#### Deferred Items
None — all items from 2026-09-07 session are now complete.

***

### Next Phase

**Phase 9: Docker Setup** — Ready to begin Docker containerization for local development and production deployment.

Required deliverables:
- `Dockerfile` for backend (Node.js + Express)
- `Dockerfile` for frontend (React + Vite)
- `docker-compose.yml` orchestrating backend, frontend, and PostgreSQL
- Seed data script for local development
- Documentation for running and deploying containers
```

---

### Ticket Lifecycle Extensions — 2026-09-07

Three approved add-on features implemented and manually verified:

1. **Manual ticket close** — Original raiser or Super can close a resolved ticket early via `PATCH /tickets/:id/close`. Uses conditional UPDATE to avoid race with auto-close cron. Records `closed` event with acting user.

2. **Resolution remarks and repair cost** — Assignee must provide non-empty `resolutionRemarks` and `repairCost >= 0` when resolving. Stored on `tickets` table; displayed on resolved/closed tickets; pre-filled on re-resolve.

3. **Ticket messaging with unread indicators** — Raiser, assignee, and Super can post messages; matching Admin can view read-only. Unread flags tracked per ticket (`raiser_has_unread`, `assignee_has_unread`). API: `GET /tickets/unread-summary`, `GET /tickets/:id/messages`, `POST /tickets/:id/messages`.

**Verification status:**
- Manual close: raiser succeeds, Super succeeds, assignee rejected, wrong-status rejected.[1]
- Resolution fields: resolve rejected without remarks/cost, zero-cost accepted, re-resolve overwrites values.[1]
- Messaging: posting/viewing permission matrix verified, closed-ticket posting rejected, unread-flag setting verified.[1][2]

**Deferred to next session:**
- Per-ticket unread dot visual in ticket list (backend serialization ready; frontend `UnreadIcon` component exists but not fully wired).
- Sidebar unread badge integration.
- Reassignment resetting `assignee_has_unread` for new assignee.
```

---

## Current status — 2026-09-05

The application has completed the Unit Departments enhancement and basic staff assignment workflow.

A unit now has two distinct department concepts:

| Department type | Table | Used by | Examples |
|---|---|---|---|
| Service department | `departments` and `unit_departments` | Admin and Team role assignment; ticket service routing | IT, Biomedical, Maintenance |
| Unit / staff home department | `staff_departments` | Staff role assignment and staff scope display | HR, Finance, Nursing, Operations |

### Verified workflow

1. Log in as Super.
2. Open **Unit Departments**.
3. Select a unit.
4. Create a unit-specific staff department, such as Nursing.
5. Open Users.
6. Create a Staff user.
7. Select the same unit.
8. Select the newly created Unit Department.
9. Log out.
10. Log in as the new Staff user.
11. Confirm the Staff user can raise a ticket.

This workflow has been manually tested successfully.

## Current frontend behavior

### User creation

- Super can create Management, Admin, Team, and Staff accounts.
- Admin can create Team and Staff accounts only within the Admin’s own unit.
- Team can create Staff accounts only within the Team user’s own unit.
- Staff users should choose from active `staff_departments`.
- Admin and Team users should choose from active service departments configured for the selected unit.

### User management

The Users page is being refined to include:

- Search by visible user data.
- Pagination.
- Modal-based user editing.
- Account Details fields arranged in two equal-width columns at desktop widths.
- Role and Scope fields arranged in three columns at desktop widths.

### Header

The intended signed-in identity layout is:

```text
{Full name}
{Unit name} » {Department name}
```

For Super and Management users, no unit/department scope may be available. The UI should handle that gracefully without displaying database IDs.

## Backend changes made

### New table

```text
staff_departments
```

Key fields:

```text
id
unit_id
name
is_active
created_at
```

### New users column

```text
users.staff_department_id
```

This references:

```text
staff_departments.id
```

### Staff scope rule

For Staff users:

```text
users.department_id = NULL
users.staff_department_id = selected unit department ID
```

For Admin and Team users:

```text
users.department_id = selected service department ID
users.staff_department_id = NULL
```

Management and Super users must not have a unit or department assignment.

## Critical implementation checks

Before adding new functionality, inspect and reconcile these files:

```text
backend/src/controllers/users.controller.js
backend/src/controllers/auth.controller.js
backend/src/routes/staff-departments.js
frontend/src/pages/UsersPage.jsx
frontend/src/components/UserForm.jsx
frontend/src/components/AppLayout.jsx
frontend/src/api/staffDepartments.js
frontend/src/styles.css
```

The uploaded project snapshot may not include every manual change currently present in the running local copy. Do not overwrite a working local file blindly with an older project-file version.

## Current issue list

1. The uploaded `UsersPage.jsx` snapshot appears older than the version used during recent UI changes:
   - It does not show search or pagination.
   - It does not show the new Unit Department data-loading logic.
   - It still renders the edit interface as a separate content card instead of the selected modal approach.

2. The uploaded `staff-departments.js` snapshot still shows invalid array-style calls such as:

   ```js
   authorizeRoles(['super', 'admin'])
   ```

   The working version must use:

   ```js
   authorizeRoles('super', 'admin')
   ```

3. The uploaded `users.controller.js` snapshot still appears to use only `department_id`. The working version must preserve staff-specific handling of:

   ```text
   staff_department_id
   ```

4. The temporary authentication and authorization debug logs should be removed after the authorization flow is confirmed stable.

## Next planned work

The original phased build order lists the next major implementation phase as:

```text
Ticket CRUD and lifecycle state machine
```

Before moving to ticket lifecycle work, finish the current Users page cleanup and verify the final implementation is saved in the active project directory.

- **Current phase:** Phase 8 - role-based views/routes.
- **Phases 1 through 7:** Complete and manually verified.
- **Security Administration extension:** Implemented and fully verified on 2026-08-26, including controlled verification against an isolated PostgreSQL clone.
- **Approved lifecycle amendment:** Implemented and manually verified on 2026-08-27 and 2026-08-28. It uses 48-hour resolved-ticket eligibility, a three-hour in-process auto-close scheduler, original-ticket-raiser reopening while Resolved, Super reopening, Admin/Team My raised tickets and Work queue separation, and revised Super assignment/reassignment rules.
- **Phase 8 functional status:** Complete and manually verified on 2026-08-29.
- **Backend security/API hardening checkpoint:** Implemented and manually verified on 2026-08-29 before UI/UX refinement work. Admin/Team ordinary user-list visibility was explicitly confirmed as Unit-scoped rather than Department-scoped; login now performs a bcrypt comparison for unknown usernames using the shared configured work factor; all three password-reset routes were audited and intentionally retained without consolidation.
- **Approved Admin Work Queue Oversight Amendment:** Implemented and accepted for progression on 2026-08-31. The amendment adds Admin-only Work Queue categories and counts for All work, Needs assignment, My active work, and Team active work; focused categories use oldest-first creation-time ordering; ticket-list rows gain a neutral Ticket Age indicator derived from creation time. It does not create an Admin dashboard, expand visibility/permissions, or introduce an SLA, overdue, breach, escalation, or amber-age rule. A future active-category sort toggle and future amber emphasis for old Open/unassigned tickets are approved only as separately deferred enhancements.
- **Admin Work Queue Oversight verification status:** Ticket Age display, exact `Ticket age` tooltip wording, Admin category controls, category counts, existing ticket behavior, and All work newest-first ordering were manually confirmed. Team active work oldest-first ordering was confirmed. Category counts were also confirmed to match the displayed ticket lists after testing. Needs assignment and My active work oldest-first ordering remain implemented but require a final multi-ticket manual check before Phase 9 deployment work begins.
- **Approved Dashboard reporting amendment — 2026-09-01:** Replace the visible `Tickets per Staff member` report with `Unresolved tickets per department`. An unresolved ticket has status `open`, `assigned`, or `in_progress`; `resolved` and `closed` tickets are excluded. The report groups qualifying tickets by department and respects the currently active Dashboard filters. This is a Dashboard reporting change only: no migration, new endpoint, role/permission change, ticket lifecycle change, auto-close change, assignment-rule change, saved-filter ownership change, or export-permission change.
- **Next work:** Complete the approved Dashboard reporting amendment by implementing and manually verifying `Unresolved tickets per department` in place of `Tickets per Staff member`. Then complete final Dashboard visual/functional verification before resuming `VISUAL_DESIGN.md` Step 5 — Units and Users. Do not begin Phase 9 Docker work until all approved refinement work is completed and manually verified, and the remaining Admin Work Queue pre-Phase 9 ordering checks are completed.

### Deferred Dashboard upgrades

The following Dashboard enhancements are approved as future ideas only. They must be selected, specified, implemented, and manually verified one at a time through a separate scoped amendment. Do not implement them during the current `Unresolved tickets per department` work.

- **Tickets by priority**
  - Group filtered tickets by `low`, `medium`, `high`, and `urgent`.
  - Intended as a future workload report or supplementary operational breakdown.

- **Unassigned Open tickets KPI**
  - Count tickets where status is `open` and no assignee is present.
  - Informational only; it does not create an SLA, escalation, breach, warning, or assignment deadline.

- **Active work KPI**
  - Count Assigned plus In Progress tickets.
  - Informational only.

- **Resolved awaiting closure KPI**
  - Count currently Resolved tickets that have not yet been auto-closed.
  - Informational only.
  - It does not change the approved 48-hour resolved-ticket eligibility or the three-hour auto-close scheduler.

- **Average age of Open tickets**
  - Calculate the current age of tickets in Open status.
  - Informational only.
  - It must not create an overdue, breach, amber-age, escalation, or SLA policy without another explicit amendment.

- **Accurate opened-versus-closed time trend**
  - Correct the current backend trend calculation so openings are bucketed by `created_at` and closures are bucketed by `closed_at`.
  - Do not present the current trend calculation as a true closure-time trend until this correction is implemented and manually verified.

- **Additional restrained accessible charts**
  - Existing or explicitly approved Dashboard metrics may later be presented with restrained accessible charts.
  - Charts must retain visible labels and numeric values.
  - Charts must not rely on colour alone.
  - Avoid excessive chart density, decorative visuals, and chart types that do not improve operational readability.


### Required pre-Phase 9 Admin Work Queue verification

Before beginning Phase 9 Docker deployment work, create sufficient disposable test data and manually verify the two remaining focused-category sort cases:

- **Needs assignment**
  - Create at least two Open/unassigned tickets in the authenticated Admin's existing department-scoped Work Queue.
  - Ensure the tickets have different `createdAt` timestamps.
  - Confirm the oldest ticket appears at the top of the category list.

- **My active work**
  - Create at least two Assigned or In Progress tickets assigned to the authenticated Admin.
  - Ensure the tickets have different `createdAt` timestamps.
  - Confirm the oldest ticket appears at the top of the category list.

- Confirm category counts continue to match the displayed ticket lists after these tests.

This is a mandatory pre-Phase 9 deployment checkpoint. It is not permission to alter category definitions, role scope, backend queue logic, lifecycle behavior, or Ticket Age rules.


### Phase 1 completed

- PostgreSQL schema created through tracked Knex migrations.
- All required tables exist:
  - `departments`
  - `units`
  - `unit_departments`
  - `users`
  - `tickets`
  - `ticket_events`
  - `saved_filters`
- Department seed data exists:
  - IT
  - Maintenance
  - Bio-Medical
- Required enums, indexes, foreign keys, unique constraints, timestamps, and role-scope database check constraint were verified.
- The partial unique index enforcing exactly one Super account was verified.
- Migration chain was tested through full rollback and re-application.

### Phase 2 completed

- Super account bootstrap CLI workflow implemented and tested.
- Password login with bcrypt verification implemented.
- JWT access-token generation and Bearer-token authentication middleware implemented.
- Role middleware implemented.
- Password changes implemented:
  - Endpoint: `POST /auth/change-password`
  - Requires the current password.
  - New password minimum is 12 characters.
- Standard login implemented:
  - Endpoint: `POST /auth/login`
  - Returns `{ requiresTwoFactor: false, token, user }` when 2FA is disabled.
- Current user endpoint implemented:
  - Endpoint: `GET /auth/me`
- Logout endpoint implemented:
  - Endpoint: `POST /auth/logout`
- Two-step TOTP login implemented:
  - `POST /auth/login` returns `{ requiresTwoFactor: true, pending_2fa_token }` when 2FA is enabled.
  - `POST /auth/login/verify-2fa` accepts `pending_2fa_token` and `otp`.
  - A successful verification returns `{ token, user }`.
- Super-only 2FA administration implemented:
  - Endpoint: `PATCH /users/:id/2fa`
  - Request body: `{ "enabled": true }` or `{ "enabled": false }`
  - Enabling returns:
    - `twoFactorSetup.manualSecret`
    - `twoFactorSetup.qrCodeDataUrl`
- TOTP secrets are encrypted at rest with AES-256-GCM.
- Separate environment secrets are used:
  - `JWT_SECRET`
  - `PENDING_2FA_JWT_SECRET`
  - `TOTP_ENCRYPTION_KEY`

### Phase 2 manual verification completed

- Passwords shorter than 12 characters are rejected with HTTP 400.
- Password change succeeds with HTTP 200 when the current password is valid and returns a replacement access token plus the updated user.
- Old password is rejected after a password change.
- New password authenticates successfully.
- Standard JWT login works with 2FA disabled.
- Super successfully enabled 2FA for the Super account.
- TOTP enrollment produced a manual secret and QR-code data URL.
- Login with 2FA enabled returned a pending-2FA token.
- A valid authenticator-app OTP completed two-step login and returned a full JWT.
- The resulting authenticated user had the `super` role.

### Phase 3 completed

- Unit creation, listing, and Super-only unit activation controls are implemented.
- Each new unit automatically receives IT, Maintenance, and Bio-Medical as active per-unit departments.
- Super-only per-unit department activation controls are implemented.
- Role-scoped user creation, listing, editing, username changes, account activation, and password resets are implemented.
- Normal API creation of Super accounts is blocked.
- The existing Super account cannot be demoted, reassigned to a unit/department, disabled, or exposed to non-Super user lists.
- Explicit enable/disable routes are used for users, units, and per-unit departments.
- All Phase 3 API and permission tests passed.

### Phase 4 completed

- Ticket creation, listing, ticket detail, audit-history retrieval, claims, assignment, priority changes, controlled status changes, and same-day Staff reopen are implemented.
- Lifecycle enforcement is server-side: `open → assigned → in_progress → resolved`.
- Staff can reopen only tickets they originally raised and only on the same calendar day as resolution.
- Ticket audit events are written for all implemented lifecycle actions.
- Automatic close and Super unlock were intentionally deferred to Phase 5.
- All Phase 4 API, permission, lifecycle, and audit-trail tests passed.

### Phase 5 completed

- Added internal `POST /system/cron/auto-close`, protected by `x-internal-cron-key`.
- Auto-close closes only `resolved` tickets whose `resolved_at` is before the current calendar day.
- Auto-close writes a system-generated `closed` ticket event with a null `actor_id`.
- Added Super-only `PATCH /tickets/:id/unlock`.
- Unlock requires a non-empty `reason`, changes `closed → in_progress`, clears `closed_at`, and retains the assignee.
- Added `ticket_events.reason` through tracked migration `20260824155000_add_reason_to_ticket_events.js`.
- Unlock events record `event_type = unlocked`, the Super actor ID, transition values, required reason, and timestamp.
- Manual verification confirmed same-day resolved tickets remain resolved, eligible prior-day tickets auto-close, and Super unlock creates the required audit event.

### Phase 6 completed

- Added Management- and Super-only dashboard endpoints:
  - `GET /dashboard/metrics`
  - `GET /dashboard/export?format=csv|pdf`
  - `POST /dashboard/saved-filters`
  - `GET /dashboard/saved-filters`
  - `DELETE /dashboard/saved-filters/:id`
- Dashboard metrics support filtering by unit, department, status, priority, date range, assignee, and other defined dashboard filter dimensions.
- Implemented report data for:
  - Tickets by status.
  - Tickets by department.
  - Tickets by unit.
  - Average resolution time.
  - Tickets per staff/team member.
  - Open-versus-closed trend over time.
- CSV and PDF exports respect the active dashboard filters.
- Saved filters are private to the authenticated creator:
  - Management and Super can each create, list, and delete their own filters.
  - Saved-filter reads and deletes are scoped by authenticated user ID.
  - Super cannot view or delete Management-created saved filters.
  - Management cannot access Super-created saved filters.
- Team, Admin, and Staff are denied dashboard access.

### Phase 6 manual verification completed

- Management successfully authenticated and accessed dashboard functionality.
- Management created and listed a private saved filter.
- Super attempted to delete a live Management-owned filter and received `Saved filter not found.`
- Management listed that filter after the Super deletion attempt, proving it was still present and had not been deleted by Super.
- Team successfully authenticated but was denied access to dashboard metrics with `You do not have permission to perform this action.`
- Saved-filter test data was subsequently removed; the final Management saved-filter list was empty.
- Phase 6 dashboard authorization and saved-filter ownership isolation are verified.
- Live saved-filter request/response contract captured:
  - Request key is `filters`.
  - Response wrapper is `savedFilter`.
  - API JSON uses camelCase.
- The final API-contract saved-filter test record was deleted successfully with HTTP 204.

### Phase 7 completed

- Implemented the React frontend shell and authenticated application structure.
- Implemented username/password login UI.
- Implemented two-step TOTP login UI for accounts with 2FA enabled.
- Implemented tab-scoped authenticated-session persistence using `sessionStorage`.
- Implemented API client bearer-token attachment.
- Implemented logout flow.
- Implemented protected-route enforcement.
- Implemented role-aware post-login routing.
- Implemented wrong-role route protection and redirect to the authenticated user's own home route.
- Added the minimal shared authenticated layout and Phase 7 placeholder role-home pages.

### Phase 7 manual verification completed

- Super successfully completed password login plus TOTP verification and landed on `/super/dashboard`.
- Super session persisted after normal and hard browser refresh.
- Closing the authenticated browser tab cleared the tab-scoped session.
- Signed-out access to `/super/dashboard` redirected to `/login`.
- Logout redirected to `/login` and blocked subsequent direct protected-route access.
- Management successfully completed password-only login and landed on `/management/dashboard`.
- Admin successfully completed password-only login and landed on `/admin/tickets`.
- Team successfully completed password-only login and landed on `/team/tickets`.
- Staff successfully completed password-only login and landed on `/staff/tickets`.
- Management, Admin, Team, and Staff were each blocked from `/super/dashboard` and redirected to their own authorized role route.

### Phase 8 final frontend completion — 2026-08-29

- Implemented and manually verified role-specific navigation, Tickets, Units, Departments, and Users frontend work.
- Implemented and manually verified the Management and Super Dashboard frontend workspace:
  - Filtered dashboard metrics.
  - Unit, department, status, priority, and date filtering.
  - CSV and PDF export.
  - Private saved-filter create, list, apply, refresh, and delete behavior.
  - Saved-filter ownership isolation between Super and Management accounts.
- Implemented and manually verified the Security Administration frontend workspace:
  - Super global password-policy viewing and update controls.
  - Per-user password-policy override and restoration of global inheritance.
  - One-time temporary-password generation display.
  - Delegated Security Administration grant and revoke controls.
  - Security audit-event display.
  - Delegated Admin Security Administration access with backend-enforced same-Unit Team/Staff scope.
  - Super-only global policy, delegation, and audit controls hidden from delegated Admin users.
- Corrected the forced-password-update frontend session flow:
  - `completePasswordChange()` stores the replacement unrestricted JWT returned by `POST /auth/change-password`.
  - Users can access their normal role workspace immediately after successful password replacement without logging out and back in.
- Removed the unfinished Staff Profile navigation item and `/staff/profile` route:
  - Staff now has only the functional My Tickets route.
  - Profile functionality is reserved for a future approved upgrade.
- Final Phase 8 frontend production build and role smoke tests passed for Super, Management, Admin, Team, and Staff.

### Security Administration extension completed

Implemented and fully verified on 2026-08-26 after Phase 7 verification.

- Added tracked security-administration database support:
  - `users.must_change_password`
  - `users.password_policy_override`
  - singleton `security_settings`
  - `user_permissions`
  - `security_audit_events`
- Added Super-managed global ordinary-user password policy:
  - `minLength`
  - `requireUppercase`
  - `requireLowercase`
  - `requireNumber`
  - `requireSpecialCharacter`
- The approved current test-environment global policy is:
  - Minimum length: 3.
  - Uppercase required: false.
  - Lowercase required: false.
  - Number required: false.
  - Special character required: false.
- Preserved the fixed Super password policy:
  - Minimum 12 characters.
  - Uppercase, lowercase, number, and special character required.
- Added server-side effective-policy validation for ordinary-user creation, password reset, self-service password change, and forced temporary-password replacement.
- Added per-user password-policy overrides, restoration of global-policy inheritance, required reasons for policy changes, forced password update, and independent security audit events.
- Added generated temporary-password resets:
  - A temporary password is displayed once to the authorized operator.
  - Only a bcrypt password hash is retained.
  - The target account is marked `mustChangePassword: true`.
- Added restricted-session enforcement:
  - A user who must change password can access only `/auth/me`, `/auth/change-password`, and `/auth/logout`.
  - The frontend redirects restricted users to `/update-password`.
- Added Super-only Security Administration routes for global policy, delegation, delegates, and security audit events.
- Added delegated `security_admin` permission for eligible Admin users:
  - Restricted to Team and Staff users in the delegated Admin's own unit.
  - Does not create a second Super account or grant Super-level access.
- Added `npm run recover-super` and the root-level `RECOVERY.md` runbook.
- Added `UpdatePasswordPage.jsx` and completed the frontend password-change integration.

### Security Administration verification completed

Completed on 2026-08-26.

- Backend started without errors.
- Frontend built and loaded without errors.
- Existing Super TOTP login continued to work.
- Existing Management, Admin, Team, and Staff login flows continued to work.
- Super confirmed the approved global ordinary-user password policy.
- Super created an ordinary Staff account with a policy-compliant 3-character password.
- Super verified non-compliant ordinary-user passwords are rejected.
- Super verified Security Administration user listings:
  - Exclude Super.
  - Show the ordinary user's effective policy source.
- Per-user custom policy assignment and removal were verified:
  - Custom policy marks the target `mustChangePassword: true`.
  - Removing the override restores the global policy source.
  - Required audit records are created.
- Super temporary-password reset was verified:
  - The temporary password was shown once.
  - The target signed in to the forced password-update page.
  - Successful password update cleared `mustChangePassword`.
  - Credential material was not exposed through audit records.
- Non-delegated Admin Security Administration access was denied with HTTP 403.
- Super granted `security_admin` to an active Admin with a required reason.
- Delegated Admin successfully read in-scope Team and Staff security users.
- Delegated Admin remained denied Super-only global-policy access.
- Super revoked `security_admin`.
- The same Admin session was immediately denied Security Administration access after revocation.
- Audit records confirmed grant, revocation, and denied-access events.

### Security Administration final controlled verification completed

Completed on 2026-08-26 with an isolated PostgreSQL clone and a separate backend instance.

- A global-policy update marked inheriting ordinary users for forced password change.
- A custom-policy user was unaffected by the global-policy update.
- The clone audit log recorded the global-policy update with safe before/after values, required reason, successful outcome, and timestamp.
- Delegated Admin successfully updated an in-scope Staff user's policy.
- A restricted Staff session was denied normal protected ticket access.
- Forced password replacement cleared `mustChangePassword` and restored Staff access.
- `npm run recover-super` was executed successfully against the isolated clone.
- Recovery required `SUPER_RECOVERY_KEY`, a non-secret reason, replacement Super password, and confirmation.
- Recovery cleared clone Super TOTP.
- Clone Super TOTP was re-enrolled.
- A fresh clone Super two-step login succeeded after re-enrollment.
- The clone audit log contained the recovery event.
- The isolated backend was stopped.
- The isolated clone database was permanently deleted and its absence verified.
- The clone-only authenticator entry was removed.
- The active primary database and normal backend were health-checked after clone cleanup.

### Known issues or deviations

None currently open.

### ✅ Resolved: Notification Badge Cache Invalidation - 2026-09-09

**Issue:** Notification badges didn't clear until manual refresh after viewing a ticket.

**Fix:** Implemented real-time refresh using:
- Ticket list refetch after `loadMessages()` in `TicketsPage.jsx`
- Custom event `iuvo:refresh-unread` to notify `AppLayout.jsx`
- Header badge refetches `/api/tickets/unread-summary` on event

**Files:**
- `frontend/src/pages/TicketsPage.jsx` — `openTicket()` function
- `frontend/src/components/AppLayout.jsx` — `useEffect` listener for `iuvo:refresh-unread`

## Phase 8 visual refinements — 2026-09-03

### Status

Visual refinement work within Phase 8 scope was completed on 2026-09-03. This work did not alter roles, permissions, workflows, or API contracts — only presentation-layer improvements to existing screens.

### Completed refinements

**Ticket workspace (TicketsPage.jsx)**
- Event actor names now display in audit history (replaces UUIDs)
- Ticket Age badge shows human-readable format (e.g., "2 hours", "3 days")
- Admin Work Queue categories fully verified and functional

**Dashboard export**
- PDF export uses simple ticket list template (production-ready)
- CSV export unchanged
- IUVO branded template designed but deferred for future approval

**Backend improvements**
- `GET /tickets/:id` includes actor information in events (username, fullName)
- Dashboard metrics include priority distribution data
- No database migrations required

### Deferred enhancements (documented)

The following improvements were designed and tested but deferred pending formal approval:

- **IUVO branded PDF template** with charts and KPI cards
- **Dashboard visualization** with restrained bar charts
- **Enhanced KPI display** with card-based layout

All deferred items require separate explicit approval before implementation.

### Verification status

All Phase 8 visual refinements are complete and manually verified.

---

## Phase 9 — Docker deployment (pending)

Phase 9 Docker containerization work remains blocked until:
1. All Phase 8 functional and visual work is complete and verified ✅ **DONE**
2. Any additional approved visual refinements are completed
3. Final pre-Phase 9 checkpoints are satisfied

**Pre-Phase 9 checkpoints:**
- Admin Work Queue "Needs assignment" oldest-first ordering (multi-ticket test)
- Admin Work Queue "My active work" oldest-first ordering (multi-ticket test)
- Dashboard "Unresolved tickets per department" report implementation

Once these are complete, Phase 9 will proceed with:
- Dockerfile for backend
- Dockerfile for frontend
- docker-compose.yml for production deployment
- Environment configuration for containerized deployment

---

## 3A. Verified live API contract

The following request and response shapes were verified against the live backend. The original API-contract capture was completed on 2026-08-25; later entries include subsequently verified implementation amendments. Frontend implementation must use these exact camelCase JSON keys and endpoint wrappers.

### JSON convention

- API request and response property names are camelCase.
- Database column names may use snake_case internally but must not be used as frontend API keys.
- Enum values may use snake_case where defined by the backend, for example `in_progress`.
- Never include passwords, password hashes, JWTs, pending-2FA tokens, TOTP secrets, QR data, or encryption keys in documentation or frontend state beyond the immediate login request.

### Password change

#### `POST /auth/change-password`

- Requires an authenticated session.
- Request body:

  ```json
  {
    "currentPassword": "Current password",
    "newPassword": "New compliant password"
  }
  ```

- Successful response: HTTP 200.

  ```json
  {
    "token": "replacement unrestricted access token",
    "user": {
      "id": "uuid",
      "username": "username",
      "fullName": "Full Name",
      "role": "staff",
      "unitId": "uuid",
      "departmentId": "uuid",
      "isActive": true,
      "twoFactorEnabled": false,
      "mustChangePassword": false
    }
  }
  ```

- The frontend must replace the stored access token with `token` before routing the user back to their normal role workspace.
- This replacement token is required so a formerly restricted session can immediately access normal authenticated endpoints after a successful password update.


### Units

#### `POST /units`

- Request body:
  ```json
  {
    "name": "Unit name"
  }
  ```
- Super-only.
- A successful `POST /units` response must be captured again if its exact response wrapper is needed; the live test confirmed creation but did not retain the full response body.

#### `GET /units`

```json
{
  "units": [
    {
      "id": "uuid",
      "name": "Unit name",
      "isActive": true,
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp",
      "departments": [
        {
          "id": "uuid",
          "name": "IT",
          "isActive": true
        }
      ]
    }
  ]
}
```

- Department IDs are located at `units[].departments[].id`.
- The department IDs are global fixed-department IDs and can appear under each unit.
- Per-unit activation state is returned as `units[].departments[].isActive`.

### Users

#### `POST /users`

- Request body for a Staff, Team, or Admin user:
  ```json
  {
    "username": "username",
    "fullName": "Full Name",
    "password": "minimum 12 characters",
    "role": "staff",
    "unitId": "uuid",
    "departmentId": "uuid"
  }
  ```
- Required base fields: `username`, `fullName`, `password`, and `role`.
- Response:
  ```json
  {
    "user": {
      "id": "uuid",
      "username": "username",
      "fullName": "Full Name",
      "role": "staff",
      "unitId": "uuid",
      "unitName": "Unit name",
      "departmentId": "uuid",
      "departmentName": "IT",
      "isActive": true,
      "twoFactorEnabled": false,
      "createdBy": "uuid",
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp"
    }
  }
  ```

### Tickets

#### `POST /tickets`

- Request body:
  ```json
  {
    "unitId": "uuid",
    "departmentId": "uuid",
    "title": "Ticket title",
    "description": "Ticket description",
    "priority": "medium"
  }
  ```
- Response wrapper: `ticket`.

#### `GET /tickets/:id`

```json
{
  "ticket": {
    "id": "uuid",
    "ticketNumber": "UNIT-DEPT-000001",
    "unitId": "uuid",
    "unitName": "Unit name",
    "departmentId": "uuid",
    "departmentName": "IT",
    "raisedBy": {
      "id": "uuid",
      "username": "username",
      "fullName": "Full Name"
    },
    "assignedTo": null,
    "title": "Ticket title",
    "description": "Ticket description",
    "priority": "medium",
    "status": "open",
    "resolvedAt": null,
    "closedAt": null,
    "reopenedCount": 0,
    "createdAt": "ISO-8601 timestamp",
    "updatedAt": "ISO-8601 timestamp"
  },
  "events": [
    {
      "id": "uuid",
      "ticketId": "uuid",
      "actorId": "uuid",
      "eventType": "created",
      "fromValue": null,
      "toValue": "open",
      "reason": null,
      "createdAt": "ISO-8601 timestamp"
    }
  ]
}
```

- Ticket detail wrapper: `ticket`.
- Audit-trail array: `events`, not `ticketEvents` or `ticket_events`.
- Audit event properties: `ticketId`, `actorId`, `eventType`, `fromValue`, `toValue`, `reason`, and `createdAt`.
- Ticket assignee property: `assignedTo`.
- Status property: `status`.

#### `PATCH /tickets/:id/claim`

- Request body: `{}`.
- Response wrapper: `ticket`.
- Successful claim changes `status` from `open` to `assigned`.
- `assignedTo` becomes an object with `id`, `username`, and `fullName`.

#### `PATCH /tickets/:id/status`

- Request body:
  ```json
  {
    "status": "in_progress"
  }
  ```
- Response wrapper: `ticket`.
- Verified transitions:
  - `assigned` → `in_progress`
  - `in_progress` → `resolved`
- Resolving sets `resolvedAt`, retains `assignedTo`, and leaves `closedAt` as `null`.

### Dashboard saved filters

#### `POST /dashboard/saved-filters`

- Request body:
  ```json
  {
    "name": "Saved filter name",
    "filters": {
      "status": ["open"],
      "unitId": "uuid"
    }
  }
  ```
- The request key is `filters`, not `filterJson` and not `filter_json`.
- Response:
  ```json
  {
    "savedFilter": {
      "id": "uuid",
      "name": "Saved filter name",
      "filters": {
        "status": ["open"],
        "unitId": "uuid",
        "departmentId": null,
        "priority": [],
        "assigneeId": null,
        "raisedById": null,
        "createdFrom": null,
        "createdTo": null,
        "resolvedFrom": null,
        "resolvedTo": null,
        "closedFrom": null,
        "closedTo": null
      },
      "createdAt": "ISO-8601 timestamp"
    }
  }
  ```
- Response wrapper: `savedFilter`.
- Saved filters remain private to the authenticated account that created them.

## 3B. Security Administration contract and implementation status

Security Administration was implemented and fully verified on 2026-08-26. The implementation/verification history is recorded in Section 3 above. This section retains the active API and authorization contract needed for maintenance and future approved enhancements.

### Global password policy

- `GET /security/password-policy`
  - Super only.
  - Returns the global ordinary-user policy in a `passwordPolicy` wrapper.
- `PATCH /security/password-policy`
  - Super only.
  - Requires a non-empty `reason`.
  - Updates the global ordinary-user policy and marks global-policy users for forced password update.
- Approved current test-environment global policy:
  ```json
  {
    "minLength": 3,
    "requireUppercase": false,
    "requireLowercase": false,
    "requireNumber": false,
    "requireSpecialCharacter": false
  }
  ```

### Security users and overrides

- `GET /security/users`
  - Super receives all non-Super users.
  - A delegated `security_admin` Admin receives only Team and Staff users in that Admin's own unit.
  - Non-delegated Admin access is denied.
  - Returned security-user data includes:
    - `policySource`
    - `passwordPolicy`
    - `mustChangePassword`
- `PATCH /security/users/:userId/password-policy`
  - Super may target any non-Super user.
  - Delegated security Admin may target only Team and Staff users in the Admin's own unit.
  - Requires:
  ```json
  {
    "passwordPolicy": {
      "minLength": 5,
      "requireUppercase": true,
      "requireLowercase": false,
      "requireNumber": false,
      "requireSpecialCharacter": false
    },
    "reason": "Required non-secret audit reason"
  }
  ```
  - Marks the target `mustChangePassword: true`.
- `DELETE /security/users/:userId/password-policy`
  - Restores global-policy inheritance.
  - Requires:
  ```json
  {
    "reason": "Required non-secret audit reason"
  }
  ```
  - Keeps the target marked `mustChangePassword: true` until the target completes a compliant password update.
- `POST /security/users/:userId/reset-password`
  - Super may reset any non-Super user.
  - Delegated security Admin may reset only in-scope Team and Staff users.
  - Generates and returns a temporary password once to the authorized operator.
  - The temporary password must never be retained, logged, audited, or returned again.
  - Marks the target `mustChangePassword: true`.

### Delegated Security Administration

- `GET /security/delegates`
  - Super only.
  - Lists active Admin users holding `security_admin`.
- `POST /security/delegates/:userId`
  - Super only.
  - Grants `security_admin` to an eligible active Admin user.
  - Requires a non-empty `reason`.
- `DELETE /security/delegates/:userId`
  - Super only.
  - Revokes `security_admin` immediately, including for an already-issued Admin session.
  - Requires a non-empty `reason`.

### Security audit and recovery

- `GET /security/audit-events`
  - Super only.
  - Returns security-sensitive events without credential material.
- Security audit records must never include:
  - Passwords.
  - Temporary passwords.
  - Password hashes.
  - TOTP secrets or QR data.
  - JWTs or pending two-factor tokens.
  - Encryption keys or recovery keys.
- `npm run recover-super`
  - Backend host/container command only.
  - Requires `SUPER_RECOVERY_KEY`.
  - Targets only the sole Super account.
  - Requires a non-secret reason and a replacement password satisfying the fixed Super password policy.
  - Clears Super TOTP enrollment after successful recovery.
  - Records a recovery security audit event without secrets.
- `RECOVERY.md` is the approved operational runbook for recovery.

---

## 4. Critical security rules

- Never commit `.env` files.
- Never commit or paste passwords, JWTs, pending-2FA tokens, TOTP setup secrets, QR data URLs, OTPs, or encryption keys.
- A TOTP secret is shown only at enrollment. If the secret is lost, Super must disable and then re-enable 2FA for that user.
- `JWT_SECRET`, `PENDING_2FA_JWT_SECRET`, and `TOTP_ENCRYPTION_KEY` must remain separate.
- A pending-2FA token must never be accepted by regular authentication middleware as a full session token.
- There is exactly one Super account.
- No normal user-creation API may create a Super user.
- Phase 3 must explicitly prevent changing the existing Super account’s role, unit, or department.
- Dashboard data and exports are available only to Management and Super.
- Saved filters are private to their creator; every list and delete query must be scoped to the authenticated user ID.
- `SUPER_RECOVERY_KEY` must be distinct from `JWT_SECRET`, `PENDING_2FA_JWT_SECRET`, and `TOTP_ENCRYPTION_KEY`.
- Never log, audit, commit, paste, or store a temporary password, password hash, recovery key, TOTP secret, QR data URL, JWT, or pending-2FA token.
- A delegated `security_admin` permission does not create a second Super account and does not grant Super-level access.
- The Super password policy is fixed and must never be weakened by global or per-user policy controls.
- Ordinary-user password-policy changes must use forced password update after authentication, not password invalidation or password inspection.

---

## 5. Locked architectural decisions

- Roles: Super, Management, Admin, Team, Staff.
- One user has exactly one role, one unit, and one department, except Super and Management:
  - Super: no unit and no department.
  - Management: no unit and no department.
  - Admin, Team, Staff: both unit and department required.
- Super account:
  - Exactly one system-wide.
  - Created only by the one-time bootstrap CLI command.
  - Never created through `POST /users`.
  - Not visible to non-Super users.
- Fixed departments: IT, Maintenance, Bio-Medical.
- 2FA:
  - Off by default.
  - Only Super can enable or disable it for any user, including Super.
  - TOTP-based through an authenticator app.
- Ticket lifecycle:
  - Current implemented lifecycle: Open -> Assigned -> In Progress -> Resolved -> Closed.
  - Current implemented reopen rule: original Staff raiser may reopen their own same-day Resolved ticket.
  - Current implemented auto-close rule: a midnight process closes eligible Resolved tickets from a prior calendar day.
  - Current implemented closed-ticket rule: Closed tickets are locked except for Super unlock with a required reason and audit event.
  - Approved lifecycle amendment is implemented and manually verified:
    - Auto-close eligibility becomes at least 48 hours after `resolvedAt`.
    - The auto-close check runs every 3 hours.
    - Any original ticket raiser may reopen their own ticket while it remains Resolved.
    - Super may reopen any ticket while it remains Resolved.
    - Admin/Team ticket access separates My raised tickets from the department Work queue.
    - Super may assign/reassign eligible matching Admin/Team users with a required reason, but cannot claim or be assigned tickets.
- Dashboard:
  - Available only to Management and Super.
  - Supports filtered metrics and CSV/PDF exports.
  - Saved filters are private to their creator.
  - Super has the same saved-filter capabilities as Management only for Super-created filters; Super does not access another user’s filters.
- Docker:
  - Final deployment target, not merely local-development convenience.
  - `docker-compose.yml` belongs at repository root.
- Ports:
  - PostgreSQL host port: `30041`.
  - Backend host port: `30040`.
  - Native backend development connects to Docker Postgres using `DB_HOST=localhost` and `DB_PORT=30041`.
  - Once backend is containerized in Phase 9, it uses Docker networking: `DB_HOST=postgres` and `DB_PORT=5432`.

---

## 6. Current next scope

Phase 8 functional role-based views/routes are complete and manually verified as of 2026-08-29.

Await the user's approved UI/visual-improvement requirements before beginning Phase 9. The upcoming refinement work must not add undocumented roles, endpoints, data-model changes, or workflow rules without explicit approval.

Do not begin Phase 9 Docker deployment work until the approved UI refinement work is complete and manually verified.


## 7. Required files

At repository root:

- `SPEC.md` — locked source of truth.
- `HANDOFF.md` — this continuation document.
- `CHANGELOG.md` — implementation and verification history.
- `BUILD_PROMPT.md` — original build prompt.
- `RECOVERY.md` — approved Super break-glass recovery runbook. `npm run recover-super` is implemented and was functionally verified in an isolated PostgreSQL clone on 2026-08-26. Operational use remains a separately controlled break-glass action because it changes the Super password and clears Super TOTP.

Expected project structure:

```text
service-request-app/
├── backend/
│   ├── scripts/
│   │   └── create-super.js
│   └── src/
│       ├── controllers/
│       ├── db/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── app.js
│       └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   └── package.json
├── docker-compose.yml
├── SPEC.md
├── HANDOFF.md
└── CHANGELOG.md
```
---

## 7. Phase 8 checkpoint — 2026-08-28

This section supersedes earlier Phase 8 pending-work statements where they conflict with the verified work below.

### Lifecycle amendment backend completed and verified

Implemented:

- Added migration `20260827163000_add_reassigned_ticket_event_type.js`.
- Added `reassigned` to the PostgreSQL `ticket_event_type` enum.
- Updated `GET /tickets` queue behavior:
  - `queue=my`
  - `queue=work`
  - `queue=all`
- Staff sees only own raised tickets and has no Work queue.
- Admin and Team:
  - My raised tickets include all tickets personally raised in their own unit, including other departments.
  - Work queue includes only other users' tickets in the actor's assigned unit and department.
  - Own raised tickets are not duplicated into Work queue.
- Super:
  - Has My raised tickets and Work queue visibility across all units and departments.
  - Cannot claim or be assigned a ticket.
  - Can initially assign an Open unassigned ticket, or reassign an Assigned/In Progress ticket, only to an active matching Admin or Team user.
  - Must provide a non-empty reason for every assignment/reassignment.
- Reassignment writes `eventType = reassigned` with prior assignee ID, new assignee ID, reason, Super actor, and timestamp.
- Any original ticket raiser may reopen their own Resolved ticket while it remains Resolved.
- Super may reopen any Resolved ticket.
- Reopen retains the assignee, clears `resolvedAt`, changes status to `in_progress`, and increments `reopenedCount`.
- Auto-close now closes only tickets that remain Resolved for at least 48 hours.
- Added an in-process scheduler started by `src/server.js`:
  - Runs an immediate safe check at backend startup.
  - Runs every 3 hours thereafter.
  - Eligibility remains enforced by the database query, so scheduler timing cannot close early.

Verified manually:

- Backend started with the three-hour auto-close scheduler active.
- Admin My raised tickets and Work queue returned distinct, correct ticket scopes.
- Staff has no Work queue.
- Super initial assignment passed with a required reason and audited `assigned` event.
- Super reassignment passed, retained ticket status, and wrote the required `reassigned` event.
- Admin reassignment attempt was denied.
- Team original-raiser resolve/reopen passed.
- Super resolve/reopen passed for a ticket raised by another user.
- Admin priority update and resolution passed.
- Admin reopen control was hidden for a Resolved ticket raised by another user.
- At 47 hours, 59 minutes, and 59 seconds, auto-close did not close a Resolved test ticket.
- At 48 hours, auto-close closed the test ticket.
- Automatic closure wrote a `closed` event with null actor.
- Super unlock backend/API cleanup passed with retained assignee and cleared `closedAt`.
- `JWT_SECRET` was rotated after an accidental development-token disclosure.

### Ticket workspace frontend completed and verified

Implemented:

- Added queue-aware ticket API client methods.
- Added ticket detail and audit-history display.
- Added role-aware controls for claim, assignment, reassignment, priority update, valid forward status transitions, reopen, and Super unlock.
- Added Super assignment/reassignment reason fields.
- Added My raised tickets and Work queue tabs for Super, Admin, and Team.
- Staff remains My tickets-only.
- Disabled unit departments are filtered out of the ticket-creation Department dropdown.

Verified manually:

- Super, Admin, and Team queue tabs appear.
- Staff has no Work queue tab.
- Team Resolve and Reopen controls/actions passed.
- Super Reassign, Resolve, and Reopen controls/actions passed.
- Admin priority update and Resolve controls/actions passed.
- Admin assignment UI passed and Admin reassignment controls disappeared after assignment.
- Ticket detail and ticket audit history display passed.
- Disabled Main Campus Maintenance was correctly hidden from Staff ticket creation after the frontend filter correction.

Deferred verification:

- Super Unlock frontend control visibility/action is not yet manually exercised because no safe Closed test ticket remains.
- Super Unlock backend/API behavior is verified.

### Super Units and Departments frontend completed and verified

Implemented:

- Added Super Units workspace at `/super/units`.
- Added unit creation UI.
- Added unit enable/disable UI.
- Added per-unit department enable/disable UI.
- Added frontend filtering so disabled departments are unavailable as ticket-creation targets.

Verified manually:

- Frontend build passed.
- Units page loaded.
- Unit creation passed.
- Unit enable/disable passed.
- Department disable/enable passed.
- Disabled department ticket-creation filtering passed.

### User Management frontend completed and verified

Implemented:

- Added role-scoped User Management workspace:
  - Super: `/super/users`
  - Admin: `/admin/team`
  - Team: `/team/staff`
- Added role-scoped user creation.
- Added ordinary-user full-name editing.
- Added Super-only username editing.
- Added Super role/unit/department editing for ordinary users.
- Added Super/Admin account enable/disable controls within backend scope.
- Added Super 2FA control.
- Added Super/Admin temporary-password reset UI.
- Added one-time temporary-password modal.
- Added active-department filtering in user creation.
- Unit remains fixed for Admin/Team-created users, while Department remains selectable among active departments in that unit.

Verified manually:

- Super and Admin user creation passed.
- Team Staff creation passed.
- Admin role/unit scope passed.
- Cross-unit user isolation passed.
- Super 2FA control is visible.
- Super-only username editing passed.
- Temporary-password modal appeared correctly.
- Temporary-password login passed.
- Restricted forced-password-update page passed.
- Normal login after forced password update passed.
- Team Department selector is selectable.
- Only active departments appear.
- Newly created Staff department appears in the user table.

### Current next Phase 8 workspace

Build the Management and Super Dashboard frontend workspace:

- Dashboard metrics.
- Dashboard filters.
- Private saved-filter create/list/delete.
- CSV export.
- PDF export.
- Management and Super access only.

---

## UI/UX refinement status — 2026-09-02

### Completed visual work

The following visual refinements are complete and manually reviewed:

- Dashboard refinement and consolidated Dashboard styling.
- Ticket Workspace visual refinement.
- Admin Work Queue visual refinement.
- Units and Users visual refinement.

### Units screen current state

- Unit cards use a responsive grid:
  - Two columns by default.
  - Three columns at 1180px and wider.
  - One column on mobile.
- Each Unit card shows:
  - Unit initial icon.
  - One-line clamped Unit name with ellipsis on overflow.
  - `X of Y departments active`.
  - Placeholder `0 active users`.
  - A fixed-width Unit Enable/Disable control.
- Department rows show:
  - Green dot when active.
  - Red dot when disabled.
  - Department name.
  - Existing Enable/Disable control.
- The phrase “Fixed for every unit” was intentionally removed from Unit cards.
- The Create Unit form includes:
  - Unit name field.
  - IT, Maintenance, and Bio-Medical checkboxes.
  - Create Unit button.
- The Create Unit form uses responsive breakpoints to prevent overlap:
  - It stays compact at desktop widths.
  - It stacks below 1024px.
  - Checkbox focus styling was scoped to prevent the unwanted light-blue border/ring seen during Dashboard styling.

### Important Units limitations

The current Unit card `0 active users` line is a visual placeholder only.

Do not implement an active-user count without an explicit future task. It requires enriching the backend `GET /units` response with an `activeUserCount` field based on active users for that Unit.

Per-department active-user counts are also explicitly deferred.

The Create Unit department checkboxes are currently a frontend visual control unless the backend `POST /units` handler has separately been updated to receive and persist selected initial Unit Department states. Do not assume checkbox state is persisted until that backend work is explicitly implemented and verified.

### Users screen current state

- User cards use a clearer identity, role, scope, state, and action hierarchy.
- Create and edit forms are split into:
  - Account details.
  - Role and scope.
- Temporary-password modal presentation was improved.
- Existing backend calls, endpoint payloads, role restrictions, password reset behavior, username rules, 2FA rules, and user visibility scopes were intentionally preserved.

### Next UI/UX task

The next planned visual-refinement task is:

```text
Step 6 — Security Administration
```

Scope for Step 6:

- Improve the existing Security Administration screen’s hierarchy and readability.
- Improve password-policy forms.
- Improve selected-user panel presentation.
- Improve delegated Security Administration controls.
- Improve security-audit display.
- Preserve all existing Security Administration permissions, password-policy behavior, audit requirements, and recovery boundaries.
- Do not change backend behavior, endpoints, roles, permissions, or security logic without explicit approval and an implementation task.

### UI/UX refinement status — 2026-09-02

Step 5 — Units and Users visual refinement was completed and manually verified. The Units screen now uses a responsive grid of unit cards (two columns by default, three at 1180px+, one on mobile), with a clamped one-line unit title, `X of Y departments active` summary, and a placeholder `0 active users` line (documented as future scope). Department availability is indicated by green (active) and red (disabled) dots instead of separate pills, and the Create Unit form includes IT/Maintenance/Bio-Medical checkboxes with a responsive layout. The Users screen received a refined create/edit form structure, improved user-card hierarchy with the role badge moved into the same column as the Active and 2FA pills, stacked equal-width state pills, and an improved temporary-password modal. No backend endpoints, roles, permissions, unit/department rules, or user-management behavior were changed.
