import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { MODULES, ORGANIZATION_SCOPES } from '@/lib/permissions';
import { listRoles, roleExists } from '@/lib/role-permissions';
import { randomUUID } from 'node:crypto';

export const GET = withAuth(async () => NextResponse.json(await listRoles()), { roles: ['admin'] });

export const POST = withAuth(async (req) => {
  const { label } = await req.json();
  const name = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: 'Tên bộ quyền phải có 2–60 ký tự' }, { status: 400 });
  const roles = await listRoles();
  if (roles.some((item) => item.label.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
    return NextResponse.json({ error: 'Tên bộ quyền đã tồn tại' }, { status: 409 });
  }
  const role = `custom_${randomUUID().replaceAll('-', '')}`;
  const permissions = Object.fromEntries(MODULES.map(([key]) => [key, { view: false, manage: false }]));
  permissions.organization.scope = 'none';
  try {
    await query('INSERT INTO role_permissions (role, label, permissions) VALUES ($1, $2, $3::jsonb)', [role, name, JSON.stringify(permissions)]);
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Tên bộ quyền đã tồn tại' }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ role, label: name, permissions }, { status: 201 });
}, { roles: ['admin'] });

export const PUT = withAuth(async (req) => {
  const { role, label, permissions } = await req.json();
  const keys = MODULES.map(([key]) => key);
  if (!await roleExists(role) || role === 'admin' || !permissions ||
      typeof permissions !== 'object' || Array.isArray(permissions) ||
      Object.keys(permissions).some((key) => !keys.includes(key)) ||
      keys.some((key) => !permissions[key] || typeof permissions[key].view !== 'boolean' ||
        typeof permissions[key].manage !== 'boolean' || (permissions[key].manage && !permissions[key].view)) ||
      !ORGANIZATION_SCOPES.includes(permissions.organization?.scope) ||
      permissions.organization.view !== (permissions.organization.scope !== 'none') ||
      permissions.organization.manage) {
    return NextResponse.json({ error: 'Bộ quyền không hợp lệ' }, { status: 400 });
  }
  const name = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : null;
  if (label !== undefined && (!name || name.length < 2 || name.length > 60)) {
    return NextResponse.json({ error: 'Tên bộ quyền không hợp lệ' }, { status: 400 });
  }
  if (name && (await listRoles()).some((item) => item.role !== role && item.label.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
    return NextResponse.json({ error: 'Tên bộ quyền đã tồn tại' }, { status: 409 });
  }
  try {
    await query(`INSERT INTO role_permissions (role, label, permissions) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (role) DO UPDATE SET label = COALESCE(EXCLUDED.label, role_permissions.label),
        permissions = EXCLUDED.permissions, updated_at = NOW()`,
      [role, name, JSON.stringify(permissions)]);
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Tên bộ quyền đã tồn tại' }, { status: 409 });
    throw error;
  }
  const updated = (await listRoles()).find((item) => item.role === role);
  return NextResponse.json(updated);
}, { roles: ['admin'] });

export const DELETE = withAuth(async (req) => {
  const { role } = await req.json();
  if (typeof role !== 'string' || role === 'admin' || !await roleExists(role)) {
    return NextResponse.json({ error: 'Không thể xóa bộ quyền này' }, { status: 400 });
  }
  const builtin = ['director', 'manager', 'employee'].includes(role);
  const sql = builtin
    ? `INSERT INTO role_permissions (role, is_deleted) SELECT $1, true
        WHERE NOT EXISTS (SELECT 1 FROM employees WHERE role = $1)
        ON CONFLICT (role) DO UPDATE SET is_deleted = true, label = NULL, updated_at = NOW()
        WHERE NOT EXISTS (SELECT 1 FROM employees WHERE role = $1)
        RETURNING role`
    : `DELETE FROM role_permissions WHERE role = $1 AND label IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM employees WHERE role = $1) RETURNING role`;
  const { rows } = await query(sql, [role]);
  if (!rows[0]) {
    const existing = await roleExists(role);
    return NextResponse.json({ error: existing ? 'Bộ quyền đang được gán cho nhân viên. Hãy đổi vai trò của họ trước khi xóa.' : 'Không tìm thấy bộ quyền' },
      { status: existing ? 409 : 404 });
  }
  return NextResponse.json({ success: true });
}, { roles: ['admin'] });
