import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { getUnits } from '../api/units';
import {
  createSavedFilter,
  deleteSavedFilter,
  downloadDashboardExport,
  emptyDashboardFilters,
  getDashboardMetrics,
  getSavedFilters,
} from '../api/dashboard';
import { useAuth } from '../auth/useAuth';
import AppLayout from '../components/AppLayout';

const statuses = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const priorities = ['low', 'medium', 'high', 'urgent'];

const summaryCards = [
  ['total', 'Total tickets', 'totalTickets', 'neutral'],
  ['open', 'Open', 'openTickets', 'warning'],
  ['assigned', 'Assigned', 'assignedTickets', 'primary'],
  ['progress', 'In progress', 'inProgressTickets', 'primary'],
  ['resolved', 'Resolved', 'resolvedTickets', 'success'],
  ['closed', 'Closed', 'closedTickets', 'closed'],
  ['resolution', 'Avg. resolution hours', 'averageResolutionHours', 'neutral'],
];

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

function errorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (import.meta.env.DEV && error instanceof Error) {
    return error.message;
  }

  return 'Dashboard request failed. Please try again.';
}

function selectedLabel(values, allLabel) {
  if (!values.length) {
    return allLabel;
  }

  if (values.length === 1) {
    return label(values[0]);
  }

  return `${values.length} selected`;
}

function CountTable({ title, rows, labelKey }) {
  const columnLabel = title
    .replace('Tickets by ', '')
    .replace('Tickets per ', '');

  return (
    <section className="report-card">
      <div className="report-card-heading">
        <h3>{title}</h3>
        <span className="report-card-total">
          {rows?.length || 0} {rows?.length === 1 ? 'result' : 'results'}
        </span>
      </div>

      {rows?.length ? (
        <div className="report-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{columnLabel}</th>
                <th scope="col">Tickets</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row[labelKey]}>
                  <td>{label(row[labelKey])}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="report-empty-state">
          No matching data for the selected filters.
        </p>
      )}
    </section>
  );
}

