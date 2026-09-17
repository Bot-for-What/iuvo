import { apiRequest } from './client';

export function login(credentials) {
  return apiRequest('/auth/login', {
    method: 'POST',
    token: null,
    body: credentials,
  });
}

export function verifyTwoFactor(pendingTwoFactorToken, otp) {
  return apiRequest('/auth/login/verify-2fa', {
    method: 'POST',
    token: null,
    body: {
      pending_2fa_token: pendingTwoFactorToken,
      otp,
    },
  });
}

export function getCurrentUser() {
  return apiRequest('/auth/me');
}

export function changePassword(currentPassword, newPassword) {
  return apiRequest('/auth/change-password', {
    method: 'POST',
    body: {
      currentPassword,
      newPassword,
    },
  });
}

export function logout() {
  return apiRequest('/auth/logout', {
    method: 'POST',
  });
}
