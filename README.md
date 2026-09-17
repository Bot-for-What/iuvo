
iuvo

Service Request & Ticketing Platform

Product Overview

Overview
iuvo is a purpose-built service request and ticketing platform designed for multi-location healthcare operations. It gives every unit — from a single facility to a full network of centers — a consistent, structured way to raise, track, and resolve internal service requests across IT, Maintenance, and Bio-Medical support.
Rather than relying on phone calls, informal messages, or paper logs, staff at every level raise a request once and can follow its progress from submission through to resolution, with a full history preserved for accountability and reporting.
This document introduces the platform's core capabilities for both operational leadership and technical stakeholders.
Who Uses iuvo
iuvo is organized around five roles, each with a clear and deliberately limited set of responsibilities — no user sees or does more than their role requires.

Staff
Anyone who needs to request support
•	Raise a service request against IT, Maintenance, or Bio-Medical support
•	Track their own requests from submission to resolution
•	Exchange messages directly on a request with the person handling it
•	Close a request early once satisfied it's resolved

Team
The people who resolve requests
•	See and claim open requests within their department
•	Update progress as work moves forward
•	Record what was done and any associated cost upon resolution

Admin
Department oversight within a unit
•	Oversee their department's request queue
•	Assign work to team members, or handle requests directly
•	Onboard new team members and staff within their own unit

Management
Cross-unit visibility for leadership
•	Full reporting dashboard across every unit and department
•	Filter, save, and re-run custom views of operational data
•	Export reports as CSV or PDF for further analysis

Super Administrator
Platform-wide oversight
•	System-wide configuration: units, departments, and accounts
•	Full audit trail and security administration
•	The sole authority for platform-level configuration changes
 
How a Request Moves Through the System
Every request follows a clear, auditable path from creation to close, so nothing is lost track of and every action is recorded.

Open  →  Assigned  →  In Progress  →  Resolved  →  Closed

•	A request starts Open and unassigned, visible to the relevant department.
•	A team member claims it, or a department admin assigns it — moving it to Assigned.
•	Work begins (In Progress), and once complete, the assignee records what was done and any repair cost, moving it to Resolved.
•	The original requester can close it immediately once satisfied, or it closes automatically after a defined window — nothing is left open indefinitely.
•	If something isn't right, the requester can reopen a just-resolved request before it closes, keeping the same person on the case.

<img width="486" height="350" alt="image" src="https://github.com/user-attachments/assets/15af1075-e198-4428-80b0-736cbf3c7192" />
<img width="489" height="352" alt="image" src="https://github.com/user-attachments/assets/2f6fe2c7-1241-43fd-88d0-f7c5781c37b1" />


<img width="802" height="579" alt="image" src="https://github.com/user-attachments/assets/cd5ddd48-f033-463a-b965-463f1ef9eae9" />

 
Staying in the Loop: Built-In Messaging
Every request has its own conversation thread, so context stays attached to the request itself rather than scattered across emails or phone calls.
•	The requester and the person handling the request can exchange messages directly on the ticket.
•	A simple, unobtrusive indicator lets each side know when there's something new to read — without pressure tactics like timestamps or "how long ago" displays, which we deliberately avoided to keep the tool helpful rather than stressful to use.

<img width="903" height="703" alt="image" src="https://github.com/user-attachments/assets/cc35fcfd-4f62-4af9-9f43-6ade44541a4b" />

 
Reporting & Insight for Leadership
Management and Super users have access to the operational dashboard. Management provides cross-unit read-only reporting access, while Super has system-wide oversight.
•	Ticket volumes by status, department, and unit
•	Average resolution time and workload distribution across team members
•	Open-versus-closed trends over time
•	Custom filters that can be saved and re-run with one click
•	Export to CSV or PDF for offline reporting and board-level summaries

<img width="434" height="753" alt="image" src="https://github.com/user-attachments/assets/dfc401cc-8934-46b1-90d2-62c26a9d7480" />

 
Security & Data Protection
iuvo was built with security as a foundational requirement, not an afterthought. Highlights relevant to both operational and technical stakeholders:
Access control
•	Every user has exactly one role, with permissions strictly enforced — a Staff account can never see another department's data, and a Team member can never access administrative functions.
•	Passwords are never stored in readable form — only irreversibly hashed (bcrypt).
Two-factor authentication
•	Optional two-factor authentication (via any standard authenticator app) can be enabled per account, adding a second layer of protection for sensitive accounts.
Full audit trail
•	Every meaningful action on a ticket — creation, assignment, status changes, resolution, closure — is permanently logged with who did it and when.
•	Security-sensitive actions (password policy changes, permission changes, account resets) are logged separately from operational activity, and reviewable by authorized administrators.
Brute-force protection
•	Login attempts are automatically rate-limited, preventing automated password- or code-guessing attacks.
Encrypted secrets
•	Two-factor authentication secrets are encrypted at rest using industry-standard AES-256 encryption, never stored or transmitted in plain form.
 
Built and Tested for Reliability
Before being handed over, iuvo was put through structured testing covering both correctness and real-world performance — not just checked once during development, but re-verified after every significant change.
•	An automated test suite covering every core workflow — account access, ticket handling, messaging, resolution, and security controls — runs end-to-end with each update, catching issues before they reach real use.
•	The platform was load-tested under concurrent use, simulating up to 100 people actively logging in, listing, and raising requests at the same time, with no errors and no lost or duplicated ticket numbers.
•	Ticket numbering was specifically hardened against the kind of timing conflicts that can occur when many people submit requests in the same moment — verified collision-free under sustained concurrent testing.
This testing discipline is ongoing: the same checks are re-run whenever the platform changes, so reliability isn't a one-time claim but a standing practice.
 
iuvo's unit-and-department model was built to scale from a single facility to a full multi-location network without structural changes. A handful of capabilities have been deliberately designed but not yet activated, so they can be enabled quickly if and when a real operational need arises — rather than being built speculatively ahead of demand:
•	Delegated administrative permissions, allowing platform-wide responsibilities to be shared with trusted administrators on a controlled, per-unit basis
•	Extended reporting views for unit-level leadership roles
This approach keeps the platform lean and focused today, while ensuring it can adapt as the organization's needs evolve.
 
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
