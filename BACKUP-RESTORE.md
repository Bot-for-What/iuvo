# IUVO Backup and Restore Guide

This guide explains how to back up and restore the IUVO PostgreSQL database running through Docker Compose.

The database contains:

- Units.
- Departments and unit-department configuration.
- Users.
- Password hashes.
- Two-factor authentication settings and encrypted TOTP secrets.
- Tickets.
- Ticket messages.
- Ticket audit history.
- Security audit records.
- Saved filters.
- Password-policy settings.

Treat every backup as sensitive. A database backup may contain operational data, account information, password hashes, encrypted security material, and audit records.

---

## Important Security Rules

Never commit database backups to GitHub.

Do not place backups inside tracked project directories.

Do not upload backups to public file-sharing services.

Store backups in a private location with restricted access and encryption at rest.

Never include these values in a backup filename or log:

- Database password.
- JWT secret.
- TOTP encryption key.
- Super recovery key.
- Internal cron key.

A database backup does not replace the private deployment environment file. A successful restore still requires the correct application secrets in `.env.docker`.

---

## Deployment Assumptions

The Docker Compose deployment uses:

| Setting | Value |
|---|---|
| Database service | `postgres` |
| Database container port | `5432` |
| Host database port | `30041` |
| Database name | Value of `DB_NAME` |
| Database user | Value of `DB_USER` |
| Private environment file | `.env.docker` |
| Persistent Docker volume | `postgres_data` |

All commands in this guide explicitly use:

```powershell
--env-file .env.docker
```

---

## Backup Types

This guide uses logical PostgreSQL backups created with `pg_dump`.

Logical backups are portable and can be restored into a new PostgreSQL database. The custom archive format is suitable for `pg_restore` and supports flexible restoration options. [367][368]

The Docker volume is not a substitute for a logical database backup. A volume stores the live database files and can be damaged, deleted, or become unusable with host failure.

Use both:

- Scheduled logical database backups.
- Appropriate Docker volume and host-storage protection.

---

## Before Creating a Backup

Confirm that the environment file exists:

```powershell
Test-Path .env.docker
```

The command should return:

```text
True
```

Check the running services:

```powershell
docker compose --env-file .env.docker ps
```

Confirm that the PostgreSQL container is running and healthy.

Create a private backup directory outside the repository:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\iuvo-backups"
```

Do not create the backup directory inside the IUVO project directory.

---

## Database Values

The examples in this guide use the default values from `.env.docker.example`:

```env
DB_USER=postgres
DB_NAME=service_request_app
```

If your private `.env.docker` uses different values, replace
`postgres` and `service_request_app` in the backup and restore commands with
your configured values.

The database password is not placed in the commands. Docker Compose reads it
from `.env.docker`.

---

## Create a Database Backup

The following command runs `pg_dump` inside the PostgreSQL container and writes a custom-format backup to the host machine.

From the project root:

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = "$HOME\iuvo-backups\iuvo-$timestamp.dump"

docker compose --env-file .env.docker exec -T postgres `
  pg_dump `
  -U postgres `
  -d $env:DB_NAME `
  -F c `
  -f "/tmp/iuvo-$timestamp.dump"

docker compose --env-file .env.docker cp `
  "postgres:/tmp/iuvo-$timestamp.dump" `
  $backupFile

docker compose --env-file .env.docker exec -T postgres `
  rm -f "/tmp/iuvo-$timestamp.dump"
```

The command above assumes the PostgreSQL container uses the `postgres` database user, which is the default value in the provided Compose configuration.

If your private `DB_USER` value is different, replace:

```text
-U postgres
```

with the matching database user.

The resulting backup file will be stored outside the project directory, for example:

```text
C:\Users\<username>\iuvo-backups\iuvo-20260917-143000.dump
```

---

## Verify the Backup File

Check that the file exists and is not empty:

```powershell
Get-ChildItem "$HOME\iuvo-backups\*.dump" |
  Select-Object Name, Length, LastWriteTime
```

A backup file should have a non-zero size.

If the PostgreSQL client tools are installed on the host, inspect the archive:

```powershell
pg_restore --list "C:\path\to\iuvo-backups\iuvo-YYYYMMDD-HHMMSS.dump"
```

If `pg_restore` is not installed on the host, inspect it inside the PostgreSQL container:

```powershell
docker compose --env-file .env.docker cp `
  "C:\path\to\iuvo-backups\iuvo-YYYYMMDD-HHMMSS.dump" `
  "postgres:/tmp/restore-check.dump"

docker compose --env-file .env.docker exec -T postgres `
  pg_restore --list /tmp/restore-check.dump

