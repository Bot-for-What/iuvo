import { apiRequest, ApiError, getStoredToken } from './client';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:30040')
  .replace(/\/+$/, '');

function buildQuery(filters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(','));
      }
      continue;
    }

    params.set(key, value);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

async function dashboardRequest(path, options = {}) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await readJson(response);

  if (!response.ok) {
    throw new ApiError(
      body?.message || 'Dashboard request could not be completed.',
      response.status,
      body,
    );
  }

  return body;
}

export async function getDashboardMetrics(filters = {}) {
  return dashboardRequest(`/dashboard/metrics${buildQuery(filters)}`);
}

export function getSavedFilters() {
  return apiRequest('/dashboard/saved-filters');
}

export function createSavedFilter(name, filters) {
  return apiRequest('/dashboard/saved-filters', {
    method: 'POST',
    body: {
      name,
      filters,
    },
  });
}

export function deleteSavedFilter(savedFilterId) {
  return apiRequest(`/dashboard/saved-filters/${savedFilterId}`, {
    method: 'DELETE',
  });
}

function getFilename(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export async function downloadDashboardExport(format, filters = {}) {
  if (format !== 'csv' && format !== 'pdf') {
    throw new Error('Export format must be csv or pdf.');
  }

  const token = getStoredToken();
  const query = buildQuery({
    ...filters,
    format,
  });

  const response = await fetch(`${API_BASE_URL}/dashboard/export${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await readJson(response);
    throw new ApiError(
      body?.message || 'Dashboard export could not be completed.',
      response.status,
      body,
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = getFilename(
    response,
    format === 'csv'
      ? 'dashboard-ticket-export.csv'
      : 'dashboard-ticket-export.pdf',
  );

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function emptyDashboardFilters() {
  return {
    unitId: '',
    departmentId: '',
    status: [],
    priority: [],
    assigneeId: '',
    raisedById: '',
    createdFrom: '',
    createdTo: '',
    resolvedFrom: '',
    resolvedTo: '',
    closedFrom: '',
    closedTo: '',
  };
}
