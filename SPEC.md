# Service Request App — Project Specification

Version: 1.0
Status: Locked — build against this document. Any deviation should be discussed and this file updated first.

---

## Current implementation status — 2026-09-18

The locked product specification remains the authority for roles, permissions,
schema, endpoints, lifecycle behavior, and security requirements.

The approved implementation phases are complete through Phase 9.

### Phase 9 implementation status

Phase 9 Docker deployment is complete.

The deployment consists of:

- PostgreSQL 16 Alpine.
- Node.js 20 Alpine backend.
- React/Vite frontend served by Nginx.
- Root-level Docker Compose orchestration.
- Persistent PostgreSQL Docker volume.
- PostgreSQL health check.
- Backend startup dependency on PostgreSQL health.
- Automatic Knex migrations before backend startup.
- Manual one-time Super bootstrap CLI command.

The documented deployment workflow is:

```text
git clone repository
create private .env.docker
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker exec -it backend npm run create-super
```

No demo users, default accounts, demo tickets, hardcoded credentials, or
client-specific assets are included in the public repository.

The initial database contains only the fixed global departments required by
this specification:

- IT.
- Maintenance.
- Bio-Medical.

### Public distribution policy

IUVO is distributed publicly for evaluation, demonstration, testing,
education, and feedback under the repository's evaluation license.

The public repository must not contain:

- Private environment files.
- Database credentials.
- JWT secrets.
- TOTP encryption keys.
- Recovery keys.
- Passwords or password hashes.
- Production data.
- Client-specific branding or assets.
- Database dumps or volumes.
- Hardcoded user accounts.

The sole Super account must be created manually through the approved bootstrap
CLI command. No seed file or API endpoint may create a Super account.

### Operational documentation

The following documents are part of the current repository release:

- `README.md`
- `DEPLOYMENT.md`
- `BACKUP-RESTORE.md`
- `SECURITY.md`
- `RECOVERY.md`
- `LICENSE.md`

---

## 1. Overview

A multi-unit service request / ticketing system. Each unit has three fixed departments (IT, Maintenance, Bio-Medical). Staff raise tickets, department Team members resolve them, department Admins (HODs) oversee and can assign/resolve, Management gets a read-only cross-unit analytics dashboard, and Super is the master controller for the whole system.

---

## 2. Roles & Permissions

| Role | Scope | Raise ticket | Act on ticket | Assign ticket | Edit priority | Create users |
|---|---|---|---|---|---|---|
| **Super** | All units, all depts | Yes (any unit/dept) | System-wide oversight: assign/reassign, change priority, valid forward status changes, reopen Resolved, unlock Closed; cannot claim or be assigned | Yes -> active matching Admin/Team; Super reason required | Yes | Anyone, any unit |
| **Management** | All units (dashboard only) | No | No | No | No | No |
| **Admin** | Own unit, own dept | Yes (own unit, any dept) | Yes -> claim, assign to self or Team, progress, resolve, reopen own Resolved ticket | Yes -> Team in own dept, or self | Yes | Team + Staff (own unit) |
| **Team** | Own unit, own dept | Yes (own unit, any dept) | Yes -> claim, progress, resolve, reopen own Resolved ticket | No (receives only; can claim unassigned) | Yes | Staff (own unit) |
| **Staff** | Own tickets only | Yes | No (except reopen own Resolved ticket before auto-close) | No | No | No |

Constraints:
- One user = one role + one unit + one department (department is null/n-a for Super and Management). No multi-role/multi-dept users.
- There is exactly **one Super account** in the entire system — it is not a role assignable to multiple users. This account is created once (manually, during initial setup) and is not created through the normal `POST /users` flow available to any role.
- **Bootstrap method**: the Super account is created via a one-time CLI command run inside the running backend container (e.g. `docker exec -it <backend_container> npm run create-super`), which interactively prompts for username and password and inserts the row directly. No Super account should ever be created via a seed file with hardcoded credentials or via an API endpoint.
- **Single-Super enforcement (defense in depth, both required)**:
  - **Database level (hard constraint)**: a partial unique index on `users.role` where `role = 'super'` (e.g. `CREATE UNIQUE INDEX users_one_super_only ON users (role) WHERE role = 'super'`), added via a tracked Knex migration using `knex.raw(...)` with a matching `DROP INDEX IF EXISTS` in the down migration — not a manual SQL script. This rejects a second Super row or a role change promoting another user to Super, regardless of what application code does.
  - **Application level (friendly UX)**: the bootstrap CLI checks for an existing Super before prompting, and refuses early with a clear message. It also catches Postgres error code `23505` (unique_violation) on the insert itself — covering a race condition where two bootstrap attempts run near-simultaneously — and returns a clean message ("A Super account already exists.") rather than a raw DB error.
  - **Role-change protection (Phase 3)**: `PATCH /users/:id` must explicitly block any role change on the existing Super account (no demotion, no reassignment) — the spec defines no workflow for this, so it should be a hard no-op/rejection, not silently allowed.
- Username is immutable except by Super (Super can change anyone's username).
- Password reset: Super → anyone; Admin → Team/Staff within their own unit.
- Super role/account is not visible or discoverable to any other role in any UI, list, or dropdown.
- **Two-Factor Authentication (2FA)** is **off by default for everyone**, including Super. Only **Super** can enable or disable 2FA on any individual user's account (including their own, since there's only one Super account). No role can turn 2FA on/off for themselves except Super, who is the sole exception. If a user has 2FA enabled, login requires a second verification step (see Section 3); if not enabled, login is username + password only, as normal.

