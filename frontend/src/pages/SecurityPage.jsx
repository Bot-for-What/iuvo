import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  clearUserPasswordPolicy,
  getDelegates,
  getPasswordPolicy,
  getSecurityAuditEvents,
  getSecurityUsers,
  grantDelegate,
  resetSecurityUserPassword,
  revokeDelegate,
  setUserPasswordPolicy,
  updatePasswordPolicy,
} from '../api/security';
import { useAuth } from '../auth/useAuth';
import AppLayout from '../components/AppLayout';

const emptyPolicy = {
  minLength: 3,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecialCharacter: false,
};

const eventTypes = [
  'password_policy_updated',
  'user_password_policy_updated',
  'user_password_policy_cleared',
  'temporary_password_issued',
  'security_admin_granted',
  'security_admin_revoked',
  'security_access_denied',
  'super_recovery',
];

function errorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (import.meta.env.DEV && error instanceof Error) {
    return error.message;
  }

  return 'Security Administration request failed. Please try again.';
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function policyDescription(policy) {
  if (!policy) {
    return 'No policy available.';
  }

  const requirements = [`Minimum ${policy.minLength} characters`];

  if (policy.requireUppercase) requirements.push('uppercase');
  if (policy.requireLowercase) requirements.push('lowercase');
  if (policy.requireNumber) requirements.push('number');
  if (policy.requireSpecialCharacter) requirements.push('special character');

  return requirements.join(' · ');
}

function copyPolicy(policy) {
  return {
    minLength: Number(policy?.minLength || 3),
    requireUppercase: Boolean(policy?.requireUppercase),
    requireLowercase: Boolean(policy?.requireLowercase),
    requireNumber: Boolean(policy?.requireNumber),
    requireSpecialCharacter: Boolean(policy?.requireSpecialCharacter),
  };
}

function PolicyFields({ policy, onChange, disabled = false }) {
  function setField(field, value) {
    onChange({
      ...policy,
      [field]: value,
    });
  }

  return (
    <div className="security-policy-fields">
      <label>
        Minimum password length
        <input
          disabled={disabled}
          min="3"
          onChange={(event) => setField('minLength', Number(event.target.value))}
          type="number"
          value={policy.minLength}
        />
      </label>

      <label className="checkbox-label">
        <input
          checked={policy.requireUppercase}
          disabled={disabled}
          onChange={(event) => setField('requireUppercase', event.target.checked)}
          type="checkbox"
        />
        Require an uppercase letter
      </label>

      <label className="checkbox-label">
        <input
          checked={policy.requireLowercase}
          disabled={disabled}
          onChange={(event) => setField('requireLowercase', event.target.checked)}
          type="checkbox"
        />
        Require a lowercase letter
      </label>

      <label className="checkbox-label">
        <input
          checked={policy.requireNumber}
          disabled={disabled}
          onChange={(event) => setField('requireNumber', event.target.checked)}
          type="checkbox"
        />
        Require a number
      </label>

      <label className="checkbox-label">
        <input
          checked={policy.requireSpecialCharacter}
          disabled={disabled}
          onChange={(event) => setField('requireSpecialCharacter', event.target.checked)}
          type="checkbox"
        />
        Require a special character
      </label>
    </div>
  );
}