docker compose --env-file .env.docker exec -T postgres `
  rm -f /tmp/restore-check.dump
```

The archive should list IUVO tables, sequences, indexes, constraints, and data.

---

## Recommended Backup Schedule

For a production deployment, choose a schedule based on how much data can be recreated or lost.

A reasonable starting point is:

- Daily full logical backup.
- More frequent backups if tickets and messages are business-critical.
- Retention of multiple recent backups.
- At least one encrypted copy outside the deployment host.
- Periodic restoration tests.

At minimum, keep backups covering:

- The most recent daily period.
- Several previous weeks.
- A monthly recovery point where appropriate.

The exact retention period is an operational decision for the organization using IUVO.

---

## Protect Backup Files

Backup files may contain sensitive data. Restrict access to the backup directory.

On Windows, use a private directory accessible only to the intended operator or service account.

Do not email unencrypted backups.

Do not upload backups to:

- GitHub.
- Public cloud storage.
- Public issue trackers.
- Chat rooms.
- Unsecured shared folders.

If backups are stored remotely, use encrypted storage and restricted access.

---

## Restore Overview

Restoring a database replaces or adds database objects and data. Treat restoration as a destructive operation.

Before restoring:

1. Confirm the correct backup file.
2. Confirm the target deployment.
3. Create a backup of the current database.
4. Stop the backend and frontend containers.
5. Keep the PostgreSQL container running only when required by the restore command.
6. Verify the restore result before allowing users to reconnect.

Do not restore a production backup into a public or shared development environment unless sensitive data has been handled appropriately.

---

## Create a Safety Backup Before Restore

Before replacing an existing database, create a backup of its current state:

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$preRestoreBackup = "$HOME\iuvo-backups\iuvo-before-restore-$timestamp.dump"

docker compose --env-file .env.docker exec -T postgres `
  pg_dump `
  -U postgres `
  -d $env:DB_NAME `
  -F c `
  -f "/tmp/iuvo-before-restore-$timestamp.dump"

docker compose --env-file .env.docker cp `
  "postgres:/tmp/iuvo-before-restore-$timestamp.dump" `
  $preRestoreBackup

docker compose --env-file .env.docker exec -T postgres `
  rm -f "/tmp/iuvo-before-restore-$timestamp.dump"
```

Do not continue until the safety backup has been confirmed.

---

## Restore into the Existing Database

Use this process only when you intend to replace the current IUVO database.

Set the backup path:

```powershell
$backupFile = "C:\path\to\iuvo-backups\iuvo-YYYYMMDD-HHMMSS.dump"
```

Stop the application containers while preserving PostgreSQL:

```powershell
docker compose --env-file .env.docker stop backend frontend
```

Copy the backup into the PostgreSQL container:

```powershell
docker compose --env-file .env.docker cp `
  $backupFile `
  "postgres:/tmp/iuvo-restore.dump"
```

Terminate active connections to the IUVO database:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d postgres `
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$env:DB_NAME' AND pid <> pg_backend_pid();"
```

Drop and recreate the target database:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d postgres `
  -c "DROP DATABASE IF EXISTS `"$env:DB_NAME`";"

docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d postgres `
  -c "CREATE DATABASE `"$env:DB_NAME`" OWNER `"$env:DB_USER`";"
```

Restore the archive:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  pg_restore `
  -U postgres `
  -d $env:DB_NAME `
  --no-owner `
  --no-privileges `
  --exit-on-error `
  /tmp/iuvo-restore.dump
```

Remove the temporary archive:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  rm -f /tmp/iuvo-restore.dump
```

Start the application containers:

```powershell
docker compose --env-file .env.docker start backend frontend
```

Check the backend logs:

```powershell
docker compose --env-file .env.docker logs --tail=200 backend
```

Check the health endpoint:

```powershell
Invoke-WebRequest http://localhost:30040/health
```

A successful response should have HTTP status `200`.

The `--no-owner` and `--no-privileges` options avoid requiring the original database owner and privilege configuration during restoration. The archive format is restored with `pg_restore`, which is the PostgreSQL utility intended for non-plain-text `pg_dump` archives. [367]

---

## Restore into a Separate Recovery Database

For a safer test restore, create a separate database instead of replacing the live IUVO database.

Copy the backup into the PostgreSQL container:

```powershell
$backupFile = "C:\path\to\iuvo-backups\iuvo-YYYYMMDD-HHMMSS.dump"

docker compose --env-file .env.docker cp `
  $backupFile `
  "postgres:/tmp/iuvo-recovery.dump"
