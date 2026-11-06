import { DATA_SCOPES } from './permissions';

export function kpiScope(user) {
  const permission = user.permissions?.kpi;
  if (!permission?.view) return 'none';
  return DATA_SCOPES.includes(permission.scope) ? permission.scope : permission.manage ? 'all' : 'self';
}

export function canAccessKpiEmployee(user, employee) {
  if (!employee || employee.role === 'admin' && user.role !== 'admin') return false;
  const scope = kpiScope(user);
  return scope === 'all' || scope === 'self' && Number(employee.id) === Number(user.id) ||
    scope === 'department' && user.department_id != null && Number(employee.department_id) === Number(user.department_id);
}

export function scopeFor(user, module, action) {
  const scope = user.permissions?.[module]?.scopes?.[action];
  return DATA_SCOPES.includes(scope) ? scope : 'none';
}

export function scopeAllows(user, module, action, { ownerId, departmentId } = {}) {
  const scope = scopeFor(user, module, action);
  if (scope === 'all') return true;
  if (scope === 'department') return user.department_id != null && Number(departmentId) === Number(user.department_id);
  if (scope === 'self') return ownerId != null && Number(ownerId) === Number(user.id);
  return false;
}

export function scopedWhere(user, module, action, alias, ownerColumn, departmentColumn, parameterIndex = 1) {
  const scope = scopeFor(user, module, action);
  if (scope === 'all') return { sql: 'TRUE', params: [] };
  if (scope === 'department') return {
    sql: `${alias}.${departmentColumn} = $${parameterIndex}`,
    params: [user.department_id ?? -1],
  };
  if (scope === 'self') return {
    sql: `${alias}.${ownerColumn} = $${parameterIndex}`,
    params: [user.id],
  };
  return { sql: 'FALSE', params: [] };
}
