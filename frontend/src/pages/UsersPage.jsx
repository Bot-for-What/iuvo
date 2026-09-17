// frontend/src/pages/Users.jsx
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { getUnits } from '../api/units';
import { getStaffDepartments } from '../api/staffDepartments';
import {
  createUser,
  getUsers,
  resetPassword,
  setUserActiveState,
  updateTwoFactor,
  updateUser,
  updateUsername,
} from '../api/users';
import { useAuth } from '../auth/useAuth';
import AppLayout from '../components/AppLayout';
import UserForm from '../components/UserForm';


const emptyForm = (user) => ({
  fullName: '',
  username: '',
  password: '',
  role: user.role === 'team' ? 'staff' : 'staff',
  unitId: user.unitId || '',
  departmentId: user.departmentId || '',
  canEditUsername: true,
});


function errorMessage(error) {
  return error instanceof ApiError ? error.message : 'User action failed.';
}


function roleLabel(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}


function UserStatusBadge({ isActive }) {
  return (
    <span
      className={`management-status-badge ${
        isActive
          ? 'management-status-badge-active'
          : 'management-status-badge-disabled'
      }`}
    >
      <span aria-hidden="true" className="management-status-dot" />
      {isActive ? 'Active' : 'Disabled'}
    </span>
  );
}


const USERS_PER_PAGE = 10;


