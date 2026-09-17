import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getRoleHomeRoute, isRouteAllowedForRole } from '../auth/roleRoutes';
import FullPageMessage from './FullPageMessage';

export default function ProtectedRoute() {
  const { isAuthenticated, isRestoringSession, user } = useAuth();
  const location = useLocation();

  if (isRestoringSession) {
    return (
      <FullPageMessage
        title="Restoring your session"
        message="Please wait while your account is verified."
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.mustChangePassword) {
    if (location.pathname !== '/update-password') {
      return <Navigate to="/update-password" replace />;
    }

    return <Outlet />;
  }

  if (location.pathname === '/update-password') {
    return <Navigate to={getRoleHomeRoute(user.role)} replace />;
  }

  if (!isRouteAllowedForRole(location.pathname, user.role)) {
    return <Navigate to={getRoleHomeRoute(user.role)} replace />;
  }

  return <Outlet />;
}