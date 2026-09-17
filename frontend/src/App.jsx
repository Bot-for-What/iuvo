import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import FullPageMessage from './components/FullPageMessage';
import { getRoleHomeRoute } from './auth/roleRoutes';
import { useAuth } from './auth/useAuth';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RoleHomePage from './pages/RoleHomePage';
import TicketsPage from './pages/TicketsPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import UnitsPage from './pages/UnitsPage';
import UsersPage from './pages/UsersPage';
import DashboardPage from './pages/DashboardPage';
import SecurityPage from './pages/SecurityPage';
import StaffDepartmentsPage from './pages/StaffDepartmentsPage';

function RootRedirect() {
  const { isAuthenticated, isRestoringSession, user } = useAuth();

  if (isRestoringSession) {
    return (
      <FullPageMessage
        title="Loading"
        message="Checking your session."
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return (
    <Navigate
      replace
      to={user.mustChangePassword ? '/update-password' : getRoleHomeRoute(user.role)}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/update-password" element={<UpdatePasswordPage />} />

        <Route path="/super/dashboard" element={<DashboardPage />} />
        <Route path="/super/tickets" element={<TicketsPage />} />
        <Route path="/super/units" element={<UnitsPage />} />
        <Route path="/super/users" element={<UsersPage />} />
        <Route path="/super/security" element={<SecurityPage />} />

        <Route path="/management/dashboard" element={<DashboardPage />} />
        <Route path="/management/filters" element={<DashboardPage />} />

        <Route path="/admin/tickets" element={<TicketsPage />} />
        <Route path="/admin/team" element={<UsersPage />} />
        <Route path="/admin/security" element={<SecurityPage />} />

        <Route path="/team/tickets" element={<TicketsPage />} />
        <Route path="/team/staff" element={<UsersPage />} />

        <Route path="/staff/tickets" element={<TicketsPage />} />
        {/*<Route path="/staff/profile" element={<RoleHomePage />} />*/}
      </Route>

        <Route path="/super/staff-departments" element={<StaffDepartmentsPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}