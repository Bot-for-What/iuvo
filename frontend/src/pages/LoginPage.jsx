import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getRoleHomeRoute } from '../auth/roleRoutes';
import { useAuth } from '../auth/useAuth';
import FullPageMessage from '../components/FullPageMessage';
import {
  ClientOrganizationCredit,
  IuvoWordmark,
  BuilderCredit,
  IuvoRights,
} from '../components/Iuvo';

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'Unable to sign in. Please try again.';
}

function getPostLoginRoute(user, destination) {
  if (user.mustChangePassword) {
    return '/update-password';
  }

  return destination?.startsWith(`/${user.role}/`)
    ? destination
    : getRoleHomeRoute(user.role);
}

export default function LoginPage() {
  const {
    isAuthenticated,
    isRestoringSession,
    login,
    completeTwoFactorLogin,
    user,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [stage, setStage] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingTwoFactorToken, setPendingTwoFactorToken] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

const usernameInputRef = useRef(null);
const otpInputRef = useRef(null);

useEffect(() => {
  if (stage === 'credentials') {
    usernameInputRef.current?.focus();
    return;
  }

  otpInputRef.current?.focus();
}, [stage]);

  if (isRestoringSession) {
    return (
      <FullPageMessage
        title="Loading"
        message="Checking your session."
      />
    );
  }

  if (isAuthenticated) {
    return (
      <Navigate
        replace
        to={user.mustChangePassword ? '/update-password' : getRoleHomeRoute(user.role)}
      />
    );
  }

  const destination = location.state?.from?.pathname;

  function redirectAfterLogin(authenticatedUser) {
    navigate(getPostLoginRoute(authenticatedUser, destination), {
      replace: true,
    });
  }

  async function handleCredentialsSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await login(username.trim(), password);

      if (result.requiresTwoFactor) {
        setPendingTwoFactorToken(result.pendingTwoFactorToken);
        setPassword('');
        setStage('twoFactor');
        return;
      }

      redirectAfterLogin(result.user);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const authenticatedUser = await completeTwoFactorLogin(
        pendingTwoFactorToken,
        otp.trim(),
      );
      setOtp('');
      setPendingTwoFactorToken(null);
      redirectAfterLogin(authenticatedUser);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function returnToCredentials() {
    setStage('credentials');
    setOtp('');
    setPendingTwoFactorToken(null);
    setErrorMessage('');
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <IuvoWordmark className="login-wordmark" />
        </div>

        <div className="login-heading">
          <p className="eyebrow">Service Management Workspace</p>
          <h1 id="login-title">
            {stage === 'credentials' ? 'Sign in to your workspace' : 'Verify your account'}
          </h1>
          <p>
            {stage === 'credentials'
              ? 'Use your assigned username and password.'
              : 'Enter the current code from your authenticator app.'}
          </p>
        </div>

        {errorMessage ? (
          <div className="form-error" role="alert">
            <span aria-hidden="true">!</span>
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {stage === 'credentials' ? (
          <form className="form-stack" onSubmit={handleCredentialsSubmit}>
            <label>
              Username
              <input
                ref={usernameInputRef}
                autoComplete="username"
                disabled={isSubmitting}
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </label>

            <label>
              Password
              <input
                autoComplete="current-password"
                disabled={isSubmitting}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            <button
              className="button button-primary button-block"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="form-stack" onSubmit={handleTwoFactorSubmit}>
            <label>
              Authentication code
              <input
                ref={otpInputRef}
                autoComplete="one-time-code"
                disabled={isSubmitting}
                inputMode="numeric"
                maxLength="6"
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                pattern="[0-9]{6}"
                required
                value={otp}
              />
            </label>

            <button
              className="button button-primary button-block"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
            </button>

            <button
              className="button button-link"
              disabled={isSubmitting}
              onClick={returnToCredentials}
              type="button"
            >
              Use a different account
            </button>
          </form>
        )}

        <ClientOrganizationCredit />
        <BuilderCredit />
      </section>
        <IuvoRights />
    </main>
  );
}