```

Create a recovery database:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d postgres `
  -c "CREATE DATABASE iuvo_recovery OWNER `"$env:DB_USER`";"
```

Restore the archive:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  pg_restore `
  -U postgres `
  -d iuvo_recovery `
  --no-owner `
  --no-privileges `
  --exit-on-error `
  /tmp/iuvo-recovery.dump
```

List tables in the recovery database:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d iuvo_recovery `
  -c "\dt"
```

Check the migration table:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d iuvo_recovery `
  -c "SELECT * FROM knex_migrations ORDER BY id;"
```

Remove the recovery database after verification:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  psql `
  -U postgres `
  -d postgres `
  -c "DROP DATABASE IF EXISTS iuvo_recovery;"
```

Remove the temporary archive:

```powershell
docker compose --env-file .env.docker exec -T postgres `
  rm -f /tmp/iuvo-recovery.dump
```

---

## Restore Verification Checklist

After a restore, verify:

- PostgreSQL is healthy.
- The backend starts successfully.
- The backend health endpoint returns HTTP `200`.
- The frontend loads.
- The Super account can authenticate.
- Expected units exist.
- Expected users exist.
- Ticket counts are present.
- Ticket audit history is present.
- Ticket messages are present.
- Saved filters are present for their original owners.
- Security audit records are present.
- No migration errors appear in the backend logs.
- TOTP login works for accounts that had 2FA enabled.
- The application can create a test ticket if appropriate.

Do not change restored production data merely to test the deployment. Prefer a separate recovery database or isolated recovery environment.

---

## Secrets After Restore

A database restore does not restore or reveal `.env.docker`.

The restored database may contain encrypted TOTP secrets. To use them successfully, the restored application must use the same:

```env
TOTP_ENCRYPTION_KEY
```

that was active when the backup was created.

If the encryption key is unavailable, encrypted TOTP secrets may not be usable. Do not replace the key casually.

The application also requires valid current values for:

```env
JWT_SECRET
PENDING_2FA_JWT_SECRET
INTERNAL_CRON_KEY
SUPER_RECOVERY_KEY
```

These secrets are deployment configuration, not database contents.

If any secret was exposed, rotate it according to the project’s security and recovery procedures.

---

## Docker Volume Warning

The PostgreSQL data is stored in the named Docker volume:

```text
postgres_data
```

Normal shutdown preserves the volume:

```powershell
docker compose --env-file .env.docker down
```

This command removes containers but does not remove the named database volume.

The following command removes the database volume:

```powershell
docker compose --env-file .env.docker down --volumes
```

Do not use `down --volumes` unless you intentionally want to destroy the local database.

A Docker volume is not a backup. Maintain independent logical backups.

---

## Disaster Recovery

If the deployment host is lost:

1. Provision a replacement Docker host.
2. Clone the IUVO repository.
3. Create a new private `.env.docker`.
4. Use the required database and application secrets.
5. Start PostgreSQL and the application containers.
6. Stop the backend and frontend containers if necessary.
7. Restore the latest verified database backup.
8. Start the backend and frontend.
9. Verify migrations and application health.
10. Test Super authentication.
11. Verify ticket and audit data.
12. Re-enroll TOTP only if the original TOTP encryption key is unavailable or recovery requires it.
13. Rotate secrets if the original host or environment file may have been exposed.

Follow `RECOVERY.md` for Super break-glass recovery.

---

## Backup Testing

A backup is not considered reliable until it has been restored successfully.

Test restoration periodically:

- Restore into a separate recovery database.
- Verify schema and data.
- Confirm application startup.
- Confirm authentication.
- Confirm representative ticket and audit records.
- Record the restore date and outcome.
- Remove temporary recovery data securely.

Do not wait for a production incident to discover that a backup cannot be restored.

---

## What Must Never Be Committed

Do not commit any of the following:

```text
*.dump
*.backup
*.sql
backup/
backups/
.env
.env.*
postgres_data/
pgdata/
```

Use `.gitignore` rules appropriate for the repository, but do not rely only on `.gitignore for security. Review `git status` before every commit.

If a secret or database backup is accidentally committed:

1. Stop distributing the repository.
2. Rotate all exposed secrets.
3. Remove the file from the current working tree.
4. Remove it from Git history if necessary.
5. Verify that the replacement secrets are active.
6. Treat any exposed database data as compromised.

---

## Related Documentation

- [Deployment guide](DEPLOYMENT.md)
- [Super recovery procedure](RECOVERY.md)
- [Project README](README.md)