---

## 3. Authentication & 2FA

- Standard login: username + password → JWT issued.
- If the logging-in user has `two_factor_enabled = true`, login becomes two-step:
  1. Username + password verified as normal.
  2. If valid, server does **not** issue a JWT yet — instead returns a short-lived `pending_2fa_token` and triggers delivery of a one-time code (recommend TOTP via authenticator app for lowest cost/complexity on a free-tier build — no SMS provider fees; email OTP is a fallback option if TOTP app setup is too much friction for users).
  3. User submits the OTP + `pending_2fa_token` → server verifies → full JWT issued.
- Only **Super** can toggle `two_factor_enabled` per user, via `PATCH /users/:id/2fa`. There is only ever **one Super account** in the system — Super can toggle 2FA on their own account as well as anyone else's. Toggling it does not immediately invalidate the user's current session, but takes effect on their next login.
- If TOTP is used, the secret is generated and shown (as a QR code) once, at the point Super enables 2FA for that user (or for themself) — the affected user scans it with their own authenticator app before their next login attempt.

## 3A. Security Administration, Password Policy, and Recovery

This section is an approved extension to the original specification. Its implementation begins only after Phase 7 frontend authentication is manually verified.

### Global password policy

- The system has one global password policy, managed only by Super.
- The global policy applies to ordinary users unless the user has an explicit custom policy override.
- The global policy contains:
  - `minLength`
  - `requireUppercase`
  - `requireLowercase`
  - `requireNumber`
  - `requireSpecialCharacter`
- Initial test-environment defaults:
  ```json
  {
    "minLength": 3,
    "requireUppercase": false,
    "requireLowercase": false,
    "requireNumber": false,
    "requireSpecialCharacter": false
  }
  ```
- Super may change the global policy at any time.
- Existing passwords are not invalidated merely because the policy changes. However, affected users must be forced to update their password immediately after their next successful login.
- Password-policy validation is always enforced server-side. Frontend validation may provide feedback but must not be trusted as the authorization or validation boundary.

### Per-user password-policy overrides

- Every ordinary user either inherits the global password policy or has a custom per-user override.
- Super may set, edit, or remove a password-policy override for any non-Super user.
- A custom override contains the same five fields as the global policy:
  - `minLength`
  - `requireUppercase`
  - `requireLowercase`
  - `requireNumber`
  - `requireSpecialCharacter`
- Removing an override returns the user to the global policy.
- A user must never be able to edit their own password-policy settings.
- Super's own password policy is fixed and cannot be changed through Security Administration.

### Super password policy

The Super account is never governed by the configurable test-environment policy. The following requirements are mandatory for every Super password, including bootstrap, self-change, and break-glass recovery:

- Minimum 12 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.
- Super TOTP remains separately required when Super 2FA is enabled.

### Password-setting enforcement

The applicable effective policy must be validated whenever a password is set, including:

- User creation.
- Self-service password change.
- Super resetting another user's password.
- Admin resetting a Team or Staff password in the Admin's own unit.
- Replacing a temporary password after login.
- Super account recovery through the approved recovery CLI.

Existing password-reset permissions do not change:

- Super may reset any non-Super user.
- Admin may reset Team and Staff users within the Admin's own unit.
- Team, Staff, and Management have no password-reset authority.
- No normal workflow permits any user to reset Super through the API.

### Temporary-password reset flow

Password resets use system-generated temporary passwords.

1. An authorized Super or Admin initiates a reset for an in-scope target user.
2. The system generates a cryptographically secure temporary password of at least 16 random characters.
3. The system displays the temporary password once to the authorized operator.
4. Only the bcrypt password hash is stored; the temporary password must never be stored, logged, audited, or returned again.
5. The target account is marked `must_change_password = true`.
6. The target user can sign in with the temporary password.
7. Before accessing normal application routes, the target user must set a new password that satisfies their effective policy.
8. On successful password update, `must_change_password` is cleared.

A weak test policy may permit a user to choose a short password, but it must never cause the system to generate a weak temporary password.

### Forced password update

- When Super changes the global policy, every ordinary user who inherits that global policy is marked `must_change_password = true`.
- When an authorized actor changes or removes an individual user's password-policy override, that target user is marked `must_change_password = true`.
- When a user with `must_change_password = true` successfully authenticates, the backend issues only a restricted session.
- A restricted session may access only:
  - `GET /auth/me`
  - `POST /auth/change-password`
  - `POST /auth/logout`
- All other protected endpoints must reject restricted sessions.
- The frontend must redirect a restricted-session user immediately to the password-update page.

### Delegated Security Administration permission

- Security Administration access is a permission, not a role.
- The permission name is `security_admin`.
- Only Super may grant or revoke `security_admin`.
- Only users with the `admin` role may receive `security_admin`.
- Granting this permission does not change the Admin's role, ticket scope, user scope, unit scope, or ordinary reset permissions.
- A delegated security Admin may:
  - View the effective password policy of Team and Staff users in the Admin's own unit.
  - Add, edit, or remove password-policy overrides for Team and Staff users in the Admin's own unit.
  - Reset passwords only for Team and Staff users in the Admin's own unit, using the system-generated temporary-password workflow.
