export function IuvoWordmark({ className = '' }) {
  return <span className={`iuvo-wordmark ${className}`.trim()}>iuvo</span>;
}

export function IuvoMonogram({ className = '', label = 'IUVO' }) {
  return (
    <span
      aria-label={label}
      className={`iuvo-monogram ${className}`.trim()}
      role="img"
    >
      i
    </span>
  );
}

export function ClientOrganizationCredit() {
  const organizationName = import.meta.env.VITE_ORGANIZATION_NAME?.trim();
  const organizationLogoUrl = import.meta.env.VITE_ORGANIZATION_LOGO_URL?.trim();

  if (!organizationName && !organizationLogoUrl) {
    return null;
  }

  return (
    <footer className="client-organization-credit">
      {organizationName ? (
        <p>Deployed for {organizationName}</p>
      ) : null}

      {organizationLogoUrl ? (
        <img
          alt={organizationName ? `${organizationName} logo` : 'Client organization logo'}
          className="client-organization-logo"
          src={organizationLogoUrl}
        />
      ) : null}
    </footer>
  );
}

export function BuilderCredit() {
  const builderName = import.meta.env.VITE_BUILDER_NAME?.trim();
  const builderLogoUrl = import.meta.env.VITE_BUILDER_LOGO_URL?.trim();

  if (!builderName && !builderLogoUrl) {
    return null;
  }

  return (
    <footer className="builder-credit">
      {builderName ? (
        <p>Built by {builderName}</p>
      ) : null}

      {builderLogoUrl ? (
        <img
          alt={builderName ? `${builderName} logo` : 'Builder logo'}
          className="builder-logo"
          src={builderLogoUrl}
        />
      ) : null}
    </footer>
  );
}

export function IuvoRights({ className = '' }) {
  return (
    <footer className={`iuvo-rights ${className}`.trim()}>
      IUVO Service Management Platform · All Rights Reserved · For Authorized Use Only
    </footer>
  );
}