# IUVO

## Service Request & Ticketing Platform

IUVO is a purpose-built service request and ticketing platform for multi-location healthcare operations.

It gives every unit—from a single facility to a full network of centers—a consistent way to raise, track, assign, resolve, and report internal service requests across:

- IT
- Maintenance
- Bio-Medical

Instead of relying on phone calls, informal messages, or paper logs, staff can raise a request once and follow its progress from submission through resolution, with a complete history preserved for accountability and reporting.

---

- **Evaluation use only:** IUVO is published for demonstration, testing, and
- feedback. Commercial use, sale, redistribution, hosting, and sublicensing
- require prior written permission. See [LICENSE](LICENSE).

---

## Product Overview

IUVO is designed around a structured, role-based workflow. Each user receives exactly one role, with permissions limited to the responsibilities required for that role.

This keeps operational work focused, protects sensitive information, and ensures that every important action is recorded.

---

## Who Uses IUVO

### Staff

Anyone who needs to request support.

- Raise service requests against IT, Maintenance, or Bio-Medical.
- Track personally raised requests.
- Exchange messages with the person handling a request.
- Reopen an eligible resolved request.
- Close a request early after it has been resolved.

### Team

The people who work on and resolve requests.

- View open requests within their department.
- Claim unassigned requests.
- Move assigned requests into progress.
- Record resolution remarks.
- Record repair or replacement cost.
- Resolve requests assigned to them.

### Admin

Department oversight within a unit.

- Oversee the department work queue.
- Assign requests to themselves or eligible Team members.
- Handle requests directly.
- Raise requests for any department within their own unit.
- Create Team and Staff users within their own unit.
- Manage operational work within their assigned scope.

### Management

Cross-unit visibility for leadership.

- View the read-only operational dashboard.
- Review data across units and departments.
- Filter operational data.
- Save and rerun private filters.
- Export reports as CSV or PDF.

### Super

The sole platform-wide administrator.

- Manage units and departments.
- Create and manage ordinary user accounts.
- Oversee tickets across all units and departments.
- Assign and reassign eligible work.
- Manage security settings.
- Control two-factor authentication.
- View system-wide audit information.
- Unlock closed tickets when required.
- Perform approved recovery procedures.

> There is exactly one Super account in the system. It is created manually through the one-time bootstrap command and is never created through normal user management.

---

## How a Request Moves

Every request follows a clear, auditable path:

```text
Open → Assigned → In Progress → Resolved → Closed
```

### Open

The request has been raised and is awaiting assignment.

### Assigned

An eligible Admin or Team user has been assigned to the request.

### In Progress

The assigned person is actively working on the request.

### Resolved

The assignee has completed the work and recorded:

- Resolution remarks.
- Repair or replacement cost.

### Closed

The request is locked for ordinary ticket actions.

The original requester may close their own resolved request early. Resolved requests may also close automatically after the configured waiting period.

If something is not right, the original requester may reopen their own eligible resolved request. Super may reopen any resolved request. Reopening returns the request to `In Progress` and retains the current assignee.

---

## Built-In Messaging

Every request has its own conversation thread.

This keeps important context attached to the request instead of scattering it across email, phone calls, or informal messages.

- The requester and current assignee can exchange messages.
- Super can view and participate in ticket conversations.
- Matching Admin users can view relevant conversations.
- Closed tickets remain readable but cannot receive new messages.
- Unread indicators show when new activity requires attention.

IUVO intentionally avoids pressure-oriented displays such as “how long ago” message timestamps. The goal is to keep communication useful, clear, and focused.

---

## Reporting and Insight

Management and Super users have access to operational reporting.

Available dashboard capabilities include:

- Tickets by status.
- Tickets by department.
- Tickets by unit.
- Average resolution time.
- Workload distribution.
- Unresolved tickets by department.
- Open-versus-closed trends.
- Filters by unit, department, status, priority, date range, and assignee.
- Private saved filters.
- CSV export.
- PDF export.

Saved filters belong only to the account that created them. They are not shared between Management and Super users.

---

## Security and Data Protection

Security is a foundational requirement of IUVO.

### Role-based access

Every user has exactly one role, and access is enforced on the server.

- Staff cannot access another user’s tickets.
- Team members cannot access administrative functions.
- Admins are limited to their assigned unit and department.
- Management has read-only dashboard access.
- Super has system-wide authority.

### Password protection

Passwords are never stored in readable form.

IUVO stores only bcrypt password hashes and applies server-side password-policy validation whenever passwords are created or changed.

### Two-factor authentication

Super can enable or disable TOTP-based two-factor authentication for individual accounts.

When enabled:

