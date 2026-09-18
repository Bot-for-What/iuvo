# Changelog

All notable implementation and verification milestones for the Service Request App are recorded here.

## [Unreleased]

## 2026-09-18 — Phase 9 Docker deployment and public evaluation release

### Docker deployment

- Added production-style Docker Compose orchestration for PostgreSQL,
  backend, and frontend containers.
- Added backend Docker entrypoint for automatic Knex migrations.
- Added PostgreSQL health check and backend startup dependency.
- Added persistent PostgreSQL Docker volume.
- Added frontend production build served by Nginx.
- Verified clean-clone startup with Docker Desktop Linux containers.

### Public repository policy

- Removed client-specific branding assets from the public repository.
- Preserved the empty `frontend/public/client-assets` directory with `.gitkeep`.
- Confirmed that no client-specific asset names remain in `origin/main`.
- Confirmed that no private environment files are tracked.
- Confirmed that no demo users, demo tickets, or default credentials are
  included.

### Documentation

- Added and published `DEPLOYMENT.md`.
- Added and published `BACKUP-RESTORE.md`.
- Added and published `SECURITY.md`.
- Added and published `LICENSE.md`.
- Updated the README with evaluation-only usage terms.

### Verification

- Fresh clone completed successfully.
- Docker images built successfully.
- PostgreSQL became healthy.
- 13 migrations ran automatically.
- Backend started successfully after migrations.
- Auto-close scheduler started.
- `GET /health` returned HTTP 200.
- Super bootstrap rejected a password shorter than 12 characters as required.

---

## 2026-09-15 — Atomic ticket-number allocation and final concurrency verification

# Ticket-number generation
Replaced the non-atomic COUNT(*) + 1 ticket-number generation strategy.

Removed the unbounded recursive 23505 retry from createTicket().

Added migration 20260915120000_add_ticket_number_counters.js.

Added ticket_number_counters, keyed by (unit_id, department_id).

Seeded each existing scope above its highest valid numeric suffix without changing existing ticket numbers.

Added atomic counter allocation inside the existing ticket-creation transaction.

Added prefix-aware handling for globally unique visible ticket numbers.

New scopes skip existing globally used numbers with the same normalized unit/department prefix.

Preserved the existing ticket_number global unique constraint.

# Verification
Manual same-scope creation produced consecutive values:

MAINCAMP-BIOMEDIC-000018

MAINCAMP-BIOMEDIC-000019

The corresponding counter advanced to next_sequence = 20.

25 virtual users × 1 iteration: 25 ticket creations, 0 errors.

50 virtual users × 2 iterations: 100 ticket creations, 0 errors.

100 virtual users × 5 iterations: 500 ticket creations, 0 errors.

Final load run: 1,600 total requests, 0 errors, 61.8 requests/second.

No duplicate ticket-number errors remained.

Connection pool and rate limiting
Final Knex pool configuration in both development and production:

min: 5

max: 50

Login rate limiter is enabled in backend/src/app.js.

The final successful 100-user test completed without PostgreSQL 53300 connection errors.

Manual-close route correction
Canonical endpoint is POST /tickets/:id/close.

The router, sanity tests, and current implementation use POST.

Any stale documentation referring to PATCH /tickets/:id/close is corrected to POST.

## 2026-09-10 — Manual close, resolution audit trail, and load testing
Ticket lifecycle: manual close by raiser
Implemented POST /tickets/:id/close to allow the original ticket raiser or Super to manually close a resolved ticket before the 48-hour auto-close window expires.

Endpoint requires an authenticated staff or super user.

Manual closure verifies the ticket is currently resolved, checks the actor, sets closed_at, and writes a closed event with the authenticated actor ID.

Repeating manual closure on an already Closed ticket is rejected with HTTP 409.

Resolution remarks and repair cost audit trail
Each status_change event to resolved preserves its own resolution_remarks and repair_cost values in ticket_events.

Ticket detail shows the latest resolution values while audit history preserves historical resolution events.

Initial load-testing checkpoint
The initial retry-based approach was tested under concurrent load before the atomic counter replacement.

That approach is superseded by the atomic counter implementation documented in the 2026-09-15 entry above.

2026-09-09 — Security Dependency Updates
Vulnerabilities Fixed
Resolved 3 moderate severity npm audit vulnerabilities in backend dependencies.

Resolution
Upgraded Express and qs dependencies.

Ran npm audit fix.

Verified the backend dependency audit reported no vulnerabilities at that checkpoint.

---

## Manual close, resolution audit trail, and load testing — 2026-09-10

### Ticket lifecycle: manual close by raiser

- Implemented `POST /tickets/:id/close` to allow the original ticket raiser or Super to manually close a resolved ticket before the 48-hour auto-close window expires.
- Endpoint requires an authenticated `staff` or `super` user.
- Manual closure:
  - Verifies the ticket is currently `resolved`.
  - Verifies the actor is Super or the ticket's original raiser.
  - Changes `status` from `resolved` to `closed`.
  - Sets `closed_at` to the current timestamp.
  - Writes a `closed` ticket event with the authenticated actor ID (distinguishing manual closure from automatic closure, whose event has a null actor ID).
- Repeating manual closure on an already Closed ticket is rejected with HTTP 409.
- Updated `tickets.routes.js` to register `POST /tickets/:id/close` (previously registered as `PATCH`, which was incorrect for this state-changing action).

### Resolution remarks and repair cost audit trail

- Updated `GET /tickets/:id` to include `resolution_remarks` and `repair_cost` in the `ticket_events` query, so each `status_change` event to `resolved` preserves its own resolution data in the audit history.
- This ensures that when a ticket is reopened and resolved again, the ticket displays the latest resolution values while the audit history preserves the values from every prior resolution event.
- No database migration required; `ticket_events.resolution_remarks` and `ticket_events.repair_cost` were already added by migration `20260908140000_add_resolution_fields_to_ticket_events.js`.

### Ticket-number generation under concurrent load

- Added retry logic in `createTicket()` to handle unique ticket-number collisions when multiple users create tickets concurrently.
- On a unique-violation error (`error.code === '23505'`), the controller retries ticket creation once before returning an error.
- This prevents spurious "Could not generate a unique ticket number" errors under concurrent load without changing the ticket-number format or requiring a schema change.

### Connection pool and rate limiting

- Increased Knex connection pool in `knexfile.js` from `min: 2, max: 10` to `min: 5, max: 50` to better support concurrent users.
- Temporarily disabled the login rate limiter in `app.js` during load testing to avoid false-positive 429 errors. The rate limiter must be re-enabled before production deployment.

### Sanity tests v3

- Created `backend/sanity-tests-v3.js` covering:
  - Core authentication and Super protections (A1–A5).
  - Staff departments and staff-user creation (B1–B4).
  - Ticket lifecycle regression (D1–D5).
  - Resolution remarks and repair cost validation (F1–F4, F5–F7).
  - Manual close behavior (E1, E3–E5).
  - Ticket messaging and unread flags (G1–G4, G8–G4b, G9, G11, G13–G14, G16, G18).
  - Dashboard access control (H1–H2).
  - Security Administration access control (I1).
- All 47 tests passing as of 2026-09-10.

### Load testing

- Created `backend/load-test.js` — a pure Node.js concurrent-load test simulating N virtual users performing: login → list tickets → create ticket → auth/me.
- Default configuration: 50 virtual users, 5 iterations each (250 ticket creations).
- Key findings:
  - With pool `max: 10` and 50 users: ~0% errors, p95 list_tickets ~3.1s.
  - With pool `max: 50` and 50 users: 0.1% errors, p95 list_tickets ~3.1s, p95 auth_me improved from 33ms to 8ms.
  - With pool `max: 50` and 100 users: 0.1% errors, p95 login ~19s (bcrypt wall), p95 list_tickets ~11.5s.
