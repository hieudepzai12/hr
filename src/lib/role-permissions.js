import { query, queryOne } from './db';
import { effectivePermissions, ROLES } from './permissions';

export async function getRolePermissions(role) {
  const row = await queryOne('SELECT permissions FROM role_permissions WHERE role = $1', [role]);
  return effectivePermissions(role, row?.permissions);
}

export async function listRoles() {
  const { rows } = await query('SELECT role, label, permissions FROM role_permissions ORDER BY label');
  const byRole = new Map(rows.map(row => [row.role, row]));
  const builtins = ROLES.map(([role, label]) => ({
    role, label, permissions: effectivePermissions(role, byRole.get(role)?.permissions),
  }));
  return [...builtins, ...rows.filter(row => !ROLES.some(([key]) => key === row.role)).map(row => ({
    role: row.role, label: row.label, permissions: effectivePermissions(row.role, row.permissions),
  }))];
}

export async function roleExists(role) {
  if (ROLES.some(([key]) => key === role)) return true;
  return Boolean(await queryOne('SELECT 1 FROM role_permissions WHERE role = $1 AND label IS NOT NULL', [role]));
}

export async function getRoleLabel(role) {
  const builtin = ROLES.find(([key]) => key === role);
  if (builtin) return builtin[1];
  return (await queryOne('SELECT label FROM role_permissions WHERE role = $1', [role]))?.label || role;
}