1. The user enters their username and password.
2. The user provides a code from an authenticator app.
3. The backend issues the full authenticated session only after both steps succeed.

TOTP secrets are encrypted at rest using AES-256-GCM.

### Audit trail

Important ticket actions are recorded, including:

- Ticket creation.
- Assignment.
- Reassignment.
- Status changes.
- Priority changes.
- Resolution.
- Manual closure.
- Automatic closure.
- Reopening.
- Super unlock actions.
- Ticket messages.

Security-sensitive actions are recorded separately, including:

- Password-policy changes.
- Permission changes.
- Password resets.
- Recovery actions.
- Security administration attempts.

### Brute-force protection

Login attempts are rate-limited to reduce automated password-guessing attacks.

---

## Reliability and Testing

IUVO has been tested across core operational and security workflows.

Testing covers:

- Authentication.
- Role permissions.
- User management.
- Unit and department management.
- Ticket creation.
- Ticket assignment.
- Ticket lifecycle transitions.
- Resolution remarks and repair cost.
- Manual closure.
- Automatic closure.
- Super unlock.
- Ticket messaging.
- Dashboard access.
- Saved filters.
- Security administration.
- Password policy enforcement.

The application has also been load-tested with concurrent users performing realistic workflows.

Ticket-number allocation was specifically tested under concurrent creation to confirm that simultaneous requests receive distinct ticket numbers without collisions.

> Tests should be run only against development, staging, or disposable databases. Do not run disposable load tests against production.

---

## Technology Stack

- Node.js
- Express
- PostgreSQL
- Knex migrations
- React
- JWT authentication
- bcrypt password hashing
- TOTP two-factor authentication
- Docker
- Docker Compose

---

## Quick Start

The repository does not contain demo users, shared passwords, client data, or production credentials.

The first Super account must be created manually after the containers and database are running.

### Requirements

- Git
- Docker Desktop
- Docker Compose v2

### Clone the repository

```powershell
git clone [https://github.com/Bot-for-What/iuvo.git](https://github.com/Bot-for-What/iuvo.git)
cd iuvo
```

### Create private environment files

Copy the provided example files:

