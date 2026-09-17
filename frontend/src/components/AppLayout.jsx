import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getRoleHomeRoute, getRoleNavigation } from '../auth/roleRoutes';
import { useAuth } from '../auth/useAuth';
import { IuvoMonogram, IuvoWordmark } from './Iuvo';
import { useEffect, useState, useCallback } from 'react';

const roleLabels = {
  super: 'Super',
  management: 'Management',
  admin: 'Admin',
  team: 'Team',
  staff: 'Staff',
};

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasUnreadTickets, setHasUnreadTickets] = useState(false);
  
  // Guard: don't render if not authenticated
  if (!user) {
    return null;
  }
  
  const userRole = user.role || 'loading';
  const navigationItems = getRoleNavigation(userRole);
  const roleLabel = roleLabels[userRole] || userRole;

  const builderLogoUrl = import.meta.env.VITE_BUILDER_LOGO_URL?.trim();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  function navigateHome() {
    navigate(getRoleHomeRoute(userRole));
  }

  function renderNavigation(className) {
    return (
      <nav aria-label="Main navigation" className={className}>
        {navigationItems.map((item) => (
          <NavLink
            className={({ isActive }) => (
              `navigation-link${isActive ? ' navigation-link-active' : ''}`
            )}
            key={item.to}
            to={item.to}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  // Fetch unread summary
const fetchUnreadSummary = useCallback(async () => {
  try {
    const token = sessionStorage.getItem('serviceRequest.accessToken');
    if (!token) return;

    const res = await fetch('/api/tickets/unread-summary', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      setHasUnreadTickets(data.hasUnread);
    } else {
      const errorText = await res.text();
    }
  } catch (err) {
  }
}, []);

  // Fetch on mount and whenever route changes (optimistic refresh after any ticket interaction)
  useEffect(() => {
    fetchUnreadSummary();
  }, [fetchUnreadSummary, location.pathname]);

  useEffect(() => {
  fetchUnreadSummary();
}, [fetchUnreadSummary, location.pathname]);

useEffect(() => {
  function handleRefreshUnread() {
    fetchUnreadSummary();
  }

  window.addEventListener('iuvo:refresh-unread', handleRefreshUnread);
  return () => window.removeEventListener('iuvo:refresh-unread', handleRefreshUnread);
}, [fetchUnreadSummary]);

  // Get unit and department names from user object
const unitName = user.unitName || '';
const departmentName = user.departmentName || '';
const scopeLabel = unitName && departmentName
  ? `${unitName} » ${departmentName}`
  : '';

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button
          aria-label="Go to IUVO home"
          className="sidebar-brand"
          onClick={navigateHome}
          type="button"
        >
          <IuvoWordmark />
        </button>

        <div className="sidebar-navigation-group">
          <p className="navigation-label">Workspace</p>
          {renderNavigation('sidebar-navigation')}
        </div>

        <div className="sidebar-footer">
          <span>IUVO service workspace</span>
          {builderLogoUrl ? (
            <img
              alt="Builder logo"
              className="sidebar-builder-logo"
              src={builderLogoUrl}
            />
          ) : null}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button
            aria-label="Go to IUVO home"
            className="mobile-brand-button"
            onClick={navigateHome}
            type="button"
          >
            <IuvoMonogram />
            <IuvoWordmark className="mobile-wordmark" />
          </button>

          <div className="user-actions">
            <div className="user-summary">
              <strong>{user.fullName || user.name || 'User'}</strong>
              {scopeLabel ? <span>{scopeLabel}</span> : null}
            </div>

            {/* Sidebar unread badge — shown when user has any unread ticket */}
            {hasUnreadTickets && (
              <span
                className="unread-badge"
                title="You have unread ticket messages"
              >
                &#128386;
              </span>
            )} {/* 128386 => 🖂; 128488 => 🗨; 128365 => 🕭; 128712 => 🛈  */}

            <button
              className="button button-secondary logout-button"
              onClick={handleLogout}
              type="button"
            >
              Log out
            </button>
          </div>
        </header>
        <div className="mobile-navigation-wrap">
          {renderNavigation('mobile-navigation')}
        </div>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}