export default function SecurityPage() {
  const { user } = useAuth();
  const isSuper = user.role === 'super';

  const [globalPolicy, setGlobalPolicy] = useState(emptyPolicy);
  const [policyDraft, setPolicyDraft] = useState(emptyPolicy);
  const [globalPolicyReason, setGlobalPolicyReason] = useState('');
  const [securityUsers, setSecurityUsers] = useState([]);
  const [delegates, setDelegates] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userPolicyDraft, setUserPolicyDraft] = useState(emptyPolicy);
  const [userPolicyReason, setUserPolicyReason] = useState('');
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateReason, setDelegateReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditLimit, setAuditLimit] = useState(50);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  const selectedUser = useMemo(
    () => securityUsers.find((securityUser) => securityUser.id === selectedUserId) || null,
    [securityUsers, selectedUserId],
  );

  const availableAdmins = useMemo(
    () => securityUsers.filter((securityUser) => (
      securityUser.role === 'admin'
      && securityUser.isActive
      && !delegates.some((delegate) => delegate.id === securityUser.id)
    )),
    [delegates, securityUsers],
  );

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return securityUsers.filter((user) => {
      const matchesSearch = searchQuery === '' ||
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === '' || user.role === roleFilter;

      const matchesStatus = statusFilter === '' ||
        (statusFilter === 'active' && user.isActive) ||
        (statusFilter === 'must-change' && user.mustChangePassword);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [securityUsers, searchQuery, roleFilter, statusFilter]);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage]);

  // Calculate total pages
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  // Filtered audit events
  const filteredAuditEvents = useMemo(() => {
    return auditEvents.filter((event) => {
      const eventDate = new Date(event.createdAt);
      const fromMatch = !auditFrom || eventDate >= new Date(auditFrom);
      const toMatch = !auditTo || eventDate <= new Date(auditTo + 'T23:59:59');
      const typeMatch = !eventTypeFilter || event.eventType === eventTypeFilter;

      return fromMatch && toMatch && typeMatch;
    });
  }, [auditEvents, auditFrom, auditTo, eventTypeFilter]);

// Displayed audit events (limited for performance)
const displayedAuditEvents = useMemo(() => {
  return filteredAuditEvents.slice(0, auditLimit);
}, [filteredAuditEvents, auditLimit]);

// Debug
console.log('Audit debug:', {
  total: auditEvents.length,
  filtered: filteredAuditEvents.length,
  displayed: displayedAuditEvents.length,
  limit: auditLimit,
  expanded: auditExpanded,
});

