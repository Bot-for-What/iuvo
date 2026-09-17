const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:30040')
  .replace(/\/+$/, '');

const TOKEN_STORAGE_KEY = 'serviceRequest.accessToken';

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    headers = {},
    token = getStoredToken(),
    signal,
    method = 'GET',
  } = options;

  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    const message = responseBody?.message || 'The request could not be completed.';
    throw new ApiError(message, response.status, responseBody);
  }

  return responseBody;
}