- A delegated security Admin may not:
  - View, change, reset, enable, disable, or modify the password policy of Super.
  - View or manage Management users.
  - View or manage Admin users, including other Admin users in the same unit.
  - View or manage users outside the Admin's own unit.
  - Modify the global password policy.
  - Enable or disable 2FA for any user.
  - Grant or revoke `security_admin`, including their own permission.
  - Access, invoke, view, or influence Super recovery or `SUPER_RECOVERY_KEY`.

### Super break-glass recovery CLI

- Add a backend-only command: `npm run recover-super`.
- The command must not be exposed through an HTTP endpoint, frontend route, or normal password-reset flow.
- The command may run only from a backend host/container with database access and backend environment access.
- The command targets only the sole existing `super` user. It must not accept a target user ID, username, or role.
- The command requires a dedicated `SUPER_RECOVERY_KEY` environment secret, separate from `JWT_SECRET`, `PENDING_2FA_JWT_SECRET`, and `TOTP_ENCRYPTION_KEY`.
- The command securely prompts for the recovery key, then prompts twice for the replacement Super password.
- The replacement password must satisfy the fixed Super password policy.
- On success, the command updates only the existing Super password hash and clears the Super TOTP enrollment:
  - `two_factor_enabled = false`
  - `two_factor_secret = null`
- Super must sign in with the new password and immediately re-enroll TOTP through the normal Super-only 2FA workflow.
- The command must record a security audit event without recording secrets.
- A root-level `RECOVERY.md` file documents the approved recovery procedure.

### Security audit records

Security-sensitive actions must be auditable independently of ticket audit events.

Each security audit record includes:

- Actor user ID, when an authenticated user performed the action.
- Target user ID, when an action targets a specific user.
- Event type.
- Before and after policy values when a policy changed.
- Permission value when `security_admin` was granted or revoked.
- Timestamp.
- Outcome, including allowed or denied.
- Nullable `reason` text.

The following actions require a non-empty `reason`:

- Global password-policy changes.
- Granting `security_admin`.
- Revoking `security_admin`.
- Creating, updating, or clearing a per-user password-policy override.
- Running Super break-glass recovery.

Reasons are optional for:

- Temporary password issuance.
- Forced password-change completion.
- Security page access attempts.
- Other denied security operations, unless a future rule explicitly requires one.

Security audit records must never store or expose passwords, temporary passwords, password hashes, TOTP secrets, QR-code data, JWTs, pending-2FA tokens, encryption keys, or recovery keys.

## 4. Ticket Lifecycle

```text
Open --(claim/assign)--> Assigned --> In Progress --> Resolved
                             |                          |
                             |                          +-- Original raiser reopens --> In Progress
                             |                          +-- Super reopens ----------> In Progress
                             |                          +-- At least 48 hours ------> Closed
                             |                              checked every 3 hours
                             |
                             +-- Super may reassign while Assigned or In Progress
```

### Ticket queues and visibility

- **My raised tickets**
  - Super sees every ticket raised by the Super account, across all units and departments.
  - Admin and Team users see every ticket they personally raised in their own unit, including tickets raised for departments other than their own.
  - Staff users see only tickets they personally raised.
- **Work queue**
  - Admin and Team users see tickets raised by other users only when both the ticket unit and ticket department match the authenticated user's assigned unit and department.
  - An Admin or Team user's own raised ticket appears only in that user's My raised tickets list, even when it targets the user's own department. It must not be duplicated in the same user's Work queue.
  - Super sees all tickets raised by other users across all units and departments. The user interface must clearly display each ticket's unit and department.
  - Staff has no Work queue.
  - Management has no ticket access and cannot raise, view, assign, claim, modify, reopen, or unlock tickets.
### Admin Work Queue Oversight

The Admin Work Queue remains the existing department-scoped operational queue. This feature does not create a separate Admin dashboard, does not grant new ticket visibility, and does not change ticket lifecycle or assignment permissions.

- The Admin Work Queue includes only tickets already visible to the authenticated Admin under the existing Work Queue rule: tickets raised by other users in the Admin's assigned Unit and Department.
- The existing Work Queue remains the source for:
  - Open and unassigned department tickets.
  - Tickets assigned to the authenticated Admin.
  - Tickets assigned to matching Team users.
  - Tickets assigned to another matching Admin where applicable.
- Admin users receive the following Work Queue categories:
  - **All work** — every ticket in the authenticated Admin's existing Work Queue.
  - **Needs assignment** — tickets in the authenticated Admin's Work Queue where `status = open` and no assignee exists.
  - **My active work** — unresolved tickets in the authenticated Admin's Work Queue assigned to the authenticated Admin. Unresolved means `assigned` or `in_progress`.
  - **Team active work** — unresolved tickets in the authenticated Admin's Work Queue assigned to Team users in the authenticated Admin's Unit and Department. Unresolved means `assigned` or `in_progress`.
- These categories are Admin-only. They do not alter the Work Queue behavior of Super or Team users.
- The initial category ordering is:
  - **All work** — newest ticket first, using descending ticket creation time.
  - **Needs assignment** — oldest ticket first, using ascending ticket creation time.
  - **My active work** — oldest ticket first, using ascending ticket creation time.
  - **Team active work** — oldest ticket first, using ascending ticket creation time.
- The Admin Work Queue displays a count for each category.
- Ticket-list rows display a compact Ticket Age indicator calculated from `createdAt`.
  - Ticket Age represents elapsed time since ticket creation, not time spent in the current status.
  - The visible value uses concise duration text, for example `18 min`, `4 hours`, `1 day`, `2 days`, or `3 weeks`.
  - The visible Ticket Age indicator appears beside the current-status indicator.
  - The visible hover tooltip text is exactly `Ticket age`.
  - The accessible label must state the full meaning, for example `Ticket age: 2 days since creation`.
