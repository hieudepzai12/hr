export const MODULES = [
  ['dashboard', 'Tổng quan'], ['employees', 'Nhân viên'],
  ['organization', 'Sơ đồ tổ chức'], ['departments', 'Phòng ban'],
  ['reports', 'Báo cáo'], ['tasks', 'Timeline & Deadline'],
  ['kpi', 'Đánh giá KPI'], ['customers', 'Khách hàng'],
];
export const ROLES = [
  ['admin', 'Admin'], ['director', 'Giám đốc'],
  ['manager', 'Quản lý'], ['hr', 'Nhân sự (HR)'], ['employee', 'Nhân viên'],
];
export const ELEVATED_ROLES = ['admin', 'director', 'manager'];
export const BUILTIN_ROLE_KEYS = ROLES.map(([key]) => key);
export const ORGANIZATION_SCOPES = ['none', 'department', 'full'];
export const DATA_SCOPES = ['none', 'self', 'department', 'all'];
export const DATA_ACTIONS = ['view', 'create', 'edit', 'approve', 'delete', 'restore', 'print'];
export const SCOPED_MODULES = ['tasks', 'reports', 'customers'];

function defaultScopes(role, resource) {
  if (role.startsWith('custom_')) return Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'none']));
  if (role === 'admin') return Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'all']));
  if (resource === 'customers') return {
    view: role === 'director' || role === 'hr' ? 'all' : 'department',
    create: role === 'director' || role === 'hr' ? 'all' : 'none',
    edit: role === 'director' || role === 'hr' ? 'all' : 'none',
    approve: 'none', delete: 'none', restore: 'none', print: 'none',
  };
  if (role === 'director') return { view: 'all', create: resource === 'tasks' ? 'all' : 'self', edit: 'self', approve: 'all', delete: 'none', restore: 'none', print: 'all' };
  if (role === 'hr') return { view: 'all', create: 'self', edit: 'self', approve: 'none', delete: 'none', restore: 'none', print: 'all' };
  if (role === 'manager') return { view: 'department', create: resource === 'tasks' ? 'department' : 'self', edit: 'self', approve: 'department', delete: 'none', restore: 'none', print: 'department' };
  return { view: 'self', create: 'self', edit: 'self', approve: 'none', delete: resource === 'reports' ? 'self' : 'none', restore: 'none', print: 'self' };
}

export function defaultPermissions(role) {
  const manager = ELEVATED_ROLES.includes(role);
  const permissions = Object.fromEntries(MODULES.map(([key]) => [key, {
    view: BUILTIN_ROLE_KEYS.includes(role) ? (key === 'departments' ? manager : true) : false,
    manage: manager && !['dashboard', 'organization'].includes(key),
  }]));
  permissions.organization.scope = manager ? 'full' : role === 'employee' ? 'department' : 'none';
  if (role === 'hr') permissions.organization.scope = 'full';
  for (const resource of SCOPED_MODULES) permissions[resource].scopes = defaultScopes(role, resource);
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
      if (SCOPED_MODULES.includes(key)) {
        const existing = role.startsWith('custom_') && !value.scopes && value.manage
          ? Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'all']))
          : role.startsWith('custom_') && !value.scopes && value.view
            ? { ...defaultScopes(role, key), view: 'self', print: 'self', create: key === 'reports' ? 'self' : 'none' }
            : defaultScopes(role, key);
        defaults[key].scopes = Object.fromEntries(DATA_ACTIONS.map((action) => [action,
          DATA_SCOPES.includes(value.scopes?.[action]) ? value.scopes[action] : existing[action],
        ]));
        defaults[key].view = defaults[key].scopes.view !== 'none';
        defaults[key].manage = DATA_ACTIONS.some((action) => !['view', 'print'].includes(action) && defaults[key].scopes[action] !== 'none');
      }
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
  if (pathname.startsWith('/api/tasks') || pathname.startsWith('/api/reports') || pathname.startsWith('/api/customers')) return null;
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