export default function UsersPage() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [staffDepartments, setStaffDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm(user));
  const [selected, setSelected] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [copyState, setCopyState] = useState('Copy secret');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const title = user.role === 'super'
    ? 'Users'
    : user.role === 'admin'
      ? 'Team and Staff'
      : 'Staff';

  const canResetPassword = ['super', 'admin'].includes(user.role);
  const canManageAccountState = user.role !== 'team';
  const canManageTwoFactor = user.role === 'super';

  async function load() {
    setError('');
    setIsLoading(true);

    try {
      const userData = await getUsers();
      const unitData = await getUnits();
      setUsers(userData);
      setUnits(unitData);
    } catch (requestError) {
      console.error('load() error:', requestError);
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (form.unitId) {
      const token = sessionStorage.getItem('serviceRequest.accessToken');
      getStaffDepartments(form.unitId, token)
        .then(setStaffDepartments)
        .catch(() => setStaffDepartments([]));
    } else {
      setStaffDepartments([]);
    }
  }, [form.unitId]);

  useEffect(() => {
    if (selected?.unitId && selected?.role === 'staff') {
      const token = sessionStorage.getItem('serviceRequest.accessToken');
      getStaffDepartments(selected.unitId, token)
        .then(setStaffDepartments)
        .catch(() => setStaffDepartments([]));
    }
  }, [selected?.unitId, selected?.role]);

  useEffect(() => {
    if (!temporaryPassword) {
      setCopyState('Copy password');
    }
  }, [temporaryPassword]);

  async function run(action) {
    setBusy(true);
    setError('');

    try {
      await action();
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(event) {
    event.preventDefault();

    await run(async () => {
      await createUser(form);
      setForm(emptyForm(user));
    });
  }

  async function saveSelected(event) {
    event.preventDefault();

    await run(async () => {
      const changes = {
        fullName: selected.fullName,
      };

      if (user.role === 'super') {
        changes.role = selected.role;
        changes.unitId = selected.role === 'management' ? null : selected.unitId;
        changes.departmentId = selected.role === 'management'
          ? null
          : selected.departmentId;
      }

      await updateUser(selected.id, changes);

      if (
        user.role === 'super'
        && selected.username !== selected.originalUsername
      ) {
        await updateUsername(selected.id, selected.username);
      }

      setSelected(null);
    });
  }

  async function handlePasswordCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyState('Copied');
    } catch {
      setCopyState('Copy failed');
    }
  }

  async function handleSecretCopy() {
    try {
      await navigator.clipboard.writeText(twoFactorSetup.manualSecret);
      setCopyState('Copied');
    } catch {
      setCopyState('Copy failed');
    }
  }

  function openEditUser(item) {
    setSelected({
      ...item,
      originalUsername: item.username,
      password: '',
      canEditUsername: user.role === 'super',
    });
  }

  function closeEditUser() {
    setSelected(null);
  }

  async function handleToggle2FA(item) {
    const newEnabledState = !item.twoFactorEnabled;
    
    await run(async () => {
      const response = await updateTwoFactor(item.id, newEnabledState);
      
      // Show QR modal only when enabling 2FA and response includes setup data
      if (newEnabledState && response.twoFactorSetup) {
        setTwoFactorSetup(response.twoFactorSetup);
      }
    });
  }

  function closeTwoFactorModal() {
    setTwoFactorSetup(null);
    setCopyState('Copy secret');
  }

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((item) => item.isActive).length,
    disabled: users.filter((item) => !item.isActive).length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return users.filter(u => 
      u.fullName.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query) ||
      (u.unitName && u.unitName.toLowerCase().includes(query)) ||
      (u.departmentName && u.departmentName.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <AppLayout>
      <section className="management-page-intro">
        <div>
          <p className="eyebrow">{user.role}</p>
          <h1>{title}</h1>
          <p>
            Create and manage only the accounts permitted by your current
            role, unit, and department scope.
          </p>
        </div>

        <div aria-label="User overview" className="management-page-stats">
          <div className="management-stat">
            <strong>{summary.total}</strong>
            <span>Visible users</span>
          </div>
          <div className="management-stat">
            <strong>{summary.active}</strong>
            <span>Active accounts</span>
          </div>
          <div className="management-stat">
            <strong>{summary.disabled}</strong>
            <span>Disabled accounts</span>
          </div>
        </div>
      </section>

      <section className="content-card management-user-create-card">
        <div className="management-section-title">
          <div>
            <p className="eyebrow">New account</p>
            <h2>Create user</h2>
            <p>
              The available roles and scope controls reflect your current
              permissions.
            </p>
          </div>
        </div>

        <UserForm
          actor={user}
          units={units}
          staffDepartments={staffDepartments}
          includePassword
          isSubmitting={busy}
          onChange={setForm}
          onSubmit={submitCreate}
          submitLabel="Create user"
          values={form}
        />
      </section>

      <section className="content-card management-user-list-card">
        <div className="management-section-title management-list-heading">
          <div>
            <p className="eyebrow">Account management</p>
            <h2>Users</h2>
            <p>Review account status, assignment scope, and available actions.</p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="search"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="management-search-input"
            />
            
            <button
              className="button button-secondary"
              disabled={isLoading || busy}
              onClick={load}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="management-empty-state">
            <p>Loading users…</p>
          </div>
        ) : null}

        {!isLoading && filteredUsers.length === 0 ? (
          <div className="management-empty-state">
            <h3>{searchQuery ? 'No users found' : 'No users found'}</h3>
            <p>{searchQuery ? 'Try a different search term.' : 'Create a user account to begin assigning access.'}</p>
          </div>
        ) : null}

        {!isLoading && filteredUsers.length > 0 ? (
          <>
            <div className="user-list management-user-list">
              {paginatedUsers.map((item) => (
                <article className="user-card management-user-card" key={item.id}>
                  <div className="management-user-main">
                    <div
                      aria-hidden="true"
                      className={`management-user-avatar management-role-${item.role}`}
                    >
                      {item.fullName.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="management-user-identity">
                      <div className="management-user-name-row">
                        <h3>{item.fullName}</h3>
                      </div>

                      <p className="management-user-username">@{item.username}</p>

                      <p className="management-user-scope">
                        {item.unitName || 'System-wide'}
                        {item.departmentName ? ` · ${item.departmentName}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="management-user-state">
                    <span className={`management-role-badge management-role-${item.role}`}>
                      {roleLabel(item.role)}
                    </span>
                    <UserStatusBadge isActive={item.isActive} />
                    {canManageTwoFactor ? (
                      <button
                        className={`management-security-badge ${
                          item.twoFactorEnabled
                            ? 'management-security-badge-enabled'
                            : 'management-security-badge-disabled'
                        }`}
                        disabled={busy}
                        onClick={() => handleToggle2FA(item)}
                        title={
                          item.twoFactorEnabled
                            ? 'Disable two-factor authentication'
                            : 'Enable two-factor authentication'
                        }
                        type="button"
                      >
                        2FA {item.twoFactorEnabled ? 'enabled' : 'off'}
                      </button>
                    ) : null}
                    {item.mustChangePassword ? (
                      <span className="management-password-change-badge">
                        Password update required
                      </span>
                    ) : null}
                  </div>

                  <div className="management-user-actions">
                    <div className="management-user-actions-row">
                      <button
                        className="button button-secondary button-compact"
                        disabled={busy}
                        onClick={() => openEditUser(item)}
                        type="button"
                      >
                        Edit
                      </button>

                      {canManageAccountState ? (
                        <button
                          className={`button button-compact ${
                            item.isActive ? 'button-danger-outline' : 'button-secondary'
                          }`}
                          disabled={busy}
                          onClick={() => run(
                            () => setUserActiveState(item.id, !item.isActive),
                          )}
                          type="button"
                        >
                          {item.isActive ? 'Disable' : 'Enable'}
                        </button>
                      ) : null}
                    </div>

                    {canResetPassword ? (
                      <div className="management-user-actions-row">
                        <button
                          className="button button-secondary button-compact"
                          disabled={busy}
                          onClick={() => run(async () => {
                            const result = await resetPassword(item.id);
                            setTemporaryPassword(result.temporaryPassword);
                          })}
                          type="button"
                        >
                          Reset password
                        </button>
                      </div>
                    ) : null}
                  </div>

{selected ? (
  <div
    aria-labelledby="edit-user-title"
    aria-modal="true"
    className="modal-backdrop"
    onClick={closeEditUser}
    role="dialog"
  >
    <section
      className="modal-card management-edit-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="management-edit-modal-header">
        <div>
          <p className="eyebrow">Account management</p>
          <h2 id="edit-user-title">Edit user: {selected.fullName}</h2>
          <p>Update permitted account details and assignment scope.</p>
        </div>

        <button
          className="button button-secondary"
          disabled={busy}
          onClick={closeEditUser}
          type="button"
        >
          Cancel
        </button>
      </div>

<UserForm
  actor={user}
  isSubmitting={busy}
  onChange={setSelected}
  onSubmit={saveSelected}
  staffDepartments={staffDepartments}
  submitLabel="Save changes"
  units={units}
  values={selected}
/>
    </section>
  </div>
) : null}
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="management-pagination">
                <button
                  className="button button-secondary"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  type="button"
                >
                  Previous
                </button>
                
                <span style={{ padding: '0 var(--space-3)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  className="button button-secondary"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>

      {temporaryPassword ? (
        <div
          aria-labelledby="temporary-password-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <section className="modal-card temporary-password management-password-modal">
            <p className="eyebrow">Password reset complete</p>
            <h2 id="temporary-password-title">Record temporary password</h2>
            <p>
              Copy this password now and provide it to the user through an
              approved secure channel. It will not be available after this
              dialog is closed.
            </p>

            <div className="management-temporary-password">
              <code>{temporaryPassword}</code>
            </div>

            <div className="management-password-modal-actions">
              <button
                className="button button-primary"
                onClick={handlePasswordCopy}
                type="button"
              >
                {copyState}
              </button>

              <button
                className="button button-secondary"
                onClick={() => setTemporaryPassword('')}
                type="button"
              >
                I have recorded it
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {twoFactorSetup ? (
        <div
          aria-labelledby="two-factor-setup-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <section className="modal-card management-password-modal">
            <p className="eyebrow">Two-factor authentication enabled</p>
            <h2 id="two-factor-setup-title">Scan QR code or enter secret manually</h2>
            <p>
              Use an authenticator app (Google Authenticator, Authy, Microsoft Authenticator)
              to scan this QR code. Save the secret key in a secure location — it will not be shown again.
            </p>

            <div style={{ textAlign: 'center', margin: 'var(--space-4) 0' }}>
              <img
                src={twoFactorSetup.qrCodeDataUrl}
                alt="2FA setup QR code"
                style={{ maxWidth: '200px', height: 'auto' }}
              />
            </div>

            <div className="management-temporary-password">
              <p style={{ marginBottom: 'var(--space-2)', fontWeight: 600 }}>Manual entry key:</p>
              <code>{twoFactorSetup.manualSecret}</code>
            </div>

            <div className="management-password-modal-actions">
              <button
                className="button button-primary"
                onClick={handleSecretCopy}
                type="button"
              >
                {copyState}
              </button>

              <button
                className="button button-secondary"
                onClick={closeTwoFactorModal}
                type="button"
              >
                I have saved it
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}