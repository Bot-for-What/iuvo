import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import AppLayout from '../components/AppLayout';
import { getUnits } from '../api/units';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30040';

async function getStaffDepartments(unitId, token) {
  const response = await fetch(`${apiBaseUrl}/staff-departments?unitId=${unitId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to load departments.');
  }

  const data = await response.json();
  return data.staffDepartments || [];
}

async function createStaffDepartment(unitId, name, token) {
  const response = await fetch(`${apiBaseUrl}/staff-departments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ unitId, name })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to create department.');
  }

  const data = await response.json();
  return data.staffDepartment;
}

async function updateStaffDepartment(id, isActive, token) {
  const response = await fetch(`${apiBaseUrl}/staff-departments/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isActive })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to update department.');
  }

  const data = await response.json();
  return data.staffDepartment;
}

export default function StaffDepartmentsPage() {
  const { user, isAuthenticated } = useAuth();
  const isSuper = user?.role === 'super';

  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');

  useEffect(() => {
    loadUnits();
  }, []);

  useEffect(() => {
    if (selectedUnitId) {
      loadDepartments(selectedUnitId);
    }
  }, [selectedUnitId]);

  async function loadUnits() {
    try {
      const unitData = await getUnits();
      setUnits(unitData);
      
      const activeUnits = unitData.filter(u => u.isActive);
      if (activeUnits.length > 0 && !selectedUnitId) {
        setSelectedUnitId(activeUnits[0].id);
      }
    } catch (loadError) {
      setError(loadError.message || 'Unable to load units.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDepartments(unitId) {
    setLoading(true);
    setError('');
    setDepartments([]);

    try {
      const token = sessionStorage.getItem('serviceRequest.accessToken');
      const departmentData = await getStaffDepartments(unitId, token);
      setDepartments(departmentData);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load staff departments.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setActionError('');

    try {
      const token = sessionStorage.getItem('serviceRequest.accessToken');
      await createStaffDepartment(selectedUnitId, newDepartmentName.trim(), token);
      setNewDepartmentName('');
      await loadDepartments(selectedUnitId);
    } catch (createError) {
      setActionError(createError.message || 'Unable to create staff department.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id, currentActive) {
    setBusy(true);
    setActionError('');

    try {
      const token = sessionStorage.getItem('serviceRequest.accessToken');
      await updateStaffDepartment(id, !currentActive, token);
      await loadDepartments(selectedUnitId);
    } catch (updateError) {
      setActionError(updateError.message || 'Unable to update staff department.');
    } finally {
      setBusy(false);
    }
  }

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  return (
    <AppLayout>
      <section className="content-card ticket-section">
        <p className="eyebrow">{user?.role || 'Loading...'}</p>
        <h1>Unit Departments</h1>
        <p>
          Manage staff home departments for each unit. Staff members can belong to any department, but can only raise tickets to IT, Biomedical, and Maintenance.
        </p>

        {isSuper ? (
          <label>
            Unit
            <select
              disabled={loading}
              onChange={(event) => setSelectedUnitId(event.target.value)}
              value={selectedUnitId}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <div className="form-error" role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        ) : null}

        {selectedUnit ? (
          <div className="section-heading" style={{ marginTop: 'var(--space-5)' }}>
            <div>
              <p className="eyebrow">{selectedUnit.name}</p>
              <h2>New Department</h2>
            </div>
          </div>
        ) : null}

        <form className="form-stack" onSubmit={handleSubmit} style={{ marginTop: 'var(--space-4)' }}>
          <label>
            Enter new department name
            <input
              disabled={busy || !selectedUnitId}
              maxLength="255"
              onChange={(event) => setNewDepartmentName(event.target.value)}
              placeholder="e.g., HR, Finance, Operations"
              required
              value={newDepartmentName}
            />
          </label>

          <button
            className="button button-primary"
            disabled={busy || !selectedUnitId || !newDepartmentName.trim()}
            type="submit"
          >
            {busy ? 'Creating…' : 'Create department'}
          </button>

          {actionError ? (
            <div className="form-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{actionError}</p>
            </div>
          ) : null}
        </form>

        <div style={{ marginTop: 'var(--space-5)' }}>
          {loading ? (
            <p className="muted">Loading departments…</p>
          ) : departments.length === 0 ? (
            <p className="muted">
              {selectedUnitId
                ? 'No staff departments yet. Create one above.'
                : 'Select a unit to view its staff departments.'}
            </p>
          ) : (
            <div className="ticket-list">
              {departments.map((dept) => (
                <div
                  className="ticket-list-item"
                  key={dept.id}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>{dept.name}</h3>
                    <small className="muted">
                      Created: {new Date(dept.created_at).toLocaleDateString()}
                    </small>
                  </div>

                  {isSuper ? (
                    <button
                      className={`button ${dept.is_active ? 'button-secondary' : 'button-primary'}`}
                      disabled={busy}
                      onClick={() => toggleActive(dept.id, dept.is_active)}
                      type="button"
                    >
                      {dept.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  ) : (
                    <span className={`status-pill ${dept.is_active ? 'status-assigned' : 'status-closed'}`}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  );
}