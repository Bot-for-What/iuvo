import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '../api/client';
import {
  changePassword as changePasswordRequest,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  verifyTwoFactor,
} from '../api/auth';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const clearSession = useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  const establishSession = useCallback((token, authenticatedUser) => {
    setStoredToken(token);
    setUser(authenticatedUser);
  }, []);

  useEffect(() => {
    let isActive = true;
    const token = getStoredToken();

    if (!token) {
      setIsRestoringSession(false);
      return undefined;
    }

    getCurrentUser()
      .then((response) => {
        if (isActive) {
          setUser(response.user || response);
        }
      })
      .catch(() => {
        if (isActive) {
          clearSession();
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRestoringSession(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [clearSession]);

  const login = useCallback(async (username, password) => {
    const response = await loginRequest({ username, password });

    if (response.requiresTwoFactor) {
      return {
        requiresTwoFactor: true,
        pendingTwoFactorToken: response.pending_2fa_token,
      };
    }

    establishSession(response.token, response.user);

    return {
      requiresTwoFactor: false,
      user: response.user,
    };
  }, [establishSession]);

  const completeTwoFactorLogin = useCallback(async (pendingTwoFactorToken, otp) => {
    const response = await verifyTwoFactor(pendingTwoFactorToken, otp);
    establishSession(response.token, response.user);
    return response.user;
  }, [establishSession]);

  const completePasswordChange = useCallback(async (currentPassword, newPassword) => {
    const response = await changePasswordRequest(currentPassword, newPassword);
    const updatedUser = response.user || response;

    establishSession(response.token, updatedUser);

    return updatedUser;
  }, [establishSession]);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await logoutRequest();
      }
    } catch {
      // Local session must end even when an expired backend session cannot log out.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isRestoringSession,
    login,
    completeTwoFactorLogin,
    completePasswordChange,
    logout,
    clearSession,
  }), [
    clearSession,
    completePasswordChange,
    completeTwoFactorLogin,
    isRestoringSession,
    login,
    logout,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}