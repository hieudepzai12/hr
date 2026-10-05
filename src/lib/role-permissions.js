import { query, queryOne } from './db';
import { effectivePermissions, ROLES } from './permissions';

export async function getRolePermissions(role) {
  const row = await queryOne('SELECT permissions FROM role_permissions WHERE role = $1', [role]);
  return effectivePermissions(role, row?.permissions);
}

export async function listRoles() {
  const { rows } = await query("SELECT role, label, permissions FROM role_permissions WHERE label IS NOT NULL ORDER BY label");
  const builtins = await Promise.all(ROLES.map(async ([role, label]) => ({
    role, label, permissions: await getRolePermissions(role),
  })));
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
