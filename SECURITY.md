# Security Policy

IUVO handles authentication, user accounts, service requests, operational
messages, audit records, and security configuration. Security issues should be
reported privately so they can be investigated without exposing users or
deployment data.

---

## Supported Versions

Security fixes are applied to the current `main` branch and to actively
supported release versions.

| Version | Security support |
|---|---|
| `main` | Supported |
| Older commits | Not guaranteed |
| Unmodified forks | Not supported by the IUVO maintainer |

If you report an issue, include the commit or release version where it was
observed.

---

## Reporting a Vulnerability

Do not report security vulnerabilities through:

- Public GitHub issues.
- Public GitHub discussions.
- Pull requests.
- Social media.
- Public chat rooms.
- Public comments containing exploit details.

### Preferred method

If GitHub private vulnerability reporting is enabled for this repository, use
the repository's private **Report a vulnerability** feature.

GitHub private vulnerability reporting provides a structured private channel
between the reporter and repository maintainers. It is separate from this
`SECURITY.md` file. [373][374]

### If private reporting is unavailable

Open a minimal public issue containing only:

```text
Security contact requested for IUVO.
```

Do not include exploit details, credentials, tokens, database contents, or
sensitive logs in that issue. The maintainer will provide a private reporting
channel.

---

## What to Include

A useful private report should include:

- A short description of the vulnerability.
- The affected version, commit, route, component, or configuration.
- Clear reproduction steps.
- Required account role or permission.
- The expected behavior.
- The actual behavior.
- Security impact.
- Proof-of-concept code, if necessary.
- Relevant logs with secrets and personal data removed.
- A suggested mitigation, if known.

Do not include real production credentials or personal information in a report.

---

## Sensitive Information

Never publish or submit the following values in an issue, pull request, or
public discussion:

- Passwords.
- Password hashes.
- JWTs.
- Pending two-factor tokens.
- TOTP secrets.
- QR-code enrollment data.
- `JWT_SECRET`.
- `PENDING_2FA_JWT_SECRET`.
- `TOTP_ENCRYPTION_KEY`.
- `INTERNAL_CRON_KEY`.
- `SUPER_RECOVERY_KEY`.
- Database passwords.
- `.env` or `.env.docker` files.
- Database dumps.
- Production ticket data.
- Personal information.
- Client-specific branding or private assets.

Before sharing logs or screenshots, remove usernames, email addresses,
ticket descriptions, tokens, identifiers, and timestamps that could identify
people or operations.

---

## Expected Response

The maintainer will attempt to:

1. Confirm receipt of the report.
2. Reproduce the issue.
3. Determine its severity and affected versions.
4. Develop and test a fix.
5. Release or document the fix.
6. Coordinate public disclosure with the reporter when appropriate.

Response time may vary depending on availability and severity.

Please do not publicly disclose the issue until a fix or mitigation has been
prepared and disclosure has been coordinated.

---

## Coordinated Disclosure

IUVO uses coordinated disclosure for security vulnerabilities.

The reporter and maintainer should agree on:

- The affected versions.
- The mitigation or fixed version.
- The disclosure date.
- The public advisory wording.
- Reporter credit, if requested.

Do not publish a proof of concept that enables attacks against active
deployments before users have had a reasonable opportunity to apply the fix.

---

## Excluded Reports

The following are generally outside the security-reporting scope unless they
demonstrate a concrete security impact:

- General bugs without a security consequence.
- Feature requests.
- UI or visual issues.
- Requests for new roles or permissions.
- Missing documentation.
- Vulnerabilities in an unmodified third-party deployment.
- Issues requiring the reporter to already possess Super credentials.
- Denial-of-service testing against systems you do not own.
- Social engineering or phishing attempts against project users.
- Automated scans that do not include a reproducible security impact.
- Vulnerabilities in dependencies that do not affect IUVO.

You may still report ordinary bugs through GitHub Issues.

---

## Deployment Security Responsibilities

Anyone deploying IUVO is responsible for securing their own environment.

Operators should:

- Use long, random private secrets.
- Keep `.env.docker` outside Git.
- Never use repository examples as production credentials.
- Use a strong database password.
- Enable Super two-factor authentication.
- Restrict PostgreSQL from public access.
- Use HTTPS for public deployments.
- Configure backups and test restoration.
- Keep Docker images and the host operating system updated.
- Restrict access to Docker and database administration.
- Review application and security audit records.
- Rotate secrets after suspected exposure.

Deployment and recovery procedures are documented in:

- [Deployment guide](DEPLOYMENT.md)
- [Backup and restore guide](BACKUP-RESTORE.md)
- [Super recovery procedure](RECOVERY.md)

---

## Exposed Secrets

If a secret is accidentally committed or exposed:

1. Stop using the exposed secret.
2. Rotate the affected secret immediately.
3. Update the private deployment environment.
4. Restart the affected containers.
5. Review logs and audit records for suspicious activity.
6. Remove the exposed file from the working tree.
7. Assess whether Git history must be rewritten.
8. Report the exposure privately if it may affect other deployments.

Removing a secret from the latest commit does not necessarily remove it from
Git history. Treat a secret as compromised until it has been rotated.

---

## Security Testing

Only test systems that you own or are explicitly authorized to test.

Do not run load tests, automated scans, credential tests, or exploit proof of
concepts against public or production deployments without authorization.

Use disposable or isolated databases for:

- Sanity tests.
- Load tests.
- Migration testing.
- Restore testing.
- Permission testing.
- Security testing.

---

## Acknowledgements

Security researchers who report valid issues responsibly may be credited in the
release notes or security advisory, unless they prefer to remain anonymous.
