import { apiRequest } from './client';

export async function getUsers() {
  const response = await apiRequest('/users');
  return response.users || [];
}

export async function createUser(user) {
  const response = await apiRequest('/users', {
    method: 'POST',
    body: user,
  });

  return response.user || response;
}

export async function updateUser(userId, changes) {
  const response = await apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: changes,
  });

  return response.user || response;
}

export async function updateUsername(userId, username) {
  const response = await apiRequest(`/users/${userId}/username`, {
    method: 'PATCH',
    body: { username },
  });

  return response.user || response;
}

export async function setUserActiveState(userId, isActive) {
  const action = isActive ? 'enable' : 'disable';

  const response = await apiRequest(`/users/${userId}/${action}`, {
    method: 'PATCH',
  });

  return response.user || response;
}

export async function resetPassword(userId) {
  return apiRequest(`/users/${userId}/reset-password`, {
    method: 'POST',
  });
}

export async function updateTwoFactor(userId, enabled) {
  const response = await apiRequest(`/users/${userId}/2fa`, {
    method: 'PATCH',
    body: { enabled },
  });

  // Return the full response so the caller can access twoFactorSetup if present.
  return response;
}