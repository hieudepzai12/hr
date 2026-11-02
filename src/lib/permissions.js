import { NEW_MODULES } from './governance-config.js';

export const MODULES = [
  ['dashboard', 'Tổng quan'], ['employees', 'Nhân viên'], ['profiles','Hồ sơ nhân sự'],
  ['organization', 'Sơ đồ tổ chức'], ['departments', 'Phòng ban'],
  ['reports', 'Báo cáo công việc'], ['tasks', 'Danh sách công việc'],
  ['kpi', 'Đánh giá KPI'], ['customers', 'Khách hàng'],
  ['accounts', 'Tài khoản'], ...NEW_MODULES,
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
export const SCOPED_MODULES = ['tasks', 'reports', 'customers', 'profiles', ...NEW_MODULES.map(([key]) => key)];
export const ACTION_MODULES = {
  employees: ['view', 'edit'],
  departments: ['view', 'create', 'edit', 'delete'],
  kpi: ['view', 'create', 'edit', 'delete'],
  accounts: ['view', 'create', 'deactivate', 'restore', 'reset_password'],
};

function actionPermissions(role, permissions, overrides = {}) {
  const legacyAccounts = Boolean(permissions.employees.manage);
  for (const [module, actions] of Object.entries(ACTION_MODULES)) {
    const value = overrides?.[module];
    const legacy = module === 'accounts'
      ? { view: legacyAccounts, manage: legacyAccounts, reset_password: role === 'admin' }
      : permissions[module];
    const result = {};
    for (const action of actions) result[action] = typeof value?.[action] === 'boolean' ? value[action]
      : action === 'view' ? Boolean(legacy.view)
      : module === 'accounts' && action === 'reset_password' ? Boolean(legacy.reset_password)
      : Boolean(value && typeof value.manage === 'boolean' ? value.manage : legacy.manage);
    result.manage = actions.some(action => action !== 'view' && result[action]);
    if (result.manage) result.view = true;
    permissions[module] = result;
  }
  return permissions;
}

function defaultScopes(role, resource) {
  if (role.startsWith('custom_')) return Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'none']));
  if (role === 'admin') return Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'all']));
  if(resource==='profiles')return Object.fromEntries(DATA_ACTIONS.map(action=>[action,action==='view'?(role==='manager'?'department':'self'):'none']));
  if (NEW_MODULES.some(([key]) => key === resource)) return Object.fromEntries(DATA_ACTIONS.map((action) => [action, 'none']));
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
  for (const resource of SCOPED_MODULES) {
    permissions[resource].scopes = defaultScopes(role, resource);
    if (NEW_MODULES.some(([key]) => key === resource)) {
      permissions[resource].view = role === 'admin';
      permissions[resource].manage = role === 'admin';
    }
  }
  permissions.profiles.view=permissions.profiles.scopes.view!=='none';
  permissions.profiles.manage=false;
  permissions.tasks.scopes.comment=permissions.tasks.scopes.approve;
  return actionPermissions(role, permissions);
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
        if(key==='tasks')defaults[key].scopes.comment=DATA_SCOPES.includes(value.scopes?.comment)?value.scopes.comment:defaults[key].scopes.approve;
        defaults[key].view = defaults[key].scopes.view !== 'none';
        defaults[key].manage = DATA_ACTIONS.some((action) => !['view', 'print'].includes(action) && defaults[key].scopes[action] !== 'none') || (key==='tasks'&&defaults[key].scopes.comment!=='none');
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
  const profileScope=defaults.profiles.scopes.view;
  defaults.profiles.scopes=Object.fromEntries(DATA_ACTIONS.map(action=>[action,action==='view'&&['self','department','all'].includes(profileScope)?profileScope:'none']));
  defaults.profiles.view=defaults.profiles.scopes.view!=='none';
  defaults.profiles.manage=false;
  return actionPermissions(role, defaults, overrides);
}

export function permissionForRequest(pathname, method) {
  if (pathname.startsWith('/api/auth/')) return null;
  if (pathname.startsWith('/api/permissions')) return null;
  if (pathname.startsWith('/api/tasks') || pathname.startsWith('/api/reports') || pathname.startsWith('/api/customers')) return null;
  if (pathname === '/api/dashboard/stats') return ['dashboard', 'view'];
  if (pathname === '/api/organization') return ['organization', 'view'];
  if(pathname==='/api/profiles'||pathname.startsWith('/api/profiles/'))return ['profiles','view'];
  const segment = pathname.split('/')[2];
  if(segment==='employees'){
    if(pathname.endsWith('/reset-password'))return ['accounts','reset_password'];
    if(method==='POST'&&pathname==='/api/employees')return ['accounts','create'];
    if(method==='DELETE'&&!pathname.endsWith('/avatar'))return ['accounts','deactivate'];
    if(method==='PATCH')return ['accounts','restore'];
    if(method==='PUT')return ['employees','edit'];
  }
  if(['departments','kpi'].includes(segment))return [segment,method==='GET'?'view':method==='POST'?'create':method==='DELETE'?'delete':'edit'];
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