```powershell
Copy-Item .env.docker.example .env.docker
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Open the private files and replace the placeholders:

```powershell
notepad .env.docker
notepad backend\.env
notepad frontend\.env
```

Never commit these private files.

### Start the containers

```powershell
docker compose up -d --build
```

Check the container status:

```powershell
docker compose ps
```

### Apply database migrations

```powershell
docker compose exec backend npm run migrate:latest
```

### Create the first Super account

```powershell
docker compose exec -it backend npm run create-super
```

Follow the interactive prompts.

The Super password must satisfy the required Super password policy:

- At least 12 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.

### Open IUVO

Open the frontend address configured by the Docker deployment and sign in using the Super account created above.

After signing in, Super can create the first unit and ordinary users.

---

## No Demo Users or Client Data

This public repository intentionally does not include:

- Default usernames.
- Default passwords.
- Demo users.
- Demo tickets.
- Production data.
- Client-specific branding assets.
- Database dumps.
- PostgreSQL data volumes.
- Private environment files.
- JWT, TOTP, recovery, or database secrets.

The repository includes only the fixed global departments required by the application:

- IT.
- Maintenance.
- Bio-Medical.

---

## Project Documentation

Operational documentation is maintained separately:

- [Deployment guide](DEPLOYMENT.md)
- [Backup and restore guide](BACKUP-RESTORE.md)
- [Super recovery procedure](RECOVERY.md)

---

## Project Status

IUVO’s core application functionality, Docker setup, authentication, role-based access, ticket lifecycle, reporting, security controls, and client-asset cleanup have been implemented.

The remaining project work is documentation verification and a clean-clone deployment test.

---
## Project Images

<img width="486" height="350" alt="image" src="https://github.com/user-attachments/assets/15af1075-e198-4428-80b0-736cbf3c7192" />
<img width="489" height="352" alt="image" src="https://github.com/user-attachments/assets/2f6fe2c7-1241-43fd-88d0-f7c5781c37b1" />
<img width="802" height="579" alt="image" src="https://github.com/user-attachments/assets/cd5ddd48-f033-463a-b965-463f1ef9eae9" />
<img width="903" height="703" alt="image" src="https://github.com/user-attachments/assets/cc35fcfd-4f62-4af9-9f43-6ade44541a4b" />
<img width="434" height="753" alt="image" src="https://github.com/user-attachments/assets/dfc401cc-8934-46b1-90d2-62c26a9d7480" />
---

## Contact
   For questions about this platform, please contact me.
   
---

## Quick Start

IUVO is deployed as Docker containers with PostgreSQL.

### Requirements

- Git
- Docker Desktop
- Docker Compose v2
- At least 2 GB of available memory for the containers

### Clone the repository

```powershell
git clone [https://github.com/Bot-for-What/iuvo.git](https://github.com/Bot-for-What/iuvo.git)
cd iuvo
```

### Create private environment files

Copy the provided examples:

```powershell
Copy-Item .env.docker.example .env.docker
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Open the files and replace every placeholder with a private value:

```powershell
notepad .env.docker
notepad backend\.env
notepad frontend\.env
```

Never commit these private files.

### Start IUVO

```powershell
docker compose up -d --build
```

Check the containers:

```powershell
docker compose ps
```

Check the backend health endpoint:

```powershell
curl http://localhost:30040/health
```

The expected response is similar to:

```json
{
  "status": "ok"
}
```

### Apply database migrations

```powershell
docker compose exec backend npm run migrate:latest
```

### Create the first Super account

The repository does not contain a default user, demo account, or hardcoded password.

Create the one permitted Super account interactively:

```powershell
docker compose exec -it backend npm run create-super
```

Follow the prompts for:

- Username
- Full name
- Password
- Password confirmation

The Super password must contain:

- At least 12 characters.
- One uppercase letter.
- One lowercase letter.
- One number.
- One special character.

### Open the application

Open the frontend URL configured for the Docker deployment, then sign in with the Super account created above.

The Super account can create:

- Units.
- Unit department configuration.
- Management users.
- Admin users.
- Team users.
- Staff users.

IUVO intentionally does not include seeded users or shared demo credentials.

---

## Ticket Lifecycle

Tickets follow this lifecycle:

```text
Open → Assigned → In Progress → Resolved → Closed
```

- Open: the request has been created and has no assignee.
- Assigned: an eligible Admin or Team user has been assigned.
- In Progress: the assigned Admin or Team user is working on the request.
- Resolved: the assignee has recorded resolution remarks and repair cost.
- Closed: the request is locked for ordinary ticket actions.

The original ticket raiser may reopen their own Resolved ticket while it remains Resolved. Super may reopen any Resolved ticket. Reopening returns the ticket to In Progress and retains the current assignee.

A ticket may be closed manually by its original raiser or Super while it is Resolved. Resolved tickets are also eligible for automatic closure after the configured 48-hour period. Closed tickets can be unlocked only by Super, with a required reason and an audit record.

---

## Application Roles

| Role | Main access |
|---|---|
| Staff | Raise and track own tickets; communicate on own tickets; reopen own eligible Resolved tickets |
| Team | Work on tickets in the assigned unit and department; claim, progress, and resolve tickets |
| Admin | Manage work in the assigned unit and department; assign work; create Team and Staff users in the unit |
| Management | Read-only cross-unit dashboard, filters, saved filters, and exports |
| Super | System-wide administration, user management, ticket oversight, security administration, and recovery controls |

Each account has exactly one role. Super is a single system account and cannot be created through the normal user-management API.

---

## No Demo Users or Credentials

This repository does not include:

- Default usernames.
- Default passwords.
- Demo users.
- Demo tickets.
- Production data.
- Client-specific assets.
- Database dumps or Docker database volumes.

After installation, the database contains only the fixed global departments required by the application. The first Super account must be created manually with the one-time CLI command.

---

## Testing

Tests must run against a development, staging, or disposable database. Do not run sanity or load tests against production.

From the `backend` directory:

```powershell
$env:BASE_URL="http://localhost:30040"
$env:SUPER_USERNAME="your_super_username"
$env:SUPER_PASSWORD="your_super_password"
node sanity-tests-v3.js
```

Expected result:

```text
47 passed, 0 failed
```

For a disposable load test:

```powershell
$env:BASE_URL="http://localhost:30040"
$env:SUPER_USERNAME="your_super_username"
$env:SUPER_PASSWORD="your_super_password"
$env:VIRTUAL_USERS="50"
$env:ITERATIONS="5"
node load-test.js
```

Load tests create disposable records and should not be run against production.

---

## Operations Documentation

- [Deployment guide](DEPLOYMENT.md)
- [Backup and restore](BACKUP-RESTORE.md)
- [Super recovery procedure](RECOVERY.md)

---

## License and Usage

IUVO is provided under the IUVO Evaluation License.

You may download and run the application for:

- Demonstration.
- Evaluation.
- Testing.
- Education.
- Feedback and bug reporting.

Without prior written permission, you may not:

- Sell the application.
- Commercialize the application.
- Offer it as a hosted or SaaS service.
- Redistribute the application or modified versions.
- Use it to provide services to third parties.

See the [LICENSE](LICENSE.md) file for the complete terms.
