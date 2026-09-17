import { apiRequest } from './client';

export function getPasswordPolicy() {
  return apiRequest('/security/password-policy');
}

export function updatePasswordPolicy(passwordPolicy, reason) {
  return apiRequest('/security/password-policy', {
    method: 'PATCH',
    body: {
      passwordPolicy,
      reason,
    },
  });
}

export async function getSecurityUsers() {
  const response = await apiRequest('/security/users');
  return response.users || [];
}

export function setUserPasswordPolicy(userId, passwordPolicy, reason) {
  return apiRequest(`/security/users/${userId}/password-policy`, {
    method: 'PATCH',
    body: {
      passwordPolicy,
      reason,
    },
  });
}

export function clearUserPasswordPolicy(userId, reason) {
  return apiRequest(`/security/users/${userId}/password-policy`, {
    method: 'DELETE',
    body: {
      reason,
    },
  });
}

export function resetSecurityUserPassword(userId) {
  return apiRequest(`/security/users/${userId}/reset-password`, {
    method: 'POST',
  });
}

export async function getDelegates() {
  const response = await apiRequest('/security/delegates');
  return response.delegates || [];
}

export function grantDelegate(userId, reason) {
  return apiRequest(`/security/delegates/${userId}`, {
    method: 'POST',
    body: {
      reason,
    },
  });
}

export function revokeDelegate(userId, reason) {
  return apiRequest(`/security/delegates/${userId}`, {
    method: 'DELETE',
    body: {
      reason,
    },
  });
}

export async function getSecurityAuditEvents(limit = 50) {
  const response = await apiRequest(`/security/audit-events?limit=${limit}`);
  return response.auditEvents || [];
}
