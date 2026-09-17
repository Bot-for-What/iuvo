import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  createUnit,
  getUnits,
  setUnitActiveState,
  setUnitDepartmentActiveState,
} from '../api/units';
import AppLayout from '../components/AppLayout';

function getErrorMessage(error) {
  return error instanceof ApiError
    ? error.message
    : 'The unit action could not be completed.';
}

function DepartmentDot({ isActive, label }) {
  return (
    <span
      aria-label={`${label}: ${isActive ? 'active' : 'disabled'}`}
      className={`management-department-dot ${
        isActive ? 'management-department-dot-active' : 'management-department-dot-disabled'
      }`}
      title={`${label}: ${isActive ? 'active' : 'disabled'}`}
    />
  );
}

export default function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [name, setName] = useState('');
  const [departments, setDepartments] = useState({
    IT: true,
    Maintenance: true,
    'Bio-Medical': true,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');

  async function loadUnits() {
    setError('');
    setIsLoading(true);

    try {
      setUnits(await getUnits());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  async function runAction(key, action) {
    setBusyKey(key);
    setError('');

    try {
      await action();
      await loadUnits();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusyKey('');
    }
  }

  async function handleCreate(event) {
    event.preventDefault();

    const normalizedName = name.trim();

    if (!normalizedName) {
      setError('Enter a unit name.');
      return;
    }

    await runAction('create-unit', async () => {
      await createUnit(normalizedName, departments);
      setName('');
      setDepartments({
        IT: true,
        Maintenance: true,
        'Bio-Medical': true,
      });
    });
  }

  function toggleDepartment(deptName) {
    setDepartments((prev) => ({
      ...prev,
      [deptName]: !prev[deptName],
    }));
  }

  const activeUnitCount = units.filter((unit) => unit.isActive).length;
  const activeDepartmentCount = units.reduce(
    (count, unit) => count + unit.departments.filter((department) => department.isActive).length,
    0,
  );

  return (
    <AppLayout>
      <section className="management-page-intro">
        <div>
          <p className="eyebrow">System configuration</p>
          <h1>Units and departments</h1>
          <p>
            Create units and control which units and fixed departments are
            available for normal access and new ticket requests.
          </p>
        </div>

        <div aria-label="Units overview" className="management-page-stats">
          <div className="management-stat">
            <strong>{units.length}</strong>
            <span>Total units</span>
          </div>
          <div className="management-stat">
            <strong>{activeUnitCount}</strong>
            <span>Active units</span>
          </div>
          <div className="management-stat">
            <strong>{activeDepartmentCount}</strong>
            <span>Active departments</span>
          </div>
        </div>
      </section>

      <section className="content-card management-create-card">
        <div className="management-section-title">
          <div>
            <p className="eyebrow">Add configuration</p>
            <h2>Create unit</h2>
            <p>
              Each new unit is created with IT, Maintenance, and Bio-Medical.
              You can choose which departments are active immediately.
            </p>
          </div>
        </div>

        <form className="management-create-form-compact" onSubmit={handleCreate}>
          <label className="management-unit-name-label">
            <span>Unit name</span>
            <input
              disabled={busyKey === 'create-unit'}
              maxLength="255"
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Central Hospital"
              required
              value={name}
            />
          </label>

          <div className="management-department-checkboxes">
            {['IT', 'Maintenance', 'Bio-Medical'].map((deptName) => (
              <label className="management-dept-checkbox" key={deptName}>
                <input
                  checked={departments[deptName]}
                  disabled={busyKey === 'create-unit'}
                  onChange={() => toggleDepartment(deptName)}
                  type="checkbox"
                />
                <span>{deptName}</span>
              </label>
            ))}
          </div>

          <button
            className="button button-primary"
            disabled={busyKey === 'create-unit'}
            type="submit"
          >
            {busyKey === 'create-unit' ? 'Creating…' : 'Create unit'}
          </button>
        </form>
      </section>

      <section className="content-card management-list-card">
        <div className="management-section-title management-list-heading">
          <div>
            <p className="eyebrow">Availability</p>
            <h2>All units</h2>
            <p>
              Disabling a unit or department blocks normal access and new
              tickets for its affected users.
            </p>
          </div>

          <button
            className="button button-secondary"
            disabled={isLoading || Boolean(busyKey)}
            onClick={loadUnits}
            type="button"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="management-empty-state">
            <p>Loading units…</p>
          </div>
        ) : null}

        {!isLoading && units.length === 0 ? (
          <div className="management-empty-state">
            <h3>No units yet</h3>
            <p>Create the first unit to configure its available departments.</p>
          </div>
        ) : null}

        {!isLoading && units.length > 0 ? (
          <div className="unit-list management-unit-grid">
            {units.map((unit) => {
              const activeDeptCount = unit.departments.filter((d) => d.isActive).length;
              const totalDeptCount = unit.departments.length;
              const activeUserCount = unit.activeUserCount ?? 0;

              return (
                <article className="unit-card management-unit-card" key={unit.id}>
                  <header className="management-unit-header">
                    <div className="management-unit-identity">
                      <div aria-hidden="true" className="management-unit-icon">
                        {unit.name.slice(0, 1).toUpperCase()}
                      </div>

                      <div className="management-unit-title-wrap">
                        <h3 className="management-unit-title">{unit.name}</h3>
                        <p>
                          {activeDeptCount} of {totalDeptCount} departments active
                        </p>
                        <p className="management-unit-active-users">
                          {activeUserCount} {activeUserCount === 1 ? 'active user' : 'active users'}
                        </p>
                      </div>
                    </div>

                    <div className="management-unit-header-actions">
                      <button
                        className={`button button-fixed-width ${
                          unit.isActive ? 'button-danger-outline' : 'button-secondary'
                        }`}
                        disabled={Boolean(busyKey)}
                        onClick={() => runAction(
                          `unit-${unit.id}`,
                          () => setUnitActiveState(unit.id, !unit.isActive),
                        )}
                        type="button"
                      >
                        {busyKey === `unit-${unit.id}`
                          ? 'Saving…'
                          : 'Disable'}
                      </button>
                    </div>
                  </header>

                  <div className="management-department-section">
                    <div className="management-department-heading">
                      <h4>Departments</h4>
                    </div>

                    <div className="department-list management-department-list">
                      {unit.departments.map((department) => (
                        <div className="department-row management-department-row" key={department.id}>
                          <div className="management-department-name">
                            <DepartmentDot
                              isActive={department.isActive}
                              label={department.name}
                            />
                            <strong>{department.name}</strong>
                          </div>

                          <div className="management-department-meta">
                            <button
                              aria-label={
                                department.isActive
                                  ? `Disable ${department.name} in ${unit.name}`
                                  : `Enable ${department.name} in ${unit.name}`
                              }
                              className="button button-compact button-secondary"
                              disabled={Boolean(busyKey)}
                              onClick={() => runAction(
                                `department-${unit.id}-${department.id}`,
                                () => setUnitDepartmentActiveState(
                                  unit.id,
                                  department.id,
                                  !department.isActive,
                                ),
                              )}
                              type="button"
                            >
                              {busyKey === `department-${unit.id}-${department.id}`
                                ? 'Saving…'
                                : department.isActive
                                  ? 'Disable'
                                  : 'Enable'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </AppLayout>
  );
}