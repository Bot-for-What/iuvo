import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getRoleHomeRoute } from '../auth/roleRoutes';
import { useAuth } from '../auth/useAuth';

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'Unable to update your password. Please try again.';
}

export default function UpdatePasswordPage() {
  const { completePasswordChange } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (newPassword !== confirmation) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedUser = await completePasswordChange(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      navigate(getRoleHomeRoute(updatedUser.role), { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="update-password-title">
        <div className="login-heading">
          <p className="eyebrow">Password update required</p>
          <h1 id="update-password-title">Choose a new password</h1>
          <p>
            Your account cannot access the application until you set a password
            that meets the current security policy.
          </p>
        </div>

        {errorMessage ? (
          <div className="form-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              disabled={isSubmitting}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>

          <label>
            New password
            <input
              autoComplete="new-password"
              disabled={isSubmitting}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>

          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              disabled={isSubmitting}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>

          <button className="button button-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      </section>
    </main>
  );
}
