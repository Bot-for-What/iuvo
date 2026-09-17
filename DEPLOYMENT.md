# IUVO Deployment Guide

This guide explains how to deploy IUVO from the public GitHub repository using Docker Compose.

IUVO runs as three containers:

- PostgreSQL database.
- Node.js and Express backend.
- React frontend served by Nginx.

The repository does not include demo users, shared credentials, production data, or client-specific assets.

---

## Deployment Architecture

```text
Browser
   |
   | http://localhost:8080
   v
Frontend container
   |
   | API requests
   v
Backend container
   |
   | PostgreSQL connection
   v
PostgreSQL container
```

Default ports:

| Service | Host port | Container port |
|---|---:|---:|
| Frontend | `8080` | `80` |
| Backend API | `30040` | `30040` |
| PostgreSQL | `30041` | `5432` |

The frontend is the normal entry point for users.

---

## Requirements

Install the following before starting:

- Git.
- Docker Desktop.
- Docker Compose v2.
- At least 2 GB of available memory for the containers.
- Network access to download the base Docker images and npm dependencies during the first build.

Verify Docker:

```powershell
docker --version
docker compose version
```

---

## Clone the Repository

```powershell
git clone [https://github.com/Bot-for-What/iuvo.git](https://github.com/Bot-for-What/iuvo.git)
cd iuvo
```

Do not run the application from a directory containing another project’s environment files.

---

## Create the Environment File

Docker Compose automatically reads a root-level file named:

```text
.env
```

Copy the public example file to the required private filename:

```powershell
Copy-Item .env.docker.example .env
```

Open the private environment file:

```powershell
notepad .env
```

Replace every placeholder with a private value.

A deployment environment requires values for:

```env
DB_USER=postgres
DB_PASSWORD=replace-with-a-long-private-password
DB_NAME=service_request_app

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1h

PENDING_2FA_JWT_SECRET=replace-with-a-different-long-random-secret
PENDING_2FA_EXPIRES_IN=10m

TOTP_ENCRYPTION_KEY=replace-with-a-32-byte-encryption-key
TOTP_ISSUER=IUVO

INTERNAL_CRON_KEY=replace-with-a-private-cron-key
FRONTEND_ORIGIN=http://localhost:8080

BCRYPT_ROUNDS=12
SUPER_RECOVERY_KEY=replace-with-a-private-recovery-key
```

The exact variable names must match `.env.docker.example`.

### Secret requirements

Use different random values for:

- `JWT_SECRET`.
- `PENDING_2FA_JWT_SECRET`.
- `TOTP_ENCRYPTION_KEY`.
- `INTERNAL_CRON_KEY`.
- `SUPER_RECOVERY_KEY`.

Do not reuse a password or secret across multiple variables.

Do not commit `.env`.

Check the repository status:

```powershell
git status --short
```

The private environment file must not appear as an untracked file ready to commit. It should be ignored by `.gitignore`.

---

## Start the Application

Start all containers using the standard Docker Compose command:

```powershell
docker compose up -d --build
```

Docker Compose automatically reads the root-level `.env` file and substitutes its values into `docker-compose.yml`.

Check the container status:

```powershell
docker compose ps
```

View startup logs:

```powershell
docker compose logs --tail=100
```

View logs for an individual service:

```powershell
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 postgres
```

The PostgreSQL container must become healthy before the backend can connect to it. The backend waits for the PostgreSQL health check configured in `docker-compose.yml`.

---

## Run Database Migrations

After the containers are running, apply all tracked Knex migrations:

```powershell
docker compose exec backend npm run migrate:latest
```

Check migration status:

```powershell
docker compose exec backend npm run migrate:status
```

The migration command must complete successfully before the first login.

The database contains the fixed global departments required by IUVO:

- IT.
- Maintenance.
- Bio-Medical.

No users are created by migrations.

---

## Create the First Super Account

IUVO does not include a default Super username or password.

Create the sole Super account interactively:

```powershell
docker compose exec -it backend npm run create-super
```

The command prompts for:

- Super username.
- Super full name.
- Super password.
- Password confirmation.

The Super password must contain:

- At least 12 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.

The command refuses to create a second Super account.

Do not create a Super account through a seed file or normal user-management API.

---

## Open the Application

Open the frontend in a browser:

```text
http://localhost:8080
```

Sign in with the Super account created in the previous step.

After signing in, Super can:

1. Create a unit.
2. Enable or disable service departments for that unit.
3. Create Management, Admin, Team, and Staff accounts.
4. Configure security settings.
5. Test the ticket workflow.

---

## Health Checks

Check the backend directly:

```powershell
Invoke-WebRequest http://localhost:30040/health
```

A successful response should have HTTP status `200`.

You can also open this address in a browser:

```text
http://localhost:30040/health
```

Check the frontend:

```powershell
Invoke-WebRequest http://localhost:8080
```

A successful response should have HTTP status `200`.

Check container status:

```powershell
docker compose ps
```