function TicketStatusWorkload({ rows }) {
  const maxCount = Math.max(
    ...(rows || []).map((row) => Number(row.count) || 0),
    1,
  );

  const total = (rows || []).reduce(
    (sum, row) => sum + (Number(row.count) || 0),
    0,
  );

  return (
    <section className="dashboard-workload-card">
      <div className="dashboard-workload-heading">
        <div>
          <p className="eyebrow">Primary view</p>
          <h2>Ticket workload</h2>
          <p>Current ticket volume by lifecycle status.</p>
        </div>

        <span className="dashboard-workload-total">
          {total} tickets
        </span>
      </div>

      {rows?.length ? (
        <div className="dashboard-workload-bars">
          {rows.map((row) => {
            const count = Number(row.count) || 0;
            const width = `${Math.max((count / maxCount) * 100, 3)}%`;

            return (
              <div className="dashboard-workload-row" key={row.status}>
                <span className="dashboard-workload-label">
                  {label(row.status)}
                </span>

                <div
                  aria-label={`${label(row.status)}: ${count} tickets`}
                  className="dashboard-workload-track"
                  role="img"
                >
                  <span
                    className={`dashboard-workload-bar status-${row.status}`}
                    style={{ width }}
                  />
                </div>

                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="report-empty-state">
          No matching data for the selected filters.
        </p>
      )}
    </section>
  );
}

function CheckboxDropdown({
  buttonLabel,
  field,
  filters,
  isOpen,
  menuId,
  menuName,
  onToggleMenu,
  onToggleValue,
  options,
}) {
  return (
    <div className="dashboard-dropdown" data-dashboard-menu={menuName}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        className={`dashboard-dropdown-trigger ${
          isOpen ? 'is-open' : ''
        }`}
        onClick={onToggleMenu}
        type="button"
      >
        <span>{buttonLabel}</span>
        <span aria-hidden="true" className="dashboard-dropdown-arrow" />
      </button>

      {isOpen ? (
        <div className="dashboard-dropdown-menu" id={menuId}>
          {options.map((option) => (
            <label className="checkbox-label" key={option}>
              <input
                checked={filters[field].includes(option)}
                onChange={() => onToggleValue(field, option)}
                type="checkbox"
              />
              <span>{label(option)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [filters, setFilters] = useState(emptyDashboardFilters());
  const [units, setUnits] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [openMenu, setOpenMenu] = useState('');
  const [showSaveFilterForm, setShowSaveFilterForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [savingFilter, setSavingFilter] = useState(false);
  const [deletingFilterId, setDeletingFilterId] = useState('');

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === filters.unitId),
    [filters.unitId, units],
  );

  const departments = selectedUnit?.departments || [];

  async function load(nextFilters = filters) {
    setLoading(true);
    setError('');

    try {
      const [metricResponse, unitResponse, savedFilterResponse] = await Promise.all([
        getDashboardMetrics(nextFilters),
        getUnits(),
        getSavedFilters(),
      ]);

      setMetrics(metricResponse.metrics);
      setUnits(unitResponse);
      setSavedFilters(savedFilterResponse.savedFilters || []);
      return true;
    } catch (err) {
      console.error('Failed to load dashboard data.', err);
      setError(errorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
  if (!openMenu) {
    return undefined;
  }

  function closeOpenMenu(event) {
    const activeMenu = document.querySelector(
      `[data-dashboard-menu="${openMenu}"]`,
    );

    if (activeMenu && !activeMenu.contains(event.target)) {
      setOpenMenu('');
      setShowSaveFilterForm(false);
    }
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape') {
      setOpenMenu('');
      setShowSaveFilterForm(false);
    }
  }

  document.addEventListener('pointerdown', closeOpenMenu);
  document.addEventListener('keydown', closeOnEscape);

  return () => {
    document.removeEventListener('pointerdown', closeOpenMenu);
    document.removeEventListener('keydown', closeOnEscape);
  };
}, [openMenu]);

  function update(field, value) {
    const next = { ...filters, [field]: value };

    if (field === 'unitId') {
      next.departmentId = '';
    }

    setFilters(next);
  }

  function toggleListValue(field, value) {
    update(
      field,
      filters[field].includes(value)
        ? filters[field].filter((item) => item !== value)
        : [...filters[field], value],
    );
  }

  function toggleMenu(menu) {
    setShowSaveFilterForm(false);
    setOpenMenu((currentMenu) => (
      currentMenu === menu ? '' : menu
    ));
  }

  async function applyFilters() {
    const succeeded = await load();

    if (succeeded) {
      setOpenMenu('');
    }
  }

  async function clearFilters() {
    const nextFilters = emptyDashboardFilters();

    setFilters(nextFilters);

    const succeeded = await load(nextFilters);

    if (succeeded) {
      setOpenMenu('');
    }
  }

  async function exportFile(format) {
    setExporting(format);
    setError('');

    try {
      await downloadDashboardExport(format, filters);
    } catch (err) {
      console.error(`Failed to export dashboard as ${format}.`, err);
      setError(errorMessage(err));
    } finally {
      setExporting('');
    }
  }

  async function saveCurrentFilter() {
    if (!savedFilterName.trim()) {
      setError('Enter a saved filter name.');
      return;
    }

    setSavingFilter(true);
    setError('');

    try {
      await createSavedFilter(savedFilterName.trim(), filters);
      setSavedFilterName('');
      setShowSaveFilterForm(false);

      const response = await getSavedFilters();
      setSavedFilters(response.savedFilters || []);
    } catch (err) {
      console.error('Failed to save dashboard filter.', err);
      setError(errorMessage(err));
    } finally {
      setSavingFilter(false);
    }
  }

  async function applySavedFilter(savedFilter) {
    const nextFilters = {
      ...emptyDashboardFilters(),
      ...(savedFilter.filters || {}),
    };

    setFilters(nextFilters);

    const succeeded = await load(nextFilters);

    if (succeeded) {
      setOpenMenu('');
    }
  }

  async function removeSavedFilter(savedFilterId) {
    setDeletingFilterId(savedFilterId);
    setError('');

    try {
      await deleteSavedFilter(savedFilterId);

      const response = await getSavedFilters();
      setSavedFilters(response.savedFilters || []);
    } catch (err) {
      console.error('Failed to delete dashboard filter.', err);
      setError(errorMessage(err));
    } finally {
      setDeletingFilterId('');
    }
  }

  const summary = metrics?.summary || {};

  return (
    <AppLayout>
      <div className="dashboard-page">
        <section
          aria-label={`${user.role} Dashboard filters and actions`}
          className="dashboard-control-row"
        >
          <div className="dashboard-filter-fields">
          <label className="dashboard-control-field">
            <span>Created from</span>
            <input
              onChange={(event) => update('createdFrom', event.target.value)}
              type="date"
              value={filters.createdFrom}
            />
          </label>

          <label className="dashboard-control-field">
            <span>Created to</span>
            <input
              onChange={(event) => update('createdTo', event.target.value)}
              type="date"
              value={filters.createdTo}
            />
          </label>

          <label className="dashboard-control-field">
            <span>Unit</span>
            <select
              onChange={(event) => update('unitId', event.target.value)}
              value={filters.unitId}
            >
              <option value="">All units</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>

          <label className="dashboard-control-field">
            <span>Department</span>
            <select
              disabled={!filters.unitId}
              onChange={(event) => update('departmentId', event.target.value)}
              value={filters.departmentId}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <div className="dashboard-control-field">
            <span>Status</span>
            <CheckboxDropdown
              buttonLabel={selectedLabel(filters.status, 'All statuses')}
              field="status"
              filters={filters}
              isOpen={openMenu === 'status'}
              menuId="dashboard-status-menu"
              menuName="status"
              onToggleMenu={() => toggleMenu('status')}
              onToggleValue={toggleListValue}
              options={statuses}
            />
          </div>

          <div className="dashboard-control-field">
            <span>Priority</span>
            <CheckboxDropdown
              buttonLabel={selectedLabel(filters.priority, 'All priorities')}
              field="priority"
              filters={filters}
              isOpen={openMenu === 'priority'}
              menuId="dashboard-priority-menu"
              menuName="priority"
              onToggleMenu={() => toggleMenu('priority')}
              onToggleValue={toggleListValue}
              options={priorities}
            />
          </div>
          </div>

          <div className="dashboard-control-actions">
            <button
              className="dashboard-text-action dashboard-apply-action"
              disabled={loading}
              onClick={applyFilters}
              type="button"
            >
              Apply
            </button>

            <button
              className="dashboard-text-action"
              disabled={loading}
              onClick={clearFilters}
              type="button"
            >
              Clear
            </button>

            <button
              className="dashboard-text-action"
              disabled={loading}
              onClick={() => load()}
              type="button"
            >
              Refresh
            </button>

            <div className="dashboard-dropdown" data-dashboard-menu="export">
              <button
                aria-controls="dashboard-export-menu"
                aria-expanded={openMenu === 'export'}
                className={`dashboard-text-action ${
                  openMenu === 'export' ? 'is-open' : ''
                }`}
                onClick={() => toggleMenu('export')}
                type="button"
              >
                Export <span aria-hidden="true">▾</span>
              </button>

              {openMenu === 'export' ? (
                <div
                  className="dashboard-dropdown-menu dashboard-export-menu"
                  id="dashboard-export-menu"
                >
                  <button
                    disabled={Boolean(exporting)}
                    onClick={() => exportFile('csv')}
                    type="button"
                  >
                    {exporting === 'csv' ? 'Preparing CSV…' : 'Export CSV'}
                  </button>

                  <button
                    disabled={Boolean(exporting)}
                    onClick={() => exportFile('pdf')}
                    type="button"
                  >
                    {exporting === 'pdf' ? 'Preparing PDF…' : 'Export PDF'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

        </section>

        <div className="dashboard-saved-filter-row">
          <div className="dashboard-dropdown" data-dashboard-menu="saved-filters">
            <button
              aria-controls="dashboard-saved-filter-menu"
              aria-expanded={openMenu === 'saved-filters'}
              className={`dashboard-saved-filter-trigger ${
                openMenu === 'saved-filters' ? 'is-open' : ''
              }`}
              onClick={() => toggleMenu('saved-filters')}
              type="button"
            >
              Saved filters
              {savedFilters.length ? ` (${savedFilters.length})` : ''}
            </button>

            {openMenu === 'saved-filters' ? (
              <div
                className="dashboard-dropdown-menu dashboard-saved-filter-menu"
                id="dashboard-saved-filter-menu"
              >
                {!showSaveFilterForm ? (
                  <button
                    className="dashboard-save-filter-option"
                    onClick={() => setShowSaveFilterForm(true)}
                    type="button"
                  >
                    Save applied filter
                  </button>
                ) : null}

                {showSaveFilterForm ? (
                  <div className="dashboard-save-filter-form">
                    <label>
                      Filter name
                      <input
                        autoFocus
                        maxLength="120"
                        onChange={(event) => setSavedFilterName(event.target.value)}
                        placeholder="For example: Open IT tickets"
                        value={savedFilterName}
                      />
                    </label>

                    <div>
                      <button
                        className="button button-primary"
                        disabled={savingFilter}
                        onClick={saveCurrentFilter}
                        type="button"
                      >
                        {savingFilter ? 'Saving…' : 'Save'}
                      </button>

                      <button
                        className="button button-secondary"
                        disabled={savingFilter}
                        onClick={() => {
                          setSavedFilterName('');
                          setShowSaveFilterForm(false);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {savedFilters.length ? (
                  <div className="dashboard-saved-filter-list">
                    {savedFilters.map((savedFilter) => (
                      <div className="dashboard-saved-filter-item" key={savedFilter.id}>
                        <button
                          onClick={() => applySavedFilter(savedFilter)}
                          title={savedFilter.name}
                          type="button"
                        >
                          {savedFilter.name}
                        </button>

                        <button
                          aria-label={`Delete saved filter ${savedFilter.name}`}
                          className="dashboard-delete-filter-button"
                          data-tooltip="Delete"
                          disabled={deletingFilterId === savedFilter.id}
                          onClick={() => removeSavedFilter(savedFilter.id)}
                          type="button"
                        >
                          {deletingFilterId === savedFilter.id ? '…' : '×'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : !showSaveFilterForm ? (
                  <p className="dashboard-saved-filter-empty">
                    No saved filters yet.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div aria-live="polite" className="form-error" role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        ) : null}

        {loading ? (
          <section aria-live="polite" className="dashboard-loading content-card">
            <p>Loading dashboard data…</p>
          </section>
        ) : null}

        {!loading && metrics ? (
          <>
            <section aria-label="Operational summary">
              <div className="dashboard-summary">
                {summaryCards.map(([id, name, metric, tone]) => (
                  <article className={`summary-card summary-card-${tone}`} key={id}>
                    <span>{name}</span>
                    <strong>{summary[metric] ?? '—'}</strong>
                  </article>
                ))}
              </div>
            </section>

            <TicketStatusWorkload rows={metrics.ticketsByStatus} />

            <section aria-label="Operational breakdown reports">
              <div className="dashboard-reports">
                <CountTable
                  labelKey="unit"
                  rows={metrics.ticketsByUnit}
                  title="Tickets by unit"
                />
                <CountTable
                  labelKey="department"
                  rows={metrics.ticketsByDepartment}
                  title="Tickets by department"
                />
                <CountTable
                  labelKey="department"
                  rows={metrics.unresolvedTicketsByDepartment}
                  title="Unresolved tickets per department"
                />
                <CountTable
                  labelKey="teamMember"
                  rows={metrics.ticketsPerTeamMember}
                  title="Tickets per Team member"
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}