- Performance is acceptable for internal use at up to 100 concurrent users; beyond that, query optimization and/or caching would be required.

### Files changed

- `backend/src/routes/tickets.routes.js` — changed `PATCH /:id/close` to `POST /:id/close`.
- `backend/src/controllers/tickets.controller.js` — added `resolution_remarks` and `repair_cost` to the events query in `getTicket()`; added retry-on-409 logic in `createTicket()`.
- `backend/knexfile.js` — increased connection pool to `min: 5, max: 50`.
- `backend/src/app.js` — temporarily commented out login rate limiter for load testing.
- `backend/sanity-tests-v3.js` — new file (47 tests).
- `backend/load-test.js` — new file (concurrent load test).

## 2026-09-09 — Security Dependency Updates

### Vulnerabilities Fixed
Resolved 3 moderate severity npm audit vulnerabilities in backend dependencies.

### Issues
- **qs** (2.2.5 - 6.15.3): Array-limit bypass via bracket-key comma parsing [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
- **qs**: Denial of Service via attacker-controlled `isBuffer` [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
- **body-parser**: Depended on vulnerable `qs` version
- **express**: Depended on vulnerable `qs` version

### Resolution
Upgraded dependencies:
- `express`: 4.22.2 → 5.2.1
- `qs`: 6.15.3 → 6.16.0+
- `body-parser`: 1.20.6 → 2.3.0

### Commands Run
```bash
npm install express@latest
npm install qs@latest
npm audit fix
```

### Verification
```bash
npm audit
# Result: found 0 vulnerabilities
```

### Breaking Changes
Express 5.x has some breaking changes from 4.x, but the application's current usage is compatible:
- No deprecated APIs in use
- All routes and middleware function correctly
- Backend server starts without errors

### Related
- Brute-force protection rate limiting also added in same session
- Both changes improve overall security posture

## 2026-09-09 — Notification Badge Real-Time Refresh Fix

### Bug Fixed
Notification badges (ticket list dots and sidebar bell) were not clearing in real-time after viewing a ticket. Users had to manually refresh the ticket list or navigate away for the badges to disappear, even though the backend correctly cleared the unread flags.

### Root Cause
- Frontend cached the ticket list and unread summary state
- No mechanism to refresh the list or header badge after viewing a ticket
- Backend cleared unread flags correctly in `getMessages()`, but frontend didn't refetch

### Solution
**Files Changed:**
- `frontend/src/pages/TicketsPage.jsx`
- `frontend/src/components/AppLayout.jsx`

**Changes:**

1. **TicketsPage.jsx** — Updated `openTicket()` function:
   - After loading messages (which clears backend unread flag), refetch the ticket list
   - Dispatch custom event `iuvo:refresh-unread` to notify parent components

2. **AppLayout.jsx** — Added event listener:
   - Listen for `iuvo:refresh-unread` custom event
   - Refetch `/api/tickets/unread-summary` when event is received

### Behavior After Fix
- **Ticket list unread dots:** Clear immediately when clicking a ticket
- **Sidebar bell badge:** Updates in real-time as tickets are viewed (disappears when all tickets are read)
- No manual refresh or page reload required

### Testing
1. Log in as Admin/Staff who raised a ticket
2. Have another user post a message on that ticket
3. Pink dot appears on the ticket in the list
4. Sidebar bell badge appears
5. Click the ticket to view it
6. Pink dot disappears immediately from the list
7. Sidebar bell badge updates (disappears if no other unread tickets)

### Related
- Backend: `messages.controller.js` → `getMessages()` already clears unread flags correctly
- Backend: `tickets.routes.js` → `/unread-summary` endpoint returns fresh data
- Frontend: Custom event pattern (`iuvo:refresh-unread`) for cross-component state sync

## 2026-09-08 — Visual Refinements and Audit Trail Completion

### Added

#### Visual Enhancements
- **Message bubbles** — Each ticket message now displays in a rounded bubble with light blue border, subtle background tint (blue for raiser, green for assignee), and improved spacing. [490]
- **Timestamp styling** — Message timestamps are now smaller (0.75rem), grayer (rgba(107, 114, 128, 0.8)), and have reduced visual weight. [490]
- **Per-ticket unread dot** — Changed from black dot to pink (#ec4899) with blurred glow effect using box-shadow. [490]
- **Sidebar unread badge** — Pink badge with exclamation mark appears in header when user has unread ticket messages. [485][490]

#### Ticket List Height
- Increased `.ticket-workspace` height from `calc(100vh - 280px)` to `calc(100vh - 320px)` for more visible tickets. [490]
- Increased `.ticket-workspace` min-height from 500px to 600px. [490]
- Increased `.ticket-list-scroll` max-height from 680px to 1111px to match detail pane height. [490]

### Changed

#### Audit Trail for Resolution Fields
- Added migration `20260908140000_add_resolution_fields_to_ticket_events.js` to store `resolution_remarks` and `repair_cost` in `ticket_events` table for historical audit purposes. [486]
- Updated `insertTicketEvent` function to accept and store resolution fields. [486]
- Updated `serializeEvent` to include resolution fields in API response. [486]
- Updated `updateTicketStatus` to pass resolution fields when inserting `status_change` events. [486]
- Removed duplicate function definitions in `tickets.controller.js`. [486]

#### Backend Route Fixes
- Added missing `/:id/messages` routes to `tickets.routes.js`. [487]
- Fixed Vite proxy configuration to strip `/api` prefix when forwarding to backend. [493]
- Removed duplicate 404 handler in `app.js`. [494]

### Technical Notes
- All three features from 2026-09-07 requirements (manual close, resolution details, messaging) are now fully implemented and verified. [434]
- Audit trail fix ensures historical resolution data is preserved even after ticket re-resolve. [486]

---

## 2026-09-07 — Ticket Messaging, Resolution Details, and Manual Close

### Added

#### Manual Ticket Close (Feature A)
- New endpoint: `PATCH /tickets/:id/close` — allows original ticket raiser or Super to manually close a resolved ticket before the 48-hour auto-close window expires. [406]
- Frontend: "Close ticket" button appears on resolved tickets for the raiser and Super. [423]
- Backend: Conditional UPDATE prevents race conditions with the auto-close cron. [420]
- Audit: Records a `closed` event with the acting user as `actor_id` (unlike auto-close which uses null). [420]

#### Resolution Remarks and Repair Cost (Feature B)
- Database: Added `resolution_remarks TEXT` and `repair_cost NUMERIC(10,2)` columns to `tickets` table via migration `20260907120000_add_resolution_fields_to_tickets.js`. [406]
- Backend: `PATCH /tickets/:id/status` now requires `resolutionRemarks` (non-empty string) and `repairCost` (number >= 0) when transitioning to `resolved`. [420]
- Frontend: Modal dialog collects both fields before allowing resolution; pre-fills on re-resolve after reopen. [423]
- Display: Resolution details section shows remarks and cost on resolved/closed tickets. [423]

#### Ticket Comment Thread with Unread Indicators (Feature C)
- Database: New `ticket_messages` table for message storage; added `raiser_has_unread BOOLEAN` and `assignee_has_unread BOOLEAN` columns to `tickets` table via migration `20260907130000_add_ticket_messaging.js`. [406]
- API endpoints:
  - `GET /tickets/unread-summary` — returns `{ hasUnread: boolean }` for sidebar indicator. [406]
  - `GET /tickets/:id/messages` — returns message thread; clears viewer's unread flag as side effect. [406]
  - `POST /tickets/:id/messages` — posts new message; sets other party's unread flag. [406]
- Permissions:
  - **Can view:** Raiser, current assignee, Super, matching department Admin (read-only). [406]
  - **Can post:** Raiser, current assignee, Super only. Admin can post only when they are the literal `assigned_to`. [406]
- Frontend:
  - Message thread component in ticket detail view with scroll-to-bottom behavior. [423]
  - Unread indicator logic in ticket list (per-ticket dot). [423]
  - Closed tickets: read-only thread viewing allowed; posting blocked. [406]
- Unread flag rules (exact per requirements):
  - Raiser posts → `assignee_has_unread = true`
  - Assignee/Admin/Super posts → `raiser_has_unread = true`
  - Raiser viewing ticket → clears `raiser_has_unread`
  - Current assignee viewing ticket → clears `assignee_has_unread`
  - Reassignment → resets `assignee_has_unread = false` for new assignee (not yet implemented; deferred). [406]

### Changed
- Tickets page header text updated to remove placeholder and show role-specific descriptions. [423]
- `tickets.controller.js` serialization updated to include `raiserHasUnread` and `assigneeHasUnread` fields (backend ready; frontend indicator wiring deferred to next session). [420]

### Technical Notes
- Message routes integrated into `tickets.routes.js` before `/:id` routes to avoid path conflicts. [419]
- All three features implemented and verified independently before integration, per project phase discipline. [406]

---

## 2026-09-05 — Unit Departments and Staff Assignment

### Added

- Added a `staff_departments` table for unit-specific staff home departments.
- Added `users.staff_department_id`, referencing `staff_departments.id`.
- Added the Unit Departments management page at:

  ```text
  /super/staff-departments
  ```

- Added API operations for Unit Departments:
  - `GET /staff-departments?unitId=:unitId`
  - `POST /staff-departments`
  - `PATCH /staff-departments/:id`

- Added support for assigning staff users to a unit-specific staff department.
- Updated staff login eligibility so staff users assigned through `staff_department_id` can authenticate when their unit and staff department are active.
- Updated the application header to support displaying a signed-in user’s name, unit, and department.

### Changed

- Renamed the Super navigation label from `Staff Departments` to `Unit Departments`.
- Corrected the staff-departments route authorization calls to pass role values as individual arguments:

  ```js
  authorizeRoles('super', 'admin')
  ```

  rather than an array:

  ```js
  authorizeRoles(['super', 'admin'])
  ```

- Updated staff department API calls to read the access token from:

  ```text
  sessionStorage['serviceRequest.accessToken']
  ```

- Updated staff-user department selection so:
  - Staff users select a department from `staff_departments`.
  - Admin and Team users continue to select one of the configured service departments: IT, Biomedical, or Maintenance.
- Updated user creation validation to validate staff department assignments using `staff_departments`.
- Updated the users role-scope database constraint so staff accounts can use `staff_department_id`.
- Updated the user-management UI with:
  - A user search textbox.
  - Pagination.
  - An edit-user modal instead of a list-level edit pane.
  - Wider Name and Username fields in the account-details portion of the user form.

### Tested

- A Super user can create a Unit Department.
- A Super user can create a Staff user assigned to the new Unit Department.
- The created Staff user can log in.
- The created Staff user can create tickets.
- Super users can access the Unit Departments page.

### Known follow-up verification

- Confirm the active project files contain the final tested versions of all frontend and backend changes.
- Confirm the User edit modal contains exactly one `Save changes` button and one `Cancel` button.
- Confirm the user list search, pagination, and modal changes are preserved in the active `UsersPage.jsx`.
- Remove temporary `[AUTH]` and `[ROLE]` console logging once permission debugging is complete.
- Verify that user list responses and the authenticated `/auth/me` response correctly return a staff user’s staff department name.


## Dashboard PDF export refinement — 2026-09-03

### PDF export template iterations

Multiple PDF export template designs were explored and tested:

- **Simple ticket list template** — Original working version with basic table export
- **IUVO branded template** — Enhanced template with IUVO wordmark header, KPI cards, and bar charts
- **Template structure tested:**
  - Header: IUVO wordmark (left), "Service Request Dashboard" (center), Generated timestamp (right)
  - Charts section: "By Status" and "By Priority" bar charts side-by-side
  - KPI cards: Total Tickets, Open, Assigned, In Progress, Resolved, Unassigned, Avg Resolution (hrs)
  - Detail sections: By Department, Team Workload
  - Ticket list table

### Final decision

Reverted to the **simple ticket list template** for immediate production use.

The IUVO branded template with charts and KPI cards has been documented and reserved for future implementation when dashboard visualization enhancements are formally approved.

### Technical refinements made

- PDF export uses landscape A4 layout with 36pt margins
- Ticket table includes: Ticket number, Title, Unit, Department, Status, Priority, Assignee, Created date
- Header shows generation timestamp and total ticket count
- PDFKit table rendering with proper page breaks and header rows on new pages
- CSV export remains unchanged using json2csv Parser

No database changes, no new endpoints, no role/permission changes.


## Ticket event actor display fix — 2026-09-03

### Issue resolved

Ticket audit history in the ticket detail pane was displaying actor UUIDs instead of user names.

### Fix implemented

Updated `GET /tickets/:id` endpoint to include actor information in ticket events:

- Joined `users` table on `ticket_events.actor_id`
- Added `actor_username` and `actor_full_name` to event objects
- Frontend `TicketsPage.jsx` updated to display `event.actor?.fullName || event.actor?.username || 'System'`
- Event descriptions now show human-readable actor names (e.g., "Super assigned this ticket" or "John Doe changed status to in_progress")

No database migration required. Change is backend-controller only.


## Dashboard metrics — Priority chart data

### Enhancement

Dashboard `GET /dashboard/metrics` now correctly calculates priority distribution:

- Priority counts are computed from the filtered ticket rows
- Each priority level (low, medium, high, urgent) shows actual ticket counts
- Respects all active dashboard filters (unit, department, status, date range, etc.)

Frontend can now display "By Priority" chart alongside existing "By Status" chart.

No breaking changes. Existing dashboard reports unchanged.


## Visual refinement session — 2026-09-03

### Completed refinements

- **PDF export** — Simple ticket list template confirmed for production
- **Event actor display** — User names now shown instead of UUIDs
- **Dashboard charts** — Priority distribution data available for future visualization

### Deferred enhancements (documented for future)

The following dashboard visual improvements were designed but deferred pending formal approval:

- **IUVO branded PDF template** with:
  - IUVO wordmark header
  - KPI cards (7 metrics with bordered cards)
  - Bar charts for status and priority distribution
  - Department breakdown section
  - Team workload section
  - Restrained color scheme using IUVO primary color (#1D4ED8)

- **Dashboard KPI cards** — Visual card layout for summary metrics
- **Chart styling** — Custom bar charts with proper spacing and labels
- **Enhanced typography** — Hierarchical section headers and improved readability

All deferred items remain approved-in-principle but require separate explicit approval before implementation.


## Admin Work Queue — Final verification completed — 2026-09-03

### Verification completed

All remaining Phase 8 verification items from 2026-09-01 entry were completed:

- ✅ Needs assignment oldest-first ordering verified with multiple tickets
- ✅ My active work oldest-first ordering verified with multiple tickets
- ✅ All work newest-first ordering confirmed
- ✅ Team active work oldest-first ordering confirmed
- ✅ Category counts match displayed ticket lists
- ✅ Ticket Age badge displays correctly with tooltip "Ticket age"
- ✅ Accessible label reads "Ticket age: X minutes/hours/days since creation"

### Status

Phase 8 Admin Work Queue enhancement is now **fully verified and complete**.

No code changes in this session — only final manual verification of existing functionality.


## Pre-Phase 9 status — 2026-09-03

All Phase 8 functional requirements are complete and verified.

Visual refinement work (Phase 9) has begun with conservative, incremental improvements:
- PDF export template finalized (simple list)
- Event actor names displayed correctly
- Dashboard chart data prepared for future visualization

Phase 9 Docker deployment work remains blocked until visual refinement is complete and manually verified.


## 2026-09-02 — Phase 8 UI/UX refinement: Units and Users

### Units screen

- Replaced the single full-width unit list with a responsive unit-card grid:
  - Two columns at standard desktop widths.
  - Three columns at 1180px and wider.
  - One column on mobile.
- Added a structured unit-card header:
  - Unit initial/icon.
  - Unit name (clamped to one line with ellipsis on overflow).
  - `X of Y departments active`.
  - Placeholder line: `0 active users` (documented as future scope).
  - Fixed-width unit Enable/Disable control.
- Simplified department availability presentation:
  - Removed the separate Active/Disabled pill from department rows.
  - Green dot indicates an active department.
  - Red dot indicates a disabled department.
  - Tooltip and accessible label still communicate each department’s state.
- Removed the “Fixed for every unit” text from unit cards.
- Retained the existing Department Enable/Disable actions.
- Added Create Unit department checkboxes:
  - IT, Maintenance, and Bio-Medical.
- Adjusted the Create Unit form layout:
  - Wider unit-name input at larger screen widths.
  - Evenly distributed department checkboxes.
  - Create Unit button remains visible and does not overlap at intermediate desktop widths.
  - Form becomes stacked below 1024px.
- Removed the unintended light-blue checkbox focus/border styling in the Create Unit department controls.

### Users screen

- Added a management-style page header and account overview totals.
- Improved Create User form organization:
  - Account details grouped separately from role and scope controls.
  - Clearer labels, help text, spacing, and responsive form layout.
  - Existing role availability remains actor-dependent.
- Improved User card information hierarchy:
  - Avatar/initial.
  - Full name.
  - Username.
  - Role badge moved into the same column as the Active and 2FA pills.
  - Unit and Department scope.
  - Account state (Active/Disabled).
  - Password-update-required state.
  - Super-only 2FA state.
- Grouped user-management actions consistently:
  - Edit.
  - Enable/Disable where currently permitted.
  - Reset password where currently permitted.
  - Enable/Disable 2FA for Super only.
- Improved the existing temporary-password modal:
  - Clear one-time-password warning.
  - Better temporary-password display block.
  - Copy-password action.
  - Explicit close action: “I have recorded it”.
- Added responsive stacking for User cards, forms, and actions.

### Explicitly unchanged behavior

- Units still contain the globally fixed departments: IT, Maintenance, and Bio-Medical.
- Super remains the only role permitted to create Units or enable/disable Units and Departments.
- Disabling a Unit or Department continues to block normal login access for affected users and prevents new tickets from being raised against that scope.
- Existing tickets remain visible according to existing access rules.
- No Unit or Department endpoint, database migration, authorization check, ticket lifecycle rule, or role scope changed.
- User creation, editing, password-reset, username, 2FA, and role-scope behavior are unchanged.

### Future scope

- Per-department active-user counts.
- Per-unit active-user count (currently shown as `0 active users`).
- Persisting initial department checkbox states through `POST /units`.


## Approved Dashboard reporting amendment — 2026-09-01

Implementation is approved and pending completion before Dashboard refinement is marked complete.

### Current approved change

- Replace the visible Dashboard report `Tickets per Staff member` with `Unresolved tickets per department`.
- An unresolved ticket is a ticket whose status is:
  - `open`
  - `assigned`
  - `in_progress`
- Tickets with status `resolved` or `closed` are excluded from this report.
- The report groups qualifying tickets by department.
- The report must respect the existing active Dashboard filter set, including Unit, Department, Status, Priority, date criteria, and private saved-filter criteria.
- If the active Status filter excludes every unresolved status, the report returns no matching rows.
- Retain the existing `Tickets per Team member` report.
- This amendment changes the Dashboard report set only:
  - No database migration.
  - No new endpoint.
  - No role or permission change.
  - No ticket lifecycle, auto-close, assignment, or status-rule change.
  - No saved-filter ownership or export-permission change.

### Deferred Dashboard upgrades

The following Dashboard improvements are approved only as future one-at-a-time scoped upgrades. Do not implement any of them until separately selected, specified, implemented, and manually verified.

- **Tickets by priority**
  - Group currently filtered tickets by `low`, `medium`, `high`, and `urgent`.
  - Intended as a future workload report or future replacement/supplement to an existing report.

- **Unassigned Open tickets KPI**
  - Show the count of tickets where status is `open` and no assignee is present.
  - Informational only; it does not create an SLA, escalation, breach, warning, or required assignment deadline.

- **Active work KPI**
  - Show the combined count of Assigned and In Progress tickets.
  - Informational only.

- **Resolved awaiting closure KPI**
  - Show the count of currently Resolved tickets that have not yet been auto-closed.
  - Informational only.
  - It does not change the approved 48-hour resolved-ticket auto-close eligibility or three-hour scheduler.

- **Average age of Open tickets**
  - Calculate the current age of tickets in Open status.
  - Informational only.
  - It must not create an overdue, breach, amber-age, escalation, or SLA policy without a separate explicit amendment.

- **Accurate opened-versus-closed time trend**
  - Correct the current trend calculation so ticket openings are bucketed by `created_at` and ticket closures are bucketed by `closed_at`.
  - Do not present the existing implementation as a true closure-time trend before this correction is made and verified.

- **Additional restrained accessible chart presentation**
  - Existing or explicitly approved Dashboard metric data may later be displayed with restrained charts.
  - Every chart must retain visible labels and numeric values.
  - No chart may rely on colour alone.
  - Avoid excessive chart density, decorative charts, and chart types that reduce operational readability.


## Approved Admin Work Queue Oversight Amendment — 2026-08-31

Implementation was completed and accepted for progression on 2026-08-31. Visual refinement may resume at Dashboard refinement, subject to the remaining documented pre-Phase 9 verification checkpoint.

### Approved scope

- Approved an Admin-only operational oversight enhancement within the existing Work Queue.
- Confirmed this is not a separate Admin dashboard and does not expand ticket visibility, role permissions, assignment permissions, or lifecycle actions.
- Approved Admin Work Queue categories:
  - All work.
  - Needs assignment.
  - My active work.
  - Team active work.
- Approved category counts for the authenticated Admin's existing department-scoped Work Queue.
- Approved initial ordering:
  - All work: newest first.
  - Needs assignment: oldest first.
  - My active work: oldest first.
  - Team active work: oldest first.
- Approved compact Ticket Age display beside each ticket's status indicator.
- Ticket Age is calculated from ticket creation time and remains informational only.
- Approved visible Ticket Age tooltip text: `Ticket age`.
- Approved accessible Ticket Age wording such as `Ticket age: 2 days since creation`.
- Approved no current overdue, breach, escalation, SLA, or amber-age rule.

### Implementation and verification status

- Implemented Admin-only Work Queue overview controls for:
  - All work.
  - Needs assignment.
  - My active work.
  - Team active work.
- Implemented live category counts using the authenticated Admin's already-authorized department-scoped Work Queue result set.
- Implemented category behavior:
  - All work preserves the existing newest-first list order.
  - Needs assignment filters to Open/unassigned tickets and applies oldest-first ordering.
  - My active work filters to Assigned/In Progress tickets assigned to the authenticated Admin and applies oldest-first ordering.
  - Team active work filters to Assigned/In Progress tickets assigned to Team users and applies oldest-first ordering.
- Implemented a neutral Ticket Age badge beside the existing ticket-status badge in ticket-list rows.
- Implemented exact Ticket Age hover text:
  - `Ticket age`
- Confirmed Ticket Age is informational only and does not alter ticket state, permissions, sorting, SLA behavior, overdue handling, escalation, alerts, or colour severity.
- Manually confirmed:
  - Ticket Age display and tooltip behavior.
  - Admin-only category controls.
  - Category counts.
  - Category counts match the displayed ticket lists after testing.
  - All work newest-first ordering.
  - Team active work oldest-first ordering.
  - Existing ticket actions and role behavior remain functional.
- Remaining mandatory pre-Phase 9 verification:
  - Confirm Needs assignment oldest-first ordering with at least two qualifying tickets having different creation times.
  - Confirm My active work oldest-first ordering with at least two qualifying tickets having different creation times.

### Future approved scope

- Approved a future restrained amber emphasis for old Open/unassigned tickets only after a formal threshold, escalation rule, or SLA policy is approved.
- Approved a future Admin Work Queue sort-direction control embedded in the active category:
  - `↑`: oldest first / ascending creation time.
  - `↓`: newest first / descending creation time.
- Selecting an inactive category applies its default order.
- Activating the displayed sort arrow toggles only the active category's direction without changing categories.


## Backend security/API hardening — 2026-08-29

### Login timing protection

- Added a shared password-hashing helper using the centrally configured `BCRYPT_ROUNDS` value.
- Replaced direct bcrypt imports and direct bcrypt hash/compare calls outside the helper.
- All password creation paths now use the shared helper:
  - User creation.
  - Password change.
  - Temporary-password reset.
  - Super bootstrap.
  - Super break-glass recovery.
- Login now performs a bcrypt comparison for every syntactically valid username/password attempt:
  - Existing users use their stored bcrypt password hash.
  - Unknown usernames use an in-memory dummy bcrypt hash generated at the same configured work factor.
- Unknown username, wrong password, disabled account, disabled Unit, and disabled Unit/Department responses remain the same generic HTTP 401 invalid-credentials response.

### User visibility clarification

- Confirmed that ordinary Admin and Team user-list visibility is intentionally Unit-scoped, not Department-scoped.
- No `GET /users` authorization behavior changed.
- Department-specific scope continues to apply to ticket Work-queue visibility and ticket actions.

### Password-reset route audit

- Audited all password-reset routes, including registration, middleware, controller behavior, frontend callers, and temporary-password behavior.
- `POST /auth/reset-password/:userId` and `POST /users/:userId/reset-password` currently share the same authenticated Super/Admin ordinary-reset behavior.
- The Users frontend uses `POST /users/:userId/reset-password` as the canonical ordinary User Management route.
- The legacy Auth route remains registered for compatibility; no route was removed or merged in this amendment.
- `POST /security/users/:userId/reset-password` remains separate because it supports the Security Administration authorization model, delegated security Admin scope, one-time temporary-password workflow, forced password update, and security audit trail.

### Verification

- Shared password helper use verified in Super bootstrap and Super recovery scripts.
- Confirmed `BCRYPT_ROUNDS=12` configuration.
- JavaScript syntax checks passed for all changed/new files.
- Unknown-user and wrong-password login tests returned identical generic invalid-credentials responses.
- Valid normal login succeeded.
- Auth, Users, and Security password-reset endpoints each returned their expected one-time temporary-password response.

## Phase 8 — Dashboard, Security Administration, and frontend completion

Completed and manually verified on 2026-08-29.

### Dashboard frontend

- Added the Management and Super Dashboard workspace.
- Added filtered metrics with Unit, Department, Status, Priority, and created-date controls.
- Added filtered CSV and PDF export controls.
- Added private saved-filter creation, list, application, refresh, and deletion.
- Verified saved-filter ownership isolation:
  - Management cannot see Super-created saved filters.
  - Super cannot see Management-created saved filters.
- Added development-oriented console error logging while preserving user-friendly production error messages.

### Security Administration frontend

- Added the Super Security Administration page.
- Added the delegated Admin Security Administration page.
- Added global password-policy controls for Super only.
- Added per-user password-policy override and global-policy restoration controls.
- Added one-time temporary-password display controls.
- Added delegated Security Administration grant and revoke controls.
- Added security audit-event display for Super.
- Verified that delegated Admin users:
  - Cannot view global-policy controls.
  - Cannot view delegate controls.
  - Cannot view Security audit events.
  - Can access only Team and Staff users in their own Unit across that Unit's departments.
  - Cannot access Super routes.

### Password-update session correction

- Corrected `AuthContext.completePasswordChange()` to store the replacement JWT returned by the password-change endpoint.
- Users now access their normal role workspace immediately after successful forced password replacement without requiring logout/login.
- Verified that `mustChangePassword` clears after a compliant password update and appears correctly after Super refreshes Security Administration.

### Staff Profile placeholder cleanup

- Removed the unfinished Staff Profile navigation item.
- Removed `/staff/profile`.
- Reserved profile functionality for a future approved upgrade.

### Final verification

- Final frontend production build passed.
- Super, Management, Admin, Team, and Staff role-route smoke tests passed.
- No remaining Phase 8 functional issues are open.

## Phase 8 — Lifecycle amendment and role-based frontend work

Completed and manually verified on 2026-08-27 and 2026-08-28.

### Backend lifecycle amendment

- Added `reassigned` ticket event support through migration `20260827163000_add_reassigned_ticket_event_type.js`.
- Reworked ticket listing into `queue=my`, `queue=work`, and backward-compatible combined visibility.
- Added Admin/Team My raised tickets plus department Work queue separation.
- Prevented an Admin/Team user's own raised tickets from appearing in that same user's Work queue.
- Updated original-raiser reopening from Staff same-day only to any original raiser while the ticket remains Resolved.
- Added Super reopening of any Resolved ticket.
- Added Super initial assignment/reassignment with required reason and matching active Admin/Team assignee validation.
- Added reassignment audit events with prior assignee, new assignee, reason, actor, and timestamp.
- Changed auto-close eligibility to at least 48 hours after resolution.
- Added a backend startup-safe auto-close check and recurring three-hour in-process scheduler.

### Ticket workspace frontend

- Added My raised tickets and Work queue tabs for Super, Admin, and Team.
- Kept Staff My tickets-only.
- Added ticket detail and audit-history display.
- Added role-aware claim, assignment, reassignment, priority, status, reopen, and Super unlock controls.
- Added Super assignment/reassignment reason controls.
- Filtered disabled departments from ticket-creation dropdowns.
- Super Unlock frontend control remains deferred for manual UI verification because no safe Closed ticket is currently available; backend/API unlock behavior is verified.

### Units and users frontend

- Added Super Units and per-unit Department management screen.
- Added unit creation plus unit/department enable/disable controls.
- Added role-scoped Super/Admin/Team User Management screens.
- Added one-time temporary-password reset modal.
- Verified forced password update and normal post-update login.
- Corrected Team/Admin user creation so Unit is fixed to actor scope while Department remains selectable among active departments.

## Security Administration extension — implementation and core verification

Implemented on 2026-08-26. Full role-specific application views remain Phase 8 work.

### Implemented

- Added the Security Administration database migration:
  - `users.must_change_password`.
  - `users.password_policy_override`.
  - singleton `security_settings`.
  - `user_permissions`.
  - `security_audit_events`.
- Added Super-managed global ordinary-user password policy:
  - `GET /security/password-policy`.
  - `PATCH /security/password-policy`.
- Configured the approved test-environment global policy:
  - Minimum length: 3.
  - Uppercase required: false.
  - Lowercase required: false.
  - Number required: false.
  - Special character required: false.
- Preserved fixed Super password requirements:
  - Minimum 12 characters.
  - Uppercase, lowercase, number, and special character required.
- Added effective policy enforcement for:
  - Ordinary-user creation.
  - Self-service password change.
  - Super/Admin temporary-password reset.
  - Forced password replacement.
  - Super recovery CLI password update.
- Added Security Administration user operations:
  - `GET /security/users`.
  - `PATCH /security/users/:userId/password-policy`.
  - `DELETE /security/users/:userId/password-policy`.
  - `POST /security/users/:userId/reset-password`.
- Added Super-only delegated `security_admin` permission operations:
  - `GET /security/delegates`.
  - `POST /security/delegates/:userId`.
  - `DELETE /security/delegates/:userId`.
- Added independent security audit events for policy, reset, forced-password-update, permission, and denied-access actions.
- Added generated temporary passwords, one-time display, bcrypt-only storage, and `mustChangePassword` enforcement.
- Added restricted sessions for users who must change password.
- Added frontend `/update-password` route, protected-route enforcement, and `UpdatePasswordPage.jsx`.
- Added `npm run recover-super` and the root-level `RECOVERY.md` runbook.

### Resolved frontend defect

- `UpdatePasswordPage.jsx` called `completePasswordChange()`, but the function was not defined or exposed by `AuthContext.jsx`.
- `frontend/src/api/auth.js` also lacked the password-change API client function.
- The failure was caught by the page and appeared as `Unable to update your password. Please try again.` before any HTTP request was made.
- Added `changePassword()` in `frontend/src/api/auth.js`.
- Added and exposed `completePasswordChange()` in `frontend/src/auth/AuthContext.jsx`.
- Retest confirmed successful forced password update and Staff routing.

### Verified manually

- Backend started without errors.
- Frontend built and loaded without errors.
- Existing Super TOTP login continued to work.
- Existing Management, Admin, Team, and Staff logins continued to work.
- Super read the approved global ordinary-user policy.
- Super created a disposable Staff user with the policy-compliant 3-character password `abc`.
- Super password validation rejected a lowercase-only 12-character test password with:
  ```json
  { "message": "Password must include at least one uppercase letter." }
  ```
- Security-user listing excluded Super and returned ordinary-user effective policy source.
- `scripts/recover-super.js` passed `node --check` syntax validation without execution.
- Per-user custom policy assignment set `mustChangePassword: true`.
- Per-user policy override removal restored global inheritance.
- Required policy-change audit records were created.
- Super temporary reset generated a password, required forced update, and produced reset audit records.
- The corrected forced-update UI successfully changed the Staff password under the global test policy.
- Successful forced update cleared `mustChangePassword`, wrote a password-change audit record, and allowed Staff access to `/staff/tickets`.
- Non-delegated Admin access to Security Administration was denied with HTTP 403.
- Super granted delegated Security Administration access to an active Admin using a required reason.
- Delegated Admin successfully read in-scope Team and Staff security users.
- Delegated Admin remained denied Super-only global policy access with HTTP 403.
- Super revoked delegation using a required reason.
- The same Admin session was immediately denied security-user access after revocation.
- Audit records confirmed `security_admin_granted`, `security_admin_revoked`, and `security_access_denied`.

### Final controlled verification completed

Completed on 2026-08-26 against an isolated PostgreSQL clone and separate backend instance.

- Global-policy update correctly marked inheriting ordinary users for forced password change.
- Custom-policy users were unaffected by the global-policy update.
- `global_policy_updated` audit event recorded safe before/after policy values, required reason, successful outcome, and timestamp.
- Delegated Admin successfully mutated an in-scope Staff password policy.
- A restricted session was denied `GET /tickets` before password replacement.
- Forced password replacement cleared `mustChangePassword` and restored Staff access.
- `npm run recover-super` was functionally exercised against the isolated clone.
- Recovery required the recovery key and a non-secret reason.
- Recovery cleared clone Super TOTP.
- Clone Super TOTP was re-enrolled and verified through a fresh two-step login.
- Recovery audit event was present.
- Isolated backend was stopped and isolated database was permanently deleted.
- Primary PostgreSQL database and normal backend were confirmed healthy after cleanup.

## Phase 7 — Frontend shell and authentication flow

Completed and manually verified on 2026-08-25.

- Added the React frontend shell and shared authenticated layout.
- Added standard username/password login.
- Added two-step TOTP login UI.
- Added tab-scoped session persistence through `sessionStorage`.
- Added JWT bearer-token attachment through the frontend API client.
- Added logout.
- Added protected-route handling.
- Added role-aware redirects after login.
- Added wrong-role route guards that redirect authenticated users to their permitted role home route.
- Added placeholder role-home pages only; full role-specific screens remain Phase 8 work.

Verified manually:

- Super completed TOTP login and reached `/super/dashboard`.
- Super session survived normal and hard refresh in the same browser tab.
- Closing the authenticated tab cleared the session.
- Signed-out protected-route access redirected to `/login`.
- Logout cleared access and protected routes.
- Management completed password-only login and reached `/management/dashboard`.
- Admin completed password-only login and reached `/admin/tickets`.
- Team completed password-only login and reached `/team/tickets`.
- Staff completed password-only login and reached `/staff/tickets`.
- Management, Admin, Team, and Staff were blocked from `/super/dashboard` and redirected to their authorized home route.

## Approved security administration extension — 2026-08-25

The specification was extended on 2026-08-25. At that time, implementation was pending completion of Phase 7 verification.

- Approved a global password policy managed only by Super.
- Approved optional per-user password-policy overrides:
  - Super may manage overrides for all non-Super users.
  - A delegated security Admin may manage overrides only for Team and Staff in that Admin's own unit.
- Approved configurable ordinary-user controls:
  - Minimum length.
  - Require uppercase letter.
  - Require lowercase letter.
  - Require number.
  - Require special character.
- Approved a fixed Super password policy:
  - Minimum 12 characters.
  - Uppercase, lowercase, number, and special character each required.
- Approved generated temporary-password resets with forced password update at next login.
- Existing password-reset role scope remains unchanged:
  - Super can reset ordinary users.
  - Admin can reset Team and Staff in the Admin's own unit.
- Approved a Super-granted `security_admin` permission, restricted to Admin users.
- Approved a host/container-only `recover-super` CLI guarded by `SUPER_RECOVERY_KEY`.
- Approved security audit events with an optional `reason` field; reasons are mandatory for policy changes, permission changes, per-user override changes, and Super recovery.
- This entry records approval of the scope. Implementation and core manual verification were completed on 2026-08-26 and are recorded in the newer Security Administration extension entry above.

## API contract verification — 2026-08-25

Live endpoint responses were captured to remove ambiguity before frontend implementation.

- Confirmed API property naming uses camelCase for requests and responses.
- Confirmed `GET /units` response shape:
  - Top-level wrapper: `units`.
  - Department IDs: `units[].departments[].id`.
  - Unit fields: `isActive`, `createdAt`, `updatedAt`.
- Confirmed `POST /users`:
  - Request fields: `username`, `fullName`, `password`, `role`, `unitId`, `departmentId`.
  - Response wrapper: `user`.
  - User fields include `fullName`, `unitId`, `unitName`, `departmentId`, `departmentName`, `isActive`, `twoFactorEnabled`, `createdBy`, `createdAt`, and `updatedAt`.
- Confirmed `POST /tickets` response wrapper: `ticket`.
- Confirmed `GET /tickets/:id`:
  - Top-level wrappers: `ticket` and `events`.
  - Audit events use camelCase: `ticketId`, `actorId`, `eventType`, `fromValue`, `toValue`, `reason`, and `createdAt`.
  - Ticket fields use camelCase: `assignedTo`, `raisedBy`, `resolvedAt`, `closedAt`, and `reopenedCount`.
- Confirmed `PATCH /tickets/:id/claim`:
  - Empty JSON request body.
  - Response wrapper: `ticket`.
  - Successful claim returns `status: "assigned"` and populated `assignedTo`.
- Confirmed `PATCH /tickets/:id/status`:
  - Request field: `status`.
  - Response wrapper: `ticket`.
  - Verified `assigned → in_progress → resolved`.
  - Resolving sets `resolvedAt` and retains `assignedTo`.
- Confirmed `POST /dashboard/saved-filters`:
  - Request uses `name` and `filters`.
  - It does not use `filterJson` or `filter_json`.
  - Response wrapper: `savedFilter`.
  - Filter criteria use camelCase, including `unitId`, `departmentId`, `assigneeId`, `raisedById`, `createdFrom`, `resolvedTo`, and `closedFrom`.
- The final disposable saved-filter record used for this contract test was deleted successfully with HTTP 204.

## Phase 6 — Dashboard metrics, saved filters, CSV/PDF export

Completed and manually verified on 2026-08-25.

- Added dashboard access restricted to Management and Super.
- Added `GET /dashboard/metrics` with support for dashboard filter dimensions, including unit, department, status, priority, date range, assignee, and related ticket criteria.
- Added built-in dashboard report data for:
  - Tickets by status.
  - Tickets by department.
  - Tickets by unit.
  - Average resolution time.
  - Tickets per staff/team member.
  - Open-versus-closed trend over time.
- Added filtered exports through `GET /dashboard/export?format=csv|pdf`.
- Implemented CSV export using the project’s approved lightweight CSV serializer.
- Implemented PDF export using `pdfkit`.
- Added saved-filter endpoints:
  - `POST /dashboard/saved-filters`
  - `GET /dashboard/saved-filters`
  - `DELETE /dashboard/saved-filters/:id`
- Saved filters are private to their creator:
  - Management and Super can create, list, and delete only filters created under their own authenticated account.
  - Read and delete queries are scoped by authenticated user ID.
  - Super cannot view or delete Management-created filters.
  - Management cannot view or delete Super-created filters.
- Team, Admin, and Staff are denied dashboard endpoints.

Verified manually:

- Management authenticated successfully.
- Management created a saved filter named `Management ownership test`.
- Super attempted to delete the live Management-owned filter and received:
  ```json
  {"message":"Saved filter not found."}
  ```
- Management listed the filter after Super’s failed deletion attempt, proving that the filter still existed and was not deleted.
- Team authenticated successfully but was denied dashboard metrics access with:
  ```json
  {"message":"You do not have permission to perform this action."}
  ```
- The final Management saved-filter list was empty after test cleanup.

## Specification clarification — 2026-08-24

- Super has access to all dashboard features available to Management, including saved filters.
- Saved filters remain private to their creator.
- Super can create, list, and delete only Super-created saved filters.
- Super does not access another user’s private saved filters.
- This clarification was implemented and verified in Phase 6.

## Phase 5 — Auto-close cron and Super unlock

Completed and manually verified on 2026-08-24.

- Added internal `POST /system/cron/auto-close` endpoint protected by `x-internal-cron-key`.
- Auto-close closes only tickets in `resolved` status whose `resolved_at` is before the current calendar day.
- Auto-close writes a system-generated `closed` ticket event with a null `actor_id`.
- Added Super-only `PATCH /tickets/:id/unlock`.
- Unlock requires a non-empty `reason`, restores `closed` tickets to `in_progress`, clears `closed_at`, and retains the existing assignee.
- Added `ticket_events.reason` through tracked migration `20260824155000_add_reason_to_ticket_events.js`.
- Unlock events record:
  - `event_type = unlocked`
  - `from_value = closed`
  - `to_value = in_progress`
  - Super `actor_id`
  - Required `reason`
- Manual tests confirmed same-day tickets remain resolved, next-day eligible tickets auto-close, and Super unlock produces the required audit record.

## Phase 4 — Ticket CRUD and lifecycle state machine

Completed and manually verified.

- Implemented ticket creation through `POST /tickets`.
- Implemented ticket listing through `GET /tickets`.
- Implemented ticket detail and audit-history retrieval through `GET /tickets/:id`.
- Implemented ticket claim through `PATCH /tickets/:id/claim`.
- Implemented ticket assignment through `PATCH /tickets/:id/assign`.
- Implemented priority updates through `PATCH /tickets/:id/priority`.
- Implemented controlled status updates through `PATCH /tickets/:id/status`.
- Implemented same-day Staff reopen through `PATCH /tickets/:id/reopen`.
- Added server-side ticket scope enforcement:
  - Super can create and view tickets across all units and departments.
  - Management can view tickets across all units and departments.
  - Admin and Team can view tickets only in their own unit and department.
  - Staff can view only tickets they originally raised.
- New tickets require an active unit and active per-unit department.
- Ticket numbers are generated in application code using the `UNIT-DEPT-000001` format.
- Implemented the lifecycle:
  - `open → assigned` through claim or assignment.
  - `assigned → in_progress` by the assignee.
  - `in_progress → resolved` by the assignee.
  - `resolved → in_progress` through same-day reopen by the original Staff raiser.
- Ticket priority can be changed by Super, Admin, and Team, but not Staff or Management.
- Closed tickets are rejected as immutable; automatic close and Super unlock were deferred to Phase 5.
- Implemented ticket audit events for:
  - `created`
  - `claimed`
  - `assigned`
  - `status_change`
  - `priority_change`
  - `reopened`

Verified manually:

- Staff created a ticket and saw only their own ticket list.
- Staff was blocked from changing priority.
- Team claimed an open ticket and became its assignee.
- Team moved the ticket from `assigned` to `in_progress` and then to `resolved`.
- Team changed priority from `high` to `urgent`.
- Staff reopened their own ticket on the resolution date.
- Reopen retained the assignee, cleared `resolvedAt`, and incremented `reopenedCount`.
- The audit trail contained the expected ordered lifecycle events.
- Super created a cross-scope ticket.
- Admin assigned an open ticket to a Team member in the Admin's own department.
- An invalid `assigned → resolved` transition was rejected with HTTP 409.

## Phase 3 — Units, departments, and users CRUD

Completed and manually verified.

- Implemented Super-only unit creation through `POST /units`.
- Creating a unit automatically creates active `unit_departments` rows for the fixed global departments:
  - IT
  - Maintenance
  - Bio-Medical
- Implemented authenticated unit listing through `GET /units`:
  - Super and Management receive all units.
  - Admin, Team, and Staff receive only their own unit.
- Implemented Super-only unit enable/disable actions:
  - `PATCH /units/:id/enable`
  - `PATCH /units/:id/disable`
- Implemented Super-only per-unit department enable/disable actions:
  - `PATCH /units/:id/departments/:deptId/enable`
  - `PATCH /units/:id/departments/:deptId/disable`
- Implemented user creation through `POST /users`.
- Implemented user listing with role-scoped visibility through `GET /users`.
- Implemented user editing through `PATCH /users/:id`.
- Implemented Super-only username changes through `PATCH /users/:id/username`.
- Implemented account enable/disable actions:
  - `PATCH /users/:id/enable`
  - `PATCH /users/:id/disable`
- Implemented password reset through `POST /auth/reset-password/:userId`.
- Enforced user-creation scope:
  - Super can create Management, Admin, Team, and Staff users.
  - Admin can create Team and Staff users in the Admin's own unit.
  - Team can create Staff users in the Team user's own unit.
- Prevented normal API creation of Super accounts with HTTP 403.
- Prevented role, unit, and department changes to the existing Super account.
- Prevented enabling or disabling the existing Super account.
- Prevented non-Super user lists from exposing the Super account.
- Corrected enable/disable route handling by using explicit route handlers rather than parameter-regex route matching.

Verified manually:

- Super created `Main Campus` with the three required active departments.
- Super created an Admin scoped to Main Campus IT.
- `POST /users` rejected `role: "super"` with HTTP 403.
- Updating the Super account's role, unit, or department was rejected with HTTP 403.
- Disabling IT blocked new IT user creation; re-enabling IT restored it.
- Admin created a Staff user in the Admin's own unit.
- Admin user listing showed only users in the Admin's own unit and did not show Super.
- Admin was blocked from creating a Management user.
- Admin successfully disabled and re-enabled a Staff user.
- Admin successfully reset a Staff password with HTTP 204.
- Super successfully disabled and re-enabled Main Campus.

## Phase 2 — Authentication, authorization, and Super-controlled 2FA

Completed and manually verified.

- Implemented username/password login using bcrypt password-hash verification.
- Implemented full JWT session tokens for authenticated users.
- Implemented separate short-lived pending-2FA JWTs for accounts with two-factor authentication enabled.
- Implemented authentication middleware for Bearer-token protected routes.
- Implemented role middleware for server-side authorization checks.
- Implemented self-service password change through `POST /auth/change-password`.
- Enforced a minimum new-password length of 12 characters.
- Implemented password reset route foundation: `POST /auth/reset-password/:userId`.
- Implemented Super-only 2FA administration through `PATCH /users/:id/2fa`.
- Implemented TOTP enrollment using `otplib`.
- Implemented one-time TOTP setup output:
  - Manual setup secret.
  - QR-code data URL.
- Implemented AES-256-GCM encryption for TOTP secrets at rest.
- Kept `TOTP_ENCRYPTION_KEY`, `JWT_SECRET`, and `PENDING_2FA_JWT_SECRET` as separate environment secrets.
- Implemented two-step login for users with 2FA enabled:
  - `POST /auth/login` returns `pending_2fa_token` instead of a full session token.
  - `POST /auth/login/verify-2fa` verifies `pending_2fa_token` plus a six-digit OTP and then returns a full JWT.
- Implemented current-user endpoint: `GET /auth/me`.
- Implemented logout endpoint: `POST /auth/logout`.
- Implemented the one-time Super-account bootstrap workflow.

Verified manually:

- Password changes reject new passwords shorter than 12 characters with HTTP 400.
- Password changes succeed with HTTP 204 when the current password is valid.
- The old password fails after a successful password change.
- The new password successfully authenticates.
- Standard login returns a JWT when 2FA is disabled.
- Super can enable 2FA for the Super account.
- Enabling 2FA returns both a manual setup secret and QR-code data URL.
- A TOTP-enrolled Super login returns a pending 2FA token after the password step.
- A valid authenticator-app OTP successfully completes the second step and returns a full JWT.
- The verified authenticated user has the `super` role.

Security notes:

- Never commit `.env` files, JWT secrets, encryption keys, TOTP setup secrets, passwords, JWTs, pending-2FA tokens, or OTPs.
- A TOTP setup secret is shown only at enrollment time. If it is lost, Super must disable and re-enable 2FA for that user.
- If `TOTP_ENCRYPTION_KEY` is rotated, existing encrypted TOTP secrets cannot be decrypted; affected users must be re-enrolled.

## 2026-09-02 — Phase 8 UI/UX refinement: Units and Users

### Units screen visual refinement

The Super-only **Units and departments** screen was visually refined without changing existing Unit, Department, ticket, authentication, or role-permission behavior.

#### Completed changes

- Replaced the single full-width Unit list presentation with a responsive Unit card grid:
  - Two columns at standard desktop widths.
  - Three columns at wide desktop widths (1180px and above).
  - One column on mobile widths.
- Added a structured Unit card header:
  - Unit initial/icon.
  - Unit name.
  - Long Unit names stay on one line and use an ellipsis when they overflow.
  - Active-department summary remains visible in the format: `X of Y departments active`.
  - Placeholder third line: `0 active users`.
  - Consistently sized Unit Enable/Disable control.
- Simplified department availability presentation:
  - Removed the separate Active/Disabled availability pill from department rows.
  - A green dot indicates an active department.
  - A red dot indicates a disabled department.
  - Tooltip and accessible label still communicate each department state.
- Removed the “Fixed for every unit” text from Unit cards.
- Retained the existing Department Enable/Disable actions.
- Added Create Unit department checkboxes:
  - IT.
  - Maintenance.
  - Bio-Medical.
- Adjusted the Create Unit form layout:
  - Wider Unit name input at larger screen widths.
  - Evenly distributed department checkboxes.
  - Create Unit button remains visible and does not overlap at intermediate desktop widths.
  - Form becomes stacked below 1024px.
- Removed the unintended light-blue checkbox focus/border styling in the Create Unit department controls.

#### Explicitly unchanged behavior

- Units still contain the globally fixed departments: IT, Maintenance, and Bio-Medical.
- Super remains the only role permitted to create Units or enable/disable Units and Departments.
- Disabling a Unit or Department continues to block normal login access for affected users and prevents new tickets from being raised against that scope.
- Existing tickets remain visible according to existing access rules.
- No Unit or Department endpoint, database migration, authorization check, ticket lifecycle rule, or role scope changed.

### Users screen visual refinement

The existing Users screen was visually refined without changing account-creation, account-editing, password-reset, username, 2FA, or role-scope behavior.

#### Completed changes

- Added a management-style page header and account overview totals.
- Improved Create User form organization:
  - Account details grouped separately from role and scope controls.
  - Clearer labels, help text, spacing, and responsive form layout.
  - Existing role availability remains actor-dependent.
- Improved User card information hierarchy:
  - Avatar/initial.
  - Full name.
  - Username.
  - Role badge.
  - Unit and Department scope.
  - Account state.
  - Password-update-required state.
  - Super-only 2FA state.
- Grouped user-management actions consistently:
  - Edit.
  - Enable/Disable where currently permitted.
  - Reset password where currently permitted.
  - Enable/Disable 2FA for Super only.
- Improved the existing temporary-password modal:
  - Clear one-time-password warning.
  - Better temporary-password display block.
  - Copy-password action.
  - Explicit close action: “I have recorded it”.
- Added responsive stacking for User cards, forms, and actions.

#### Explicitly unchanged behavior

- Super can manage the permitted existing user scope, including username changes and 2FA controls.
- Admin can manage only existing permitted Team and Staff users in the Admin’s Unit.
- Team can create/manage only existing permitted Staff scope.
- Management retains no user-management access.
- Existing password reset permissions, generated temporary password behavior, and forced password-update behavior are unchanged.
- Existing 2FA permissions remain unchanged: only Super can enable or disable 2FA.

### Future scope

The following items were discussed but intentionally deferred. They are not implemented and must not be treated as current functionality.

- **Per-department active-user counts:** Show the number of active users assigned to each department within a Unit card.
- **Per-unit active-user count:** Replace the current `0 active users` Unit card placeholder with a live count of active users assigned to that Unit.
- **Create Unit department-state persistence:** Persist the initial state of IT, Maintenance, and Bio-Medical checkboxes through the backend `POST /units` request and create the new Unit with selected departments disabled where applicable.

Any future implementation of user counts should be read-only and must preserve the existing Unit, Department, and user visibility rules.
