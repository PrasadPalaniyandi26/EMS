// Which routes each role may open. The API remains the source of truth for data;
// this keeps the UI from rendering pages a role should not reach by typing the URL.

const EMPLOYEE_ROUTES = ['/expense', '/approvals', '/settings', '/notifications'];

// Configurator and Operations work in Budget and Costing; they also keep the routes an employee has
const PLANNING_ROUTES = [...EMPLOYEE_ROUTES, '/hub', '/budget', '/manage/orders', '/manage/projects', '/manage/products'];
const PLANNING_ROLES = ['CONFIGURATOR', 'OPERATIONS'];

// Routes limited to specific roles for every user; mirrors @Roles() on the API
const ROLE_ONLY_ROUTES: Record<string, string[]> = {
  '/system/audit-log': ['ADMIN', 'FINANCE'],
  '/budget/settings': ['ADMIN', 'FINANCE'],
};

function matches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function canAccessRoute(pathname: string, roleName?: string | null): boolean {
  const role = (roleName || '').toUpperCase();
  if (!role) return true; // role not loaded yet; the layout waits for auth before checking

  for (const [route, roles] of Object.entries(ROLE_ONLY_ROUTES)) {
    if (matches(pathname, route) && !roles.includes(role)) return false;
  }
  if (role === 'EMPLOYEE') return EMPLOYEE_ROUTES.some((r) => matches(pathname, r));
  if (PLANNING_ROLES.includes(role)) return pathname === '/' || PLANNING_ROUTES.some((r) => matches(pathname, r));
  return true;
}

// Where to send a user who opened a route they cannot access
export function fallbackRoute(roleName?: string | null): string {
  return (roleName || '').toUpperCase() === 'EMPLOYEE' ? '/expense' : '/';
}
