export const MODULES = [
  ['dashboard', 'Tổng quan'], ['employees', 'Nhân viên'],
  ['organization', 'Sơ đồ tổ chức'], ['departments', 'Phòng ban'],
  ['reports', 'Báo cáo'], ['tasks', 'Timeline & Deadline'],
  ['kpi', 'Đánh giá KPI'],
];
export const ROLES = [
  ['admin', 'Admin'], ['director', 'Giám đốc'],
  ['manager', 'Quản lý'], ['employee', 'Nhân viên'],
];
export const ELEVATED_ROLES = ['admin', 'director', 'manager'];
export const BUILTIN_ROLE_KEYS = ROLES.map(([key]) => key);
export const ORGANIZATION_SCOPES = ['none', 'department', 'full'];

export function defaultPermissions(role) {
  const manager = ELEVATED_ROLES.includes(role);
  const permissions = Object.fromEntries(MODULES.map(([key]) => [key, {
    view: BUILTIN_ROLE_KEYS.includes(role) ? (key === 'departments' ? manager : true) : false,
    manage: manager && !['dashboard', 'organization'].includes(key),
  }]));
  permissions.organization.scope = manager ? 'full' : role === 'employee' ? 'department' : 'none';
  return permissions;
}

export function effectivePermissions(role, overrides = {}) {
  const defaults = defaultPermissions(role);
  if (role === 'admin') return defaults;
  for (const [key] of MODULES) {
    const value = overrides?.[key];
    if (value && typeof value === 'object') {
      defaults[key] = {
        view: typeof value.view === 'boolean' ? value.view : defaults[key].view,
        manage: typeof value.manage === 'boolean' ? value.manage : defaults[key].manage,
      };
      if (defaults[key].manage) defaults[key].view = true;
    }
  }
  const organization = overrides?.organization;
  const legacyView = typeof organization?.view === 'boolean' ? organization.view : defaults.organization.view;
  defaults.organization.scope = ORGANIZATION_SCOPES.includes(organization?.scope)
    ? organization.scope
    : !legacyView ? 'none' : ELEVATED_ROLES.includes(role) ? 'full' : 'department';
  defaults.organization.view = defaults.organization.scope !== 'none';
  defaults.organization.manage = false;
  return defaults;
}

export function permissionForRequest(pathname, method) {
  if (pathname.startsWith('/api/auth/')) return null;
  if (pathname.startsWith('/api/permissions')) return null;
  if (pathname === '/api/dashboard/stats') return ['dashboard', 'view'];
  if (pathname === '/api/organization') return ['organization', 'view'];
  const segment = pathname.split('/')[2];
  const section = { employees: 'employees', departments: 'departments', reports: 'reports', tasks: 'tasks', kpi: 'kpi' }[segment];
  if (!section) return null;
  // A user's own avatar and own report submission retain their existing ownership checks.
  if (segment === 'employees' && pathname.endsWith('/avatar')) return null;
  if (segment === 'reports' && (method === 'POST' && pathname === '/api/reports')) return [section, 'view'];
  if (segment === 'tasks' && method === 'PUT') return [section, 'view'];
  if (segment === 'reports' && method === 'DELETE') return [section, 'view'];
  if ((segment === 'reports' || segment === 'tasks') && pathname.includes('/attachments')) return [section, 'view'];
  return [section, method === 'GET' ? 'view' : 'manage'];
}