- Ticket Age is informational only. It does not establish an SLA, overdue state, breach, escalation, priority, or new lifecycle rule.

### Future enhancement — Admin Work Queue age emphasis

- IUVO may apply restrained amber emphasis to sufficiently old Open and unassigned tickets only after a formal ticket-age threshold, operational escalation rule, or SLA policy is separately approved.
- Until such approval, Ticket Age remains neutral/informational and no ticket may be described as overdue, breached, escalated, or late solely because of its age.

### Future enhancement — Admin Work Queue sort toggle

After the initial Admin Work Queue Oversight feature is implemented and manually verified, IUVO may add a sort-direction control embedded in the currently active Admin Work Queue category.

- The sort-direction control appears only inside the active category label.
- An inactive category has no visible sort-direction arrow.
- Selecting an inactive category:
  - Activates that category.
  - Applies that category's defined default sort direction.
- The sort arrow inside the active category toggles the active category's sort direction without changing the active category.
- Arrow meanings are fixed:
  - `↑` means oldest first: ascending ticket creation time.
  - `↓` means newest first: descending ticket creation time.
- Example active-category states:
  ```text
  [ All work ↓ ] [ Needs assignment ] [ My active work ] [ Team active work ]

  [ All work ] [ Needs assignment ↑ ] [ My active work ] [ Team active work ]

  [ All work ] [ Needs assignment ] [ My active work ↓ ] [ Team active work ]

  [ All work ] [ Needs assignment ] [ My active work ] [ Team active work ↑ ]
  ```
- The initial default direction remains:
  - All work: `↓` newest first.
  - Needs assignment: `↑` oldest first.
  - My active work: `↑` oldest first.
  - Team active work: `↑` oldest first.
- The future sort toggle applies only to ticket creation time unless a different sort field is separately approved.
- The future sort toggle does not change ticket visibility, role permissions, assignment behavior, lifecycle rules, ticket priority, or SLA behavior.


### Lifecycle and assignment rules

- **Open** - ticket raised and unassigned.
- **Claim** - an eligible Team member in the ticket's unit and department may self-claim an Open ticket. An eligible Admin in that unit and department may also claim an Open ticket.
- **Admin assignment** - an Admin may assign an Open, unassigned ticket to themself or an active Team user in the Admin's own unit and department.
- **Super assignment and reassignment**
  - Super cannot claim a ticket and cannot be assigned a ticket because Super has no unit or department.
  - Super may assign an Open, unassigned ticket, or reassign an Assigned or In Progress ticket, to an active Admin or Team user whose unit and department match the ticket.
  - Super cannot assign a Staff user or the Super account.
  - Reassignment preserves the current status: Assigned remains Assigned and In Progress remains In Progress.
  - Super must provide a non-empty reason for every assignment or reassignment.
  - Ticket audit history must record the Super actor, prior assignee when applicable, new assignee, reason, and timestamp.
  - Reassignment must be distinguishable from an initial assignment in the ticket audit trail.
- **In Progress** - an assigned Admin or Team user may move an Assigned ticket to In Progress.
- **Resolved** — an assigned Admin or Team user may move an In Progress ticket to Resolved.
  - A transition to `resolved` requires a non-empty `resolutionRemarks` string.
  - A transition to `resolved` requires `repairCost` as a finite number greater than or equal to zero.
  - `repairCost = 0` is valid when no paid repair or replacement was required.
  - The current resolution remarks and repair cost are stored on the ticket.
  - Each resolution event must independently store its own resolution remarks and repair cost in the ticket audit history.
  - If a ticket is reopened and resolved again, the ticket displays the latest resolution values, while the audit history preserves the values from every prior resolution event.
- **Super normal status action** - Super may perform only valid forward transitions: Assigned to In Progress and In Progress to Resolved. Super may not skip states or directly close a ticket.
- **Reopen while Resolved**
  - Any original ticket raiser may reopen only their own Resolved ticket while it remains Resolved.
  - Super may reopen any Resolved ticket while it remains Resolved.
  - Reopening returns the ticket to In Progress and retains the current assignee.
- **Auto-close**
  - A ticket becomes eligible for automatic closure only when it remains Resolved and `resolved_at` is at least 48 hours old.
  - The internal auto-close check runs every 3 hours.
  - A ticket is closed no earlier than 48 hours after resolution and normally no later than just under 51 hours after resolution, assuming scheduled checks run successfully.
  - The backend must enforce the 48-hour eligibility condition; scheduler timing must never permit early closure.
  - Auto-close writes a system-generated ticket event with a null actor.
- **Closed** - closed tickets are locked for all ordinary roles. They cannot be claimed, assigned, reassigned, reprioritized, status-changed, or reopened.
- **Super unlock** - Super may unlock any Closed ticket, including a ticket raised by Super, regardless of ticket raiser, unit, or department. Unlock returns the ticket to In Progress, retains the current assignee, requires a non-empty reason, and writes an audited `unlocked` ticket event.
- **Priority** - set at ticket creation as Low, Medium, High, or Urgent. It may later be changed by Team, Admin, or Super while the ticket is not Closed. No additional reason is required solely because the actor is Super.

---

### Manual closure by ticket raiser