The PostgreSQL service should show a healthy status after startup.

---

## Updating IUVO

Before updating, create a database backup according to `BACKUP-RESTORE.md`.

Then stop the application:

```powershell
docker compose down
```

Download the latest source:

```powershell
git pull origin main
```

Rebuild and restart the containers:

```powershell
docker compose up -d --build
```

Apply any new migrations:

```powershell
docker compose exec backend npm run migrate:latest
```

Check the logs:

```powershell
docker compose logs --tail=100
```

The PostgreSQL volume is preserved by:

```powershell
docker compose down
```

Do not use `down --volumes` unless you intentionally want to delete the database.

---

## Stopping the Application

Stop and remove the containers while preserving database data:

```powershell
docker compose down
```

Start the existing deployment again:

```powershell
docker compose up -d
```

Do not run:

```powershell
docker compose down --volumes
```

unless you intentionally want to destroy the PostgreSQL data volume.

---

## Rebuilding Without Removing Data

To rebuild the application images while preserving PostgreSQL data:

```powershell
docker compose up -d --build
```

The named PostgreSQL volume remains intact unless it is explicitly removed.

List Docker volumes:

```powershell
docker volume ls
```

---

## Super Recovery

If the Super password must be replaced through the approved break-glass process, confirm that `SUPER_RECOVERY_KEY` is set in the private `.env` file and run:

```powershell
docker compose exec -it backend npm run recover-super
```

The recovery command:

- Runs only inside the backend container.
- Targets only the existing Super account.
- Does not accept a target user ID.
- Prompts securely for the recovery key.
- Prompts for the replacement password twice.
- Validates the fixed Super password policy.
- Clears the Super TOTP enrollment.
- Records a security audit event without recording secrets.

After recovery:

1. Sign in with the replacement password.
2. Re-enroll Super TOTP immediately.
3. Treat the recovery key as sensitive.
4. Rotate the recovery key if it may have been exposed.

Read `RECOVERY.md` before using this procedure.

---

## Production Security Checklist

Before exposing IUVO beyond a local development machine:

- Replace every placeholder in `.env`.
- Use long, randomly generated secrets.
- Use a strong database password.
- Keep `.env` outside Git.
- Restrict access to ports `30040` and `30041`.
- Expose only the frontend through the intended reverse proxy or firewall.
- Use HTTPS at the public edge.
- Restrict PostgreSQL so it is not publicly accessible.
- Configure regular PostgreSQL backups.
- Test restoration before relying on backups.
- Keep Docker images and host operating-system packages updated.
- Enable Super two-factor authentication after initial login.
- Rotate secrets if they are ever exposed.
- Do not run load tests against production.
- Do not use disposable test data in production.
- Review audit records and container logs regularly.

### PostgreSQL host port

For local testing, PostgreSQL is exposed on host port `30041`.

For a server deployment where the database does not need to be accessed directly from the host, consider removing this mapping from `docker-compose.yml`:

```yaml
ports:
  - "30041:5432"
```

The backend will still connect internally using:

```yaml
DB_HOST: postgres
DB_PORT: 5432
```

---

## No Demo Data Policy

A clean installation does not create demo users or demo tickets.

The public repository does not contain:

- Default accounts.
- Shared passwords.
- Password hashes.
- Client-specific branding assets.
- Production data.
- Database dumps.
- PostgreSQL volumes.
- Private environment files.

Each deployment owner creates the first Super account manually and then creates the remaining users through IUVO.

---

## Troubleshooting

### PostgreSQL is not healthy

Check the database logs:

```powershell
docker compose logs postgres
```

Check the service status:

```powershell
docker compose ps
```

Confirm that `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are set correctly in `.env`.

Restart the services:

```powershell
docker compose restart postgres backend
```

### Backend cannot connect to PostgreSQL

The backend must use the Docker service hostname:

```text
DB_HOST=postgres
DB_PORT=5432
```

Do not use `localhost` for `DB_HOST` inside the backend container.

Check the backend logs:

```powershell
docker compose logs backend
```

### Migration fails

View backend logs:

```powershell
docker compose logs --tail=200 backend
```

Check migration status:

```powershell
docker compose exec backend npm run migrate:status
```

Do not manually edit the production database to bypass a failed migration.

### Frontend does not load

Check frontend logs:

```powershell
docker compose logs --tail=200 frontend
```

Confirm that the frontend container is running:

```powershell
docker compose ps frontend
```

Rebuild the frontend:

```powershell
docker compose up -d --build frontend
```

### The browser cannot reach the backend

Confirm the backend is running:

```powershell
docker compose ps backend
```

Check the health endpoint:

```powershell
Invoke-WebRequest http://localhost:30040/health
```

Confirm that `FRONTEND_ORIGIN` matches the address used by the browser:

```env
FRONTEND_ORIGIN=http://localhost:8080
```

---

## Related Documentation

- [Project README](README.md)
- [Backup and restore](BACKUP-RESTORE.md)
- [Super recovery procedure](RECOVERY.md)
