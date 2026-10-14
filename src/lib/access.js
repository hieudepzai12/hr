import { DATA_SCOPES } from './permissions';

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
