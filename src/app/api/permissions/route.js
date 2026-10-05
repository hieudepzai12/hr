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
      (role === 'employee' && keys.some((key) => permissions[key].manage)) ||
      !ORGANIZATION_SCOPES.includes(permissions.organization?.scope) ||
      permissions.organization.view !== (permissions.organization.scope !== 'none') ||
      permissions.organization.manage) {
    return NextResponse.json({ error: 'Bộ quyền không hợp lệ' }, { status: 400 });
  }
  const custom = role.startsWith('custom_');
  const name = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : null;
  if (label !== undefined && (!custom || !name || name.length < 2 || name.length > 60)) {
    return NextResponse.json({ error: 'Tên bộ quyền không hợp lệ' }, { status: 400 });
  }
  try {
    if (custom) {
      await query('UPDATE role_permissions SET label = COALESCE($2, label), permissions = $3::jsonb, updated_at = NOW() WHERE role = $1',
        [role, name, JSON.stringify(permissions)]);
    } else {
      await query(`INSERT INTO role_permissions (role, permissions) VALUES ($1, $2::jsonb)
        ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
      [role, JSON.stringify(permissions)]);
    }
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Tên bộ quyền đã tồn tại' }, { status: 409 });
    throw error;
  }
  const updated = (await listRoles()).find((item) => item.role === role);
  return NextResponse.json(updated);
}, { roles: ['admin'] });

export const DELETE = withAuth(async (req) => {
  const { role } = await req.json();
  if (typeof role !== 'string' || !role.startsWith('custom_')) {
    return NextResponse.json({ error: 'Chỉ có thể xóa bộ quyền tự tạo' }, { status: 400 });
  }
  const { rows } = await query(`DELETE FROM role_permissions
    WHERE role = $1 AND label IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM employees WHERE role = $1)
    RETURNING role`, [role]);
  if (!rows[0]) {
    const existing = await roleExists(role);
    return NextResponse.json({ error: existing ? 'Bộ quyền đang được gán cho nhân viên. Hãy đổi vai trò của họ trước khi xóa.' : 'Không tìm thấy bộ quyền' },
      { status: existing ? 409 : 404 });
  }
  return NextResponse.json({ success: true });
}, { roles: ['admin'] });
