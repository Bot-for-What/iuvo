# Super Account Recovery Runbook

## Status

This runbook documents the approved recovery design. The `npm run recover-super` command is not available until the Security Administration extension is implemented and verified.

## Purpose

Recover the sole Super account when its password is unavailable or its TOTP enrollment cannot be used.

## Security boundaries

- Recovery is available only from a host or backend container with database access and backend environment access.
- Recovery is not exposed through an HTTP endpoint or frontend page.
- The command requires the separate `SUPER_RECOVERY_KEY`.
- The command targets only the one existing Super account.
- The recovery key, password, temporary credentials, JWTs, TOTP secrets, and QR-code data must never be pasted into chat, committed, logged, or stored in project files.

## Planned recovery procedure

1. Obtain authorized host/container access.
2. Run `npm run recover-super`.
3. Enter the required recovery key.
4. Enter and confirm a replacement Super password.
5. The command validates the fixed Super password policy:
   - At least 12 characters.
   - Uppercase letter required.
   - Lowercase letter required.
   - Number required.
   - Special character required.
6. The command updates only the existing Super password hash.
7. The command clears the existing Super TOTP enrollment.
8. Sign in using the replacement password.
9. Immediately enable and enroll a fresh Super TOTP secret through the normal Super-only 2FA flow.
10. Verify a complete two-step Super login.
11. Record the recovery reason through the command prompt when requested.

## Post-recovery verification

- Confirm exactly one Super account still exists.
- Confirm Super TOTP is enabled and a current authenticator code succeeds.
- Confirm the recovery action exists in the security audit log.
- Confirm no password, recovery key, secret, QR data, or JWT appears in logs or source control.
