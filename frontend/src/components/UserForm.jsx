import { useMemo } from 'react';

const allRoles = ['management', 'admin', 'team', 'staff'];

function allowedRolesFor(actorRole) {
  if (actorRole === 'super') {
    return allRoles;
  }

  if (actorRole === 'admin') {
    return ['team', 'staff'];
  }

  if (actorRole === 'team') {
    return ['staff'];
  }

  return [];
}

function roleLabel(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UserForm({
  actor,
  units,
  staffDepartments = [],
  values,
  onChange,
  onSubmit,
  isSubmitting,
  submitLabel,
  includePassword = false,
}) {
  const roles = allowedRolesFor(actor.role);

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === values.unitId),
    [units, values.unitId],
  );

  const activeUnits = units.filter((unit) => unit.isActive);
  
  // Use staffDepartments for staff role, unit_departments for other roles
  const departmentsForUnit = values.role === 'staff'
    ? (staffDepartments || []).filter(d => d.is_active)
    : (selectedUnit?.departments || []).filter(d => d.isActive);

  const requiresScope = values.role !== 'management';
  const canChooseUnit = actor.role === 'super';
  const canChooseRole = actor.role === 'super' || actor.role === 'admin';

  function update(field, value) {
    onChange({
      ...values,
      [field]: value,
    });
  }

  function handleRoleChange(nextRole) {
    if (nextRole === 'management') {
      onChange({
        ...values,
        role: nextRole,
        unitId: '',
        departmentId: '',
      });
      return;
    }

    onChange({
      ...values,
      role: nextRole,
    });
  }

  function handleUnitChange(nextUnitId) {
    onChange({
      ...values,
      unitId: nextUnitId,
      departmentId: '',
    });
  }

  return (
    <form className="user-form" onSubmit={onSubmit}>
      <div className="user-form-section">
        <div className="user-form-section-heading">
          <h3>Account details</h3>
          <p>Use a unique username that the user will sign in with.</p>
        </div>

        <div className="user-form-grid">
          <label className="user-form-field">
            <span>Full name</span>
            <input
              autoComplete="name"
              disabled={isSubmitting}
              onChange={(event) => update('fullName', event.target.value)}
              placeholder="Full name"
              required
              value={values.fullName}
            />
          </label>

          <label className="user-form-field">
            <span>Username</span>
            <input
              autoComplete="username"
              disabled={isSubmitting || !values.canEditUsername}
              onChange={(event) => update('username', event.target.value)}
              placeholder="Username"
              required
              value={values.username}
            />
            {!values.canEditUsername ? (
              <small></small>
            ) : null}
          </label>

          {includePassword ? (
            <label className="user-form-field user-form-field-password">
              <span>Initial password</span>
              <input
                autoComplete="new-password"
                disabled={isSubmitting}
                onChange={(event) => update('password', event.target.value)}
                placeholder="Set an initial password"
                required
                type="password"
                value={values.password}
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="user-form-section">
        <div className="user-form-section-heading">
          <h3>Role and scope</h3>
          <p>
            Access is limited by the selected role and, where applicable, the
            assigned unit and department.
          </p>
        </div>

        <div className="user-form-grid">
          <label className="user-form-field">
            <span>Role</span>
            <select
              disabled={isSubmitting || !canChooseRole}
              onChange={(event) => handleRoleChange(event.target.value)}
              value={values.role}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>

          {requiresScope ? (
            <>
              <label className="user-form-field">
                <span>Unit</span>
                <select
                  disabled={isSubmitting || !canChooseUnit}
                  onChange={(event) => handleUnitChange(event.target.value)}
                  required
                  value={values.unitId}
                >
                  <option value="">Choose a unit</option>
                  {(canChooseUnit
                    ? activeUnits
                    : activeUnits.filter((unit) => unit.id === actor.unitId)
                  ).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="user-form-field">
                <span>Department</span>
                <select
                  disabled={isSubmitting}
                  onChange={(event) => update('departmentId', event.target.value)}
                  required
                  value={values.departmentId}
                >
                  <option value="">Choose a department</option>
                  {departmentsForUnit.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <div className="user-form-scope-note">
              <strong>Cross-unit access</strong>
              <span>
                Management users are not assigned to an individual unit or department.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="user-form-actions">
        <button
          className="button button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}