// Reset limit when filters change
useEffect(() => {
  setAuditLimit(50);
}, [auditFrom, auditTo, eventTypeFilter]);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const requests = [getSecurityUsers()];

      if (isSuper) {
        requests.push(
          getPasswordPolicy(),
          getDelegates(),
          getSecurityAuditEvents(),
        );
      }

      const results = await Promise.all(requests);
      setSecurityUsers(results[0]);

      if (isSuper) {
        const policyResponse = results[1];
        setGlobalPolicy(copyPolicy(policyResponse.passwordPolicy));
        setPolicyDraft(copyPolicy(policyResponse.passwordPolicy));
        setDelegates(results[2]);
        setAuditEvents(results[3]);
      }
    } catch (err) {
      console.error('Failed to load Security Administration data.', err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function selectSecurityUser(nextUserId) {
    setSelectedUserId(nextUserId);
    setTemporaryPassword('');
    setUserPolicyReason('');

    const nextUser = securityUsers.find((securityUser) => securityUser.id === nextUserId);
    setUserPolicyDraft(copyPolicy(nextUser?.passwordPolicy));
  }

  async function saveGlobalPolicy() {
    if (!globalPolicyReason.trim()) {
      setError('A non-secret reason is required to update the global password policy.');
      return;
    }

    setSubmitting('global-policy');
    setError('');
    setNotice('');

    try {
      const response = await updatePasswordPolicy(policyDraft, globalPolicyReason.trim());
      const nextPolicy = copyPolicy(response.passwordPolicy);

      setGlobalPolicy(nextPolicy);
      setPolicyDraft(nextPolicy);
      setGlobalPolicyReason('');
      setNotice(response.message || 'Global password policy updated.');
      await load();
    } catch (err) {
      console.error('Failed to update global password policy.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  async function saveUserPolicy() {
    if (!selectedUser) {
      setError('Select a user first.');
      return;
    }

    if (!userPolicyReason.trim()) {
      setError('A non-secret reason is required to set a user password-policy override.');
      return;
    }

    setSubmitting('user-policy');
    setError('');
    setNotice('');

    try {
      const response = await setUserPasswordPolicy(
        selectedUser.id,
        userPolicyDraft,
        userPolicyReason.trim(),
      );

      setUserPolicyReason('');
      setNotice(response.message || 'User password policy updated.');
      await load();
    } catch (err) {
      console.error('Failed to update a user password policy.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  async function restoreGlobalPolicy() {
    if (!selectedUser) {
      setError('Select a user first.');
      return;
    }

    if (!userPolicyReason.trim()) {
      setError('A non-secret reason is required to restore the global password policy.');
      return;
    }

    setSubmitting('restore-policy');
    setError('');
    setNotice('');

    try {
      const response = await clearUserPasswordPolicy(
        selectedUser.id,
        userPolicyReason.trim(),
      );

      setUserPolicyReason('');
      setNotice(response.message || 'User now inherits the global password policy.');
      await load();
    } catch (err) {
      console.error('Failed to restore the global password policy for a user.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  async function generateTemporaryPassword() {
    if (!selectedUser) {
      setError('Select a user first.');
      return;
    }

    const confirmed = window.confirm(
      `Generate a one-time temporary password for ${selectedUser.fullName}? `
      + 'Their current password will be replaced and they must change the temporary password at next sign-in.',
    );

    if (!confirmed) {
      return;
    }

    setSubmitting('reset-password');
    setError('');
    setNotice('');
    setTemporaryPassword('');

    try {
      const response = await resetSecurityUserPassword(selectedUser.id);
      setTemporaryPassword(response.temporaryPassword || '');
      setNotice(response.message || 'Temporary password generated. Copy it now; it will not be shown again.');
      await load();
    } catch (err) {
      console.error('Failed to generate a temporary password.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  async function addDelegate() {
    if (!delegateUserId) {
      setError('Select an active Admin user to grant Security Administration access.');
      return;
    }

    if (!delegateReason.trim()) {
      setError('A non-secret reason is required to grant Security Administration access.');
      return;
    }

    setSubmitting('grant-delegate');
    setError('');
    setNotice('');

    try {
      const response = await grantDelegate(delegateUserId, delegateReason.trim());
      setDelegateUserId('');
      setDelegateReason('');
      setNotice(response.message || 'Security Administration access granted.');
      await load();
    } catch (err) {
      console.error('Failed to grant Security Administration access.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  async function removeDelegate(delegate) {
    const reason = window.prompt(
      `Enter a non-secret reason to revoke Security Administration access from ${delegate.fullName}:`,
    );

    if (reason === null) {
      return;
    }

    if (!reason.trim()) {
      setError('A non-secret reason is required to revoke Security Administration access.');
      return;
    }

    setSubmitting(`revoke-${delegate.id}`);
    setError('');
    setNotice('');

    try {
      const response = await revokeDelegate(delegate.id, reason.trim());
      setNotice(response?.message || 'Security Administration access revoked.');
      await load();
    } catch (err) {
      console.error('Failed to revoke Security Administration access.', err);
      setError(errorMessage(err));
    } finally {
      setSubmitting('');
    }
  }

  const summary = useMemo(() => ({
    total: securityUsers.length,
    mustChangePassword: securityUsers.filter((u) => u.mustChangePassword).length,
    delegates: delegates.length,
  }), [securityUsers, delegates]);

  async function exportAuditEvents() {
  if (filteredAuditEvents.length === 0) {
    setError('No audit events to export.');
    return;
  }

  function loadMoreAudit() {
  setAuditLimit(prev => prev + 50);
}

  try {
    // Create CSV content
    const headers = ['Date', 'Event Type', 'Actor', 'Target', 'Reason', 'Outcome'];
    const rows = filteredAuditEvents.map((event) => [
      new Date(event.createdAt).toLocaleString(),
      event.eventType.replaceAll('_', ' '),
      event.actor?.fullName || 'System',
      event.targetUser?.fullName || '',
      event.reason || '',
      event.outcome,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    // Download as CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-audit-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setNotice(`Exported ${filteredAuditEvents.length} audit events.`);
  } catch (err) {
    console.error('Failed to export audit events.', err);
    setError('Failed to export audit events.');
  }
}

  return (
    <AppLayout>
      {/* Page Intro with Stats */}
      <section className="management-page-intro">
        <div>
          <p className="eyebrow">{isSuper ? 'Super' : 'Delegated security admin'}</p>
          <h1>Security Administration</h1>
          <p>
            Manage password policy and authorized account security controls.
            Reasons are recorded in the security audit log; never enter passwords or secrets as a reason.
          </p>
        </div>

        <div aria-label="Security overview" className="management-page-stats">
          <div className="management-stat">
            <strong>{summary.total}</strong>
            <span>Security users</span>
          </div>
          <div className="management-stat">
            <strong>{summary.mustChangePassword}</strong>
            <span>Password update required</span>
          </div>
          <div className="management-stat">
            <strong>{summary.delegates}</strong>
            <span>Delegated admins</span>
          </div>
        </div>
      </section>

      {/* Error and Notice - consolidated at top */}
      {error ? (
        <div className="form-error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{error}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="form-notice" role="status">
          <p>{notice}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="management-empty-state">
          <p>Loading Security Administration…</p>
        </div>
      ) : null}

      {!loading && (
        <div className="security-workspace">
          {/* Left Column - 60% - Users List + Audit Trail */}
          <div className="security-workspace-left">
            <section className="content-card security-compact-card">
              <div className="management-section-title management-list-heading">
                <div>
                  <p className="eyebrow">Account management</p>
                  <h2>Security users</h2>
                  <p>
                    Select a user to manage password policy or generate a one-time temporary password.
                  </p>
                </div>

                <button
                  className="button button-secondary"
                  disabled={loading}
                  onClick={load}
                  type="button"
                >
                  Refresh
                </button>
              </div>

              {/* Search and Filter Toolbar */}
              <div className="security-list-toolbar">
                <input
                  type="search"
                  placeholder="Search users by name or username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="security-search-input"
                />

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="security-filter-select"
                >
                  <option value="">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="team">Team</option>
                  <option value="staff">Staff</option>
                  <option value="management">Management</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="security-filter-select"
                >
                  <option value="">All status</option>
                  <option value="active">Active</option>
                  <option value="must-change">Must change password</option>
                </select>
              </div>

              <div className="security-user-list">
                {paginatedUsers.map((securityUser) => (
                  <button
                    className={`security-user-row ${selectedUserId === securityUser.id ? 'is-selected' : ''}`}
                    key={securityUser.id}
                    onClick={() => selectSecurityUser(securityUser.id)}
                    type="button"
                  >
                    <span>
                      <strong>{securityUser.fullName}</strong>
                      <small>{securityUser.username} · {securityUser.role}</small>
                    </span>
                    <span>
                      <small>{securityUser.policySource} policy</small>
                      {securityUser.mustChangePassword ? (
                        <small className="status-warning">Password change required</small>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>

              {paginatedUsers.length === 0 ? (
                <div className="management-empty-state">
                  <h3>No users found</h3>
                  <p>No users match your search and filter criteria.</p>
                </div>
              ) : null}



              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="security-pagination">
                  <button
                    className="button button-secondary button-compact"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    type="button"
                  >
                    Previous
                  </button>

                  <span className="security-pagination-info">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    className="button button-secondary button-compact"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              )}
            </section>

            {isSuper && (
              <section className="content-card security-compact-card">
                <button
                  className="security-section-toggle"
                  onClick={() => setAuditExpanded(!auditExpanded)}
                  type="button"
                >
                  <div className="management-section-title">
                    <div>
                      <p className="eyebrow">Audit trail</p>
                      <h2>Security audit events</h2>
                    </div>
                  </div>
                  <span className="security-toggle-icon">
                    {auditExpanded ? '−' : '+'}
                  </span>
                </button>

                {auditExpanded && (
                  <>
                    {/* Audit Filters */}
<div className="security-list-toolbar">
  <input
    type="date"
    value={auditFrom}
    onChange={(e) => setAuditFrom(e.target.value)}
    className="security-filter-select"
    title="From date"
    placeholder="From"
  />
  
  <span className="security-date-range-separator">to</span>
  
  <input
    type="date"
    value={auditTo}
    onChange={(e) => setAuditTo(e.target.value)}
    className="security-filter-select"
    title="To date"
    placeholder="To"
  />

  <select
    value={eventTypeFilter}
    onChange={(e) => setEventTypeFilter(e.target.value)}
    className="security-filter-select"
  >
    <option value="">All event types</option>
    {eventTypes.map((type) => (
      <option key={type} value={type}>
        {type.replaceAll('_', ' ')}
      </option>
    ))}
  </select>

  <button
    className="button button-secondary button-compact"
    onClick={() => {
      setAuditFrom('');
      setAuditTo('');
      setEventTypeFilter('');
    }}
    type="button"
  >
    Clear
  </button>
  
  <button
    className="button button-secondary button-compact"
    onClick={exportAuditEvents}
    disabled={filteredAuditEvents.length === 0}
    type="button"
  >
    Export
  </button>
</div>

<div className="security-audit-list">
  {displayedAuditEvents.map((event, index) => {
    console.log(`Event ${index}:`, event);
    return (
      <article className="security-audit-row" key={event.id}>
        <div>
          <strong>{event.eventType.replaceAll('_', ' ')}</strong>
          <p>
            Actor: {event.actor?.fullName || 'System'}
            {event.targetUser ? ` · Target: ${event.targetUser.fullName}` : ''}
          </p>
          {event.reason ? <p>Reason: {event.reason}</p> : null}
        </div>
        <small>{event.outcome} · {formatDate(event.createdAt)}</small>
      </article>
    );
  })}
</div>

{/* Load More Button */}
{displayedAuditEvents.length < filteredAuditEvents.length && (
  <button
    className="button button-secondary button-block"
    onClick={loadMoreAudit}
    type="button"
    style={{ marginTop: 'var(--space-4)' }}
  >
    Load more ({filteredAuditEvents.length - displayedAuditEvents.length} remaining)
  </button>
)}

{/* Empty State */}
{displayedAuditEvents.length === 0 && (
  <div className="management-empty-state">
    <h3>No audit events</h3>
    <p>No security audit events match your filter criteria.</p>
  </div>
)}

                  </>
                )}
              </section>
            )}
          </div>

{/* Right Column - 40% - Selected User + Global Policy + Delegated Access */}
<div className="security-workspace-right">
  {/* Selected User Panel (replaces the old user detail from left column) */}
  {selectedUser ? (
    <section className="content-card security-compact-card security-user-detail-card">
      <div className="management-section-title management-list-heading">
        <div>
          <p className="eyebrow">Selected user</p>
          <h2>{selectedUser.fullName}</h2>
          <p>
            {selectedUser.username} · {selectedUser.unitName || 'No unit'} · {selectedUser.departmentName || 'No department'}
          </p>
          <p>Current policy source: <strong>{selectedUser.policySource}</strong></p>
          <p className="muted">{policyDescription(selectedUser.passwordPolicy)}</p>
        </div>

        <button
          className="button button-secondary button-compact"
          onClick={() => selectSecurityUser('')}
          type="button"
        >
          Cancel
        </button>
      </div>

      <PolicyFields policy={userPolicyDraft} onChange={setUserPolicyDraft} />

      <label className="security-reason">
        Reason for this change
        <input
          maxLength="500"
          onChange={(event) => setUserPolicyReason(event.target.value)}
          placeholder="Non-secret audit reason"
          value={userPolicyReason}
        />
      </label>

      <div className="ticket-actions">
        <button
          className="button button-primary"
          disabled={submitting === 'user-policy'}
          onClick={saveUserPolicy}
          type="button"
        >
          {submitting === 'user-policy' ? 'Saving override…' : 'Save policy override'}
        </button>

        {selectedUser.policySource === 'custom' ? (
          <button
            className="button button-secondary"
            disabled={submitting === 'restore-policy'}
            onClick={restoreGlobalPolicy}
            type="button"
          >
            {submitting === 'restore-policy' ? 'Restoring…' : 'Restore global policy'}
          </button>
        ) : null}

        <button
          className="button button-secondary"
          disabled={submitting === 'reset-password'}
          onClick={generateTemporaryPassword}
          type="button"
        >
          {submitting === 'reset-password' ? 'Generating…' : 'Generate temporary password'}
        </button>
      </div>

      {temporaryPassword ? (
        <div className="temporary-password-card">
          <strong>Copy this temporary password now</strong>
          <code>{temporaryPassword}</code>
          <p>
            It is shown only for this action. Give it securely to the user, then close or refresh this page.
          </p>
          <button
            className="button button-secondary"
            onClick={() => setTemporaryPassword('')}
            type="button"
          >
            I have copied it
          </button>
        </div>
      ) : null}
    </section>
  ) : (
    <section className="content-card security-compact-card security-user-detail-card">
      <div className="management-section-title">
        <p className="eyebrow">Account management</p>
        <h2>Select a user</h2>
        <p>
          Click on a user from the list to manage their password policy or generate a temporary password.
        </p>
      </div>

      <div className="security-user-selection-prompt">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <p>No user selected</p>
      </div>
    </section>
  )}

  {/* Global Policy + Delegates follow below... */}

          <div className="security-workspace-right">
            {isSuper && (
              <section className="content-card security-compact-card">
                <div className="management-section-title management-list-heading">
                  <div>
                    <p className="eyebrow">System-wide policy</p>
                    <h2>Global password policy</h2>
                    <p>Current policy: {policyDescription(globalPolicy)}</p>
                  </div>

                  <button
                    className="button button-secondary"
                    disabled={loading || submitting === 'global-policy'}
                    onClick={load}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>

                <PolicyFields policy={policyDraft} onChange={setPolicyDraft} />

                <label className="security-reason">
                  Reason for this change
                  <input
                    maxLength="500"
                    onChange={(event) => setGlobalPolicyReason(event.target.value)}
                    placeholder="Non-secret audit reason"
                    value={globalPolicyReason}
                  />
                </label>

                <button
                  className="button button-primary"
                  disabled={submitting === 'global-policy'}
                  onClick={saveGlobalPolicy}
                  type="button"
                >
                  {submitting === 'global-policy' ? 'Saving policy…' : 'Save global policy'}
                </button>
              </section>
            )}

            {isSuper && (
              <section className="content-card security-compact-card">
                <div className="management-section-title management-list-heading">
                  <div>
                    <p className="eyebrow">Delegated access</p>
                    <h2>Security Administration delegates</h2>
                    <p>
                      Grant this permission only to active Admin users. Delegation is limited by the backend to Team and Staff in the Admin's own Unit.
                    </p>
                  </div>
                </div>

                <div className="security-delegate-form">
                  <label>
                    Active Admin user
                    <select onChange={(event) => setDelegateUserId(event.target.value)} value={delegateUserId}>
                      <option value="">Select an Admin</option>
                      {availableAdmins.map((admin) => (
                        <option key={admin.id} value={admin.id}>
                          {admin.fullName} ({admin.username}) · {admin.unitName || 'No unit'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Reason for delegation
                    <input
                      maxLength="500"
                      onChange={(event) => setDelegateReason(event.target.value)}
                      placeholder="Non-secret audit reason"
                      value={delegateReason}
                    />
                  </label>

                  <button
                    className="button button-primary"
                    disabled={submitting === 'grant-delegate'}
                    onClick={addDelegate}
                    type="button"
                  >
                    {submitting === 'grant-delegate' ? 'Granting…' : 'Grant access'}
                  </button>
                </div>

                <div className="security-delegate-list">
                  {delegates.map((delegate) => (
                    <article className="security-delegate-row" key={delegate.id}>
                      <div>
                        <strong>{delegate.fullName}</strong>
                        <p>{delegate.username} · {delegate.unitName || 'No unit'}</p>
                        <p className="muted">Granted by {delegate.grantedBy?.fullName || 'Unknown'} on {formatDate(delegate.grantedAt)}</p>
                      </div>
                      <button
                        className="button button-danger-outline"
                        disabled={submitting === `revoke-${delegate.id}`}
                        onClick={() => removeDelegate(delegate)}
                        type="button"
                      >
                        {submitting === `revoke-${delegate.id}` ? 'Revoking…' : 'Revoke'}
                      </button>
                    </article>
                  ))}
                </div>

                {delegates.length === 0 ? (
                  <div className="management-empty-state">
                    <h3>No delegated admins</h3>
                    <p>No Admin users currently hold delegated Security Administration access.</p>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        </div>
      </div>)}
    </AppLayout>
  );
}