- The original ticket raiser may manually close their own ticket while it is in the `resolved` state.
- Super may manually close any ticket while it is in the `resolved` state.
- The current assignee, other Admins, other Team users, and other Staff users may not manually close a ticket unless they are also its original raiser.
- Manual closure is exposed through:

  ```text
  POST /tickets/:id/close
  ```

- The request has no body.
- Manual closure must:
  - Require an authenticated `staff` or `super` user.
  - Verify that the ticket is currently `resolved`.
  - Verify that the actor is Super or the ticket's original raiser.
  - Change `status` from `resolved` to `closed`.
  - Set `closed_at` to the current timestamp.
  - Write a `closed` ticket event with the authenticated actor ID. This distinguishes manual closure from automatic closure, whose event has a null actor ID.
- Repeating manual closure on an already Closed ticket must be rejected.


### 4A. Manual Ticket Close

- Endpoint: `PATCH /tickets/:id/close` 
  [
    > **Historical note:** This older `PATCH` reference is superseded. The
    > canonical implemented endpoint is `POST /tickets/:id/close`.
  ]
- Allowed actors: original ticket raiser or Super.
- Precondition: ticket status must be `resolved`.
- Effect: `status → closed`, `closed_at` set to now, `closed` event recorded with `actor_id`.
- Uses conditional UPDATE to avoid race with auto-close cron.

### 4B. Resolution Remarks and Repair Cost

- Schema: `tickets.resolution_remarks TEXT`, `tickets.repair_cost NUMERIC(10,2)`.
- Validation: when transitioning to `resolved`, both fields required (`resolutionRemarks` non-empty string, `repairCost >= 0`).
- Display: shown on resolved/closed tickets; pre-filled on re-resolve.

### 4C. Ticket Messaging

- Schema: `ticket_messages` table (`id`, `ticket_id`, `sender_id`, `body`, `created_at`).
- Unread flags: `tickets.raiser_has_unread BOOLEAN`, `tickets.assignee_has_unread BOOLEAN`.
- Posting permissions: raiser, current assignee, Super. Admin can post only when `assigned_to`.
- Viewing permissions: raiser, current assignee, Super, matching Admin (read-only).
- Unread rules: poster notifies "other party"; viewer clears own flag; reassignment resets assignee flag (deferred).
- Closed tickets: viewing allowed, posting blocked.


---

## 4. Quick Summary for Your Records

**Complete and verified:**
- ✅ Manual close endpoint + UI button
- ✅ Resolution remarks/cost validation + modal + display
- ✅ Message thread API + UI component
- ✅ Unread flag logic in backend
- ✅ Permission checks (view/post)
- ✅ Closed-ticket posting blocked

**Deferred (next session):**
- ⏳ Per-ticket unread dot in list (needs `baseTicketQuery` update in `tickets.controller.js` + visual verification)
- ⏳ Sidebar unread badge component
- ⏳ Reassignment resetting `assignee_has_unread`

---

### Ticket-number generation

- Each ticket must receive a unique ticket number at creation.
- The ticket number includes:
  - A normalized unit code.
  - A normalized department code.
  - A zero-padded numeric sequence component.
- Each `(unit_id, department_id)` pair has an independent ticket-number sequence.
- The numeric sequence is increasing within its unit/department scope.
- Existing tickets retain their current `ticket_number` values when this rule is introduced.
- New ticket-number counters must be seeded above the highest valid existing numeric suffix for their corresponding unit/department pair.
- Ticket-number generation must remain safe under concurrent ticket creation.
- The backend must use an atomic allocation mechanism rather than relying solely on a non-atomic ticket count.
- Concurrent ticket creation in the same unit/department must receive distinct ticket numbers.
- Concurrent ticket creation in different unit/department pairs must not consume one another's sequence values.
- Uniqueness and increasing allocation are guaranteed within each unit/department scope.
- The implementation does not promise gapless numbering; gaps may still occur if a future implementation changes allocation behavior or if an explicitly consumed value is abandoned.
- Existing tickets and their ticket numbers must not be renumbered by the migration.

#### Ticket-number implementation constraint

Ticket-number allocation must use a tracked database migration and an atomic counter table keyed by:

```text
(unit_id, department_id)
```

The counter allocation and ticket insert must execute within the same database transaction. The old unbounded recursive retry path must not remain in `createTicket`.

---

## 5. Units & Departments

- Departments are a **fixed global set**: IT, Maintenance, Bio-Medical — same three for every unit.
- Super can **enable/disable** a department per unit (e.g., turn off Bio-Medical for a unit that doesn't need it).
- Super can **enable/disable** a whole unit.
- When a unit or department is disabled:
  - Existing tickets remain visible (read-only) to roles who could already see them.
  - No new tickets can be raised against it.
  - Users whose account is tied to a disabled unit/department cannot log in (except Super, who always can).
- A unit/department can have **multiple Admins** and **multiple Team members**.

---

## 6. Management Dashboard

- Full filter access (not restricted to pre-defined metrics): filter by unit, department, status, priority, date range, assignee, etc.
**Saved filters**: Management users and Super can save a named filter combination (e.g., "Open tickets today — Unit A") to their own account and re-run it with one click. Saved filters are private to the account that created them and are not shared with other users. Super has the same saved-filter capabilities as Management, but does not view, edit, or delete another user's private saved filters.
- Built-in report views:
  - Tickets by status / department / unit
  - Average resolution time
  - Unresolved tickets per department
    - An unresolved ticket is a ticket whose status is `open`, `assigned`, or `in_progress`.
    - Equivalently, unresolved means the ticket status is not `resolved` and not `closed`.
    - The report groups qualifying filtered tickets by department.
    - The report respects the same currently active Dashboard filters as every other Dashboard report.
    - If the active Status filter excludes every unresolved status, the report returns no matching rows.
  - Tickets per Team member
  - Open vs. closed trend over time

---

## 7. Tech Stack & Library Decisions

Locked choices — do not substitute without discussing first, since consistency across sessions/bots matters more than any single library's merits.

- **Migrations**: Knex (not Prisma) — lighter weight, closer to raw SQL, easier to debug without tooling.
- **TOTP (2FA)**: `otplib` for secret generation + code verification (RFC 6238 standard — works with any authenticator app, including Bitwarden, Google Authenticator, Authy; no app-specific integration needed). `qrcode` npm package to render the one-time setup QR code.
- **TOTP secret encryption at rest** (locked, Phase 2): AES-256-GCM via Node's built-in `crypto` module (no new library). Each `two_factor_secret` is encrypted with a random 12-byte IV, and stored as a single delimited string `iv:ciphertext:authTag` in the existing TEXT column. Key comes from a dedicated `TOTP_ENCRYPTION_KEY` env var (64 hex chars / 32 bytes) — separate from `JWT_SECRET`, never returned by any API response, never committed to git or placed in frontend code. `JWT_SECRET` (full session tokens) and `PENDING_2FA_JWT_SECRET` (short-lived pending-2FA tokens issued after password check, before OTP verification) are also kept as distinct secrets, and auth middleware must check token type/audience — not just signature validity — so a `pending_2fa_token` can never be mistakenly accepted as a full session token. Note: rotating `TOTP_ENCRYPTION_KEY` invalidates all existing encrypted secrets; affected users would need 2FA re-enabled by Super. Not handled automatically — acceptable for this project's scale.
- **PDF export**: `pdfkit` (not Puppeteer/html-pdf) — generates PDFs programmatically without a headless browser, keeping the Docker image small and build times fast. Dashboard exports are tabular data, not styled documents, so no HTML/CSS rendering step is needed.
- **CSV export**: `json2csv` or equivalent lightweight CSV serializer.
- **Folder structure**:
```
service-request-app/
├── backend/
│   ├── src/
│   │   ├── db/            # connection, migrations, seeds (Knex)
│   │   ├── middleware/    # auth, role checks
│   │   ├── routes/        # one file per resource (users, tickets, dashboard...)
│   │   ├── controllers/
│   │   ├── models/         # or queries/
│   │   ├── services/       # cron job, PDF/CSV export, TOTP logic
│   │   └── app.js
│   ├── scripts/
│   │   └── create-super.js # one-time Super bootstrap CLI command
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/          # role-based route pages
│   │   ├── components/
│   │   ├── api/             # fetch wrappers
│   │   └── App.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── (SPEC.md, HANDOFF.md, etc. at repo root)
```
`docker-compose.yml` lives at the **repo root** (`service-request-app/`, one level above `backend/` and `frontend/`), since it orchestrates all services as siblings — not nested inside `backend/`.

- **Port conventions (locked, to avoid future confusion)**:
  - **PostgreSQL (Docker container)**: host port `30041` → container port `5432`. Non-default host port chosen deliberately to avoid clashing with any native/local Postgres install that may already be running on the developer's machine.
  - **Backend app** (once containerized in Phase 9): host port `30040`.
  - `backend/.env` should set `DB_PORT=30041` when the app runs natively on the host against Dockerized Postgres (current, pre-Phase-9 setup). Once the backend itself is containerized (Phase 9), it will instead connect to Postgres over Docker's internal network using the container port `5432` and the Postgres service name as host (e.g. `DB_HOST=postgres`) — this is a **different** `.env`/config context than the native-host setup and should not be confused with it.

## 8. Database Schema (PostgreSQL)

### `units`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | unique |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `departments`
Global lookup — 3 fixed rows (IT, Maintenance, Bio-Medical).
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | unique — 'IT' / 'Maintenance' / 'Bio-Medical' |

### `unit_departments`
Join table — controls which departments are enabled per unit.
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| unit_id | UUID FK → units | |
| department_id | UUID FK → departments | |
| is_active | BOOLEAN | default true |
| UNIQUE(unit_id, department_id) | | |

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| username | TEXT | unique, immutable except by Super |
| password_hash | TEXT | bcrypt |
| full_name | TEXT | editable by self (except username) |
| role | ENUM | super / management / admin / team / staff |
| unit_id | UUID FK → units | null for Super and Management (both are cross-unit/system-wide); required for Admin, Team, Staff |
| department_id | UUID FK → departments | null for Super, Management; required for Admin, Team, Staff |
| is_active | BOOLEAN | default true (disable account) |
| two_factor_enabled | BOOLEAN | default false — settable only by Super |
| two_factor_secret | TEXT | nullable, encrypted at rest — TOTP secret, set when Super enables 2FA |
| created_by | UUID FK → users | audit: who created this account |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| must_change_password | BOOLEAN | default false — restricts the user to password update after successful authentication |
| password_policy_override | JSONB | nullable — null means inherit global policy; custom object contains the five ordinary-user password-policy controls |

**Enforced via CHECK constraint** (`users_role_scope_check`), implemented as a Knex migration, not just documentation:
```sql
CHECK (
  (role = 'super' AND unit_id IS NULL AND department_id IS NULL)
  OR (role = 'management' AND unit_id IS NULL AND department_id IS NULL)
  OR (role IN ('admin', 'team', 'staff') AND unit_id IS NOT NULL AND department_id IS NOT NULL)
)
```
This guards against a Management user ever being tied to a single unit (which would contradict their cross-unit dashboard scope) or an Admin/Team/Staff user being created without both a unit and department. Caught and fixed during Phase 1 — an earlier draft of this constraint incorrectly required `unit_id IS NOT NULL` for Management.

### `tickets`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| ticket_number | TEXT | human-readable, e.g. UNIT-DEPT-000123 |
| unit_id | UUID FK → units | |
| department_id | UUID FK → departments | |
| raised_by | UUID FK → users | |
| assigned_to | UUID FK → users | nullable |
| title | TEXT | |
| description | TEXT | |
| priority | ENUM | low / medium / high / urgent |
| status | ENUM | open / assigned / in_progress / resolved / closed |
| resolved_at | TIMESTAMPTZ | nullable — used by cron to determine close eligibility |
| closed_at | TIMESTAMPTZ | nullable |
| reopened_count | INT | default 0, informational |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| resolution_remarks | TEXT | null until the ticket is resolved; required for a transition to `resolved` |
| repair_cost | NUMERIC(10,2) | null until the ticket is resolved; must be greater than or equal to 0 when resolved |

### `ticket_events` (audit trail)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| ticket_id | UUID FK → tickets | |
| actor_id | UUID FK → users | |
| event_type | ENUM | created / claimed / assigned / status_change / priority_change / reopened / closed |
| from_value | TEXT | nullable |
| to_value | TEXT | nullable |
| created_at | TIMESTAMPTZ | |
| resolution_remarks | TEXT | nullable; populated for each `status_change` event whose destination is `resolved` |
| repair_cost | NUMERIC(10,2) | nullable; populated for each `status_change` event whose destination is `resolved` |

### `saved_filters`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | Management user only |
| name | TEXT | |
| filter_json | JSONB | stores filter criteria |
| created_at | TIMESTAMPTZ | |

### `security_settings`

Singleton global security configuration. The table contains exactly one row.

| Column | Type | Notes |
|---|---|---|
| id | SMALLINT PK | fixed singleton value, e.g. `1` |
| min_password_length | INTEGER | global ordinary-user minimum; validated server-side |
| require_uppercase | BOOLEAN | default false |
| require_lowercase | BOOLEAN | default false |
| require_number | BOOLEAN | default false |
| require_special_character | BOOLEAN | default false |
| updated_by | UUID FK → users | must be Super |
| updated_at | TIMESTAMPTZ | |

### `user_permissions`

Stores explicitly granted capabilities without altering a user's single assigned role.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | target user |
| permission | TEXT | initially only `security_admin` |
| granted_by | UUID FK → users | must be Super |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Constraints:

- `UNIQUE(user_id, permission)`.
- `security_admin` may be granted only to an active Admin user; enforce in application code and validate before each privileged action.
- No user may grant, revoke, or modify their own permissions.

### `security_audit_events`

Security and credential administration audit trail. This is separate from `ticket_events`.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| actor_id | UUID FK → users | nullable only for CLI/system actions where no authenticated session actor exists |
| target_user_id | UUID FK → users | nullable for global-policy events |
| event_type | TEXT | e.g. global_policy_updated, user_policy_updated, password_reset_issued, security_admin_granted, access_denied, super_recovered |
| before_value | JSONB | nullable; no secrets |
| after_value | JSONB | nullable; no secrets |
| reason | TEXT | nullable unless event type requires it |
| outcome | TEXT | allowed / denied / completed |
| created_at | TIMESTAMPTZ | |

Security audit records must never contain plaintext credentials, password hashes, temporary passwords, TOTP data, JWTs, or environment secrets.

---

## 9. API Endpoints (by role)

Auth: JWT bearer token, role + unit + department embedded in claims. All endpoints enforce role middleware server-side (never trust client-side role checks alone).

### Auth
- `POST /auth/login` — returns full JWT if 2FA off, or a `pending_2fa_token` if 2FA on for that user
- `POST /auth/login/verify-2fa` — accepts `pending_2fa_token` + OTP, returns full JWT
- `POST /auth/logout`
- `POST /auth/change-password` (self)
- `POST /auth/reset-password/:userId` (Super any; Admin → own unit Team/Staff only)
- `PATCH /users/:id/2fa` — Super only. Enables/disables 2FA for the target user; enabling returns a TOTP QR/secret for one-time setup.

### Users
- `POST /users` — create (Super: any role/unit; Admin: Team/Staff own unit; Team: Staff own unit)
- `GET /users` — Admin and Team user visibility is Unit-scoped, not Department-scoped: they may list eligible users in their own Unit across that Unit's departments. Department-specific scope applies to ticket Work-queue visibility and ticket actions, not ordinary user-list visibility.
- `PATCH /users/:id` — edit (name always; username Super-only)
- `PATCH /users/:id/disable` / `/enable` — Super, or Admin within own unit for Team/Staff
- `PATCH /users/:id/username` — Super only

### Units & Departments
- `POST /units` — Super only
- `PATCH /units/:id/enable` / `/disable` — Super only
- `PATCH /units/:id/departments/:deptId/enable` / `/disable` — Super only
- `GET /units` — all roles (scoped)

### Tickets

- `POST /tickets` - Staff, Admin, Team, Super.
- `GET /tickets` - role-scoped ticket access:
  - Staff receive only tickets they raised.
  - Admin and Team receive their own raised tickets in any department of their own unit, plus tickets raised by other users in their assigned unit and department.
  - Super receives all tickets across all units and departments.
  - Management has no ticket access.
- `GET /tickets/:id` - returns one in-scope ticket and its ticket-event audit history.
- `PATCH /tickets/:id/claim` - eligible Team/Admin user in the ticket's unit and department may claim an Open, unassigned ticket.
- `PATCH /tickets/:id/assign`
  - Admin may assign an Open, unassigned ticket to self or an active matching Team user.
  - Super may assign an Open, unassigned ticket or reassign an Assigned/In Progress ticket to an active matching Admin/Team user.
  - Super assignment/reassignment requires `assignedTo` and a non-empty `reason`.
  - Super cannot assign Super or Staff.
- `PATCH /tickets/:id/priority` - Team, Admin, and Super may change priority while the ticket is not Closed.
- `PATCH /tickets/:id/status`
  - Assigned Admin/Team user may move Assigned to In Progress and In Progress to Resolved.
  - Super may perform the same valid forward transitions across all units/departments.
  - No actor may skip a lifecycle state or directly close a ticket.
- `PATCH /tickets/:id/reopen`
  - Original ticket raiser may reopen their own Resolved ticket while it remains Resolved.
  - Super may reopen any Resolved ticket while it remains Resolved.
- `PATCH /tickets/:id/unlock`
  - Super only.
  - Applies to every Closed ticket, including Super-raised tickets.
  - Requires a non-empty `reason`.
  - Reverts Closed to In Progress and records an `unlocked` ticket event.

### Dashboard (Management, Super)
- `GET /dashboard/metrics` — query params for all filter dimensions
- `GET /dashboard/export?format=csv|pdf`
- `POST /dashboard/saved-filters` — saves a filter privately for the authenticated Management or Super user
- `GET /dashboard/saved-filters` — returns only filters created by the authenticated Management or Super user
- `DELETE /dashboard/saved-filters/:id` — deletes only a filter created by the authenticated Management or Super user

### System
- `POST /system/cron/auto-close` — internal, triggered by scheduler, not user-facing

### Security Administration

- `GET /security/password-policy` — Super only; returns the global policy.
- `PATCH /security/password-policy` — Super only; requires a non-empty `reason`; updates global policy and marks global-policy users for mandatory password update.
- `GET /security/users` — Super: all non-Super users; delegated security Admin: Team and Staff in own unit only. Returns effective policy and whether the user inherits global policy.
- `PATCH /security/users/:userId/password-policy` — Super: any non-Super user; delegated security Admin: Team/Staff in own unit only. Requires a non-empty `reason`; sets a custom policy override.
- `DELETE /security/users/:userId/password-policy` — same scope as override update; requires a non-empty `reason`; clears the custom override and returns user to global policy.
- `POST /security/users/:userId/reset-password` — existing reset authorization scope only; generates and returns a one-time temporary password, then forces password update at next login.
- `GET /security/delegates` — Super only; lists Admin users with `security_admin`.
- `POST /security/delegates/:userId` — Super only; grants `security_admin` to an eligible Admin user; requires a non-empty `reason`.
- `DELETE /security/delegates/:userId` — Super only; revokes `security_admin`; requires a non-empty `reason`.
- `GET /security/audit-events` — Super only; paginated security audit log.

The existing `POST /auth/reset-password/:userId` endpoint must be updated to use the generated temporary-password flow. It must retain its existing authorization scope and must not accept a caller-selected replacement password.

---

## 10. Frontend Routes (by role)

- `/login`
- **Super**: `/super/dashboard`, `/super/units`, `/super/users`, `/super/tickets` (global view/edit)
- **Management**: `/management/dashboard`, `/management/filters`
- **Admin**: `/admin/tickets`, `/admin/team`, `/admin/dashboard` (own dept)
- **Team**: `/team/tickets`, `/team/staff` (create)
- **Staff**: `/staff/tickets` (raise + view own), `/staff/profile`

- **Super**: `/super/security` — global password policy, user policy overrides, delegated security Admin permissions, ordinary-user temporary resets, and security audit records.
- **Delegated Admin**: `/admin/security` — Team/Staff in own unit only; effective policies, permitted user overrides, and temporary-password resets.
- **Forced password update**: `/update-password` — available only to an authenticated restricted session with `mustChangePassword = true`.
- **Super**: `/super/security` — global password policy, user policy overrides, delegated security Admin permissions, ordinary-user temporary resets, and security audit records.
- **Delegated Admin**: `/admin/security` — Team/Staff in own unit only; effective policies, permitted user overrides, and temporary-password resets.
- **Forced password update**: `/update-password` — available only to an authenticated restricted session with `mustChangePassword = true`.

---

## 11. Build Order (recommended, for AI Agent sessions)

1. DB schema + migrations (PostgreSQL, via Knex — see Section 7)
2. Auth (JWT, bcrypt) + role middleware
3. Units/Departments/Users CRUD, scoped by role
4. Ticket CRUD + lifecycle state machine (server-enforced transitions)
5. Auto-close cron job
6. Dashboard metrics + saved filters + CSV/PDF export
7. Frontend shell + auth flow
8. Role-based views/routes
9. Polish, seed data, docker-compose for local dev

---

## 12. Open items / assumptions to revisit later

- No file attachments on tickets (per current spec).
- No email/SMS notifications specified yet — add later if needed.

---
