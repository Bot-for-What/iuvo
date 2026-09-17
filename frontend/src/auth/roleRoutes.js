export const roleHomeRoutes = {
  super: '/super/dashboard',
  management: '/management/dashboard',
  admin: '/admin/tickets',
  team: '/team/tickets',
  staff: '/staff/tickets',
};


const roleNavigation = {
  super: [
    { to: '/super/dashboard', label: 'Dashboard' },
    { to: '/super/tickets', label: 'Tickets' },
    { to: '/super/units', label: 'Units' },
    { to: '/super/users', label: 'Users' },
    { to: '/super/staff-departments', label: 'Departments' },
    { to: '/super/security', label: 'Security' },
  ],
  management: [
    { to: '/management/dashboard', label: 'Dashboard' },
    //{ to: '/management/filters', label: 'Saved filters' },
  ],
  admin: [
    { to: '/admin/tickets', label: 'Tickets' },
    { to: '/admin/team', label: 'Users' },
    { to: '/admin/security', label: 'Security' },
  ],
  team: [
    { to: '/team/tickets', label: 'Tickets' },
    { to: '/team/staff', label: 'Staff' },
  ],
  staff: [
    { to: '/staff/tickets', label: 'My tickets' },
    //{ to: '/staff/profile', label: 'RoleHomePage' },
  ],
};



export function getRoleHomeRoute(role) {
  return roleHomeRoutes[role] || '/login';
}

export function getRoleNavigation(role) {
  return roleNavigation[role] || [];
}

export function isRouteAllowedForRole(pathname, role) {
  if (!role) {
    return false;
  }

  return pathname.startsWith(`/${role}/`);
}