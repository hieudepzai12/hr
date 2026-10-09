import { query, queryOne } from './db';
import { effectivePermissions, ROLES } from './permissions';

export async function getRolePermissions(role) {
  const row = await queryOne('SELECT permissions FROM role_permissions WHERE role = $1', [role]);
  return effectivePermissions(role, row?.permissions);
}

export async function listRoles() {
  const { rows } = await query('SELECT role, label, permissions, is_deleted FROM role_permissions ORDER BY label');
  const byRole = new Map(rows.map(row => [row.role, row]));
  const builtins = ROLES.filter(([role]) => !byRole.get(role)?.is_deleted).map(([role, label]) => ({
    role, label: byRole.get(role)?.label || label, permissions: effectivePermissions(role, byRole.get(role)?.permissions),
  }));
  return [...builtins, ...rows.filter(row => !row.is_deleted && !ROLES.some(([key]) => key === row.role)).map(row => ({
    role: row.role, label: row.label, permissions: effectivePermissions(row.role, row.permissions),
  }))];
}

export async function roleExists(role) {
  const builtin = ROLES.some(([key]) => key === role);
  const row = await queryOne('SELECT label, is_deleted FROM role_permissions WHERE role = $1', [role]);
  return !row?.is_deleted && (builtin || Boolean(row?.label));
}

export async function getRoleLabel(role) {
  const builtin = ROLES.find(([key]) => key === role);
  if (builtin) return (await queryOne('SELECT label FROM role_permissions WHERE role = $1', [role]))?.label || builtin[1];
  return (await queryOne('SELECT label FROM role_permissions WHERE role = $1', [role]))?.label || role;
}
