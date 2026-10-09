import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { roleExists } from '@/lib/role-permissions';
import { validateManagerAssignment } from '@/lib/organization';

export const GET = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const emp = await queryOne(`
    SELECT e.id, e.full_name, e.email, e.role, e.position, e.department_id, e.manager_id,
           e.phone, e.join_date, e.status, e.avatar_color, e.avatar_path, d.name as department_name
    FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = $1`, [id]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  if (!user.permissions.employees.manage && emp.id !== user.id &&
      (user.department_id == null || emp.department_id !== user.department_id)) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }
  return NextResponse.json(emp);
});

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const { full_name, position, department_id, manager_id, phone, role, status, join_date } = body || {};
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.length > 300 ||
      !['active', 'inactive'].includes(status)) {
    return NextResponse.json({ error: 'Thông tin nhân viên không hợp lệ' }, { status: 400 });
  }
  const existing = await queryOne('SELECT role FROM employees WHERE id = $1', [id]);
  if (existing?.role === 'admin' && (role !== 'admin' || status !== 'active')) {
    return NextResponse.json({ error: 'Tài khoản admin không thể bị xóa hoặc vô hiệu hóa' }, { status: 403 });
  }
  if (user.role !== 'admin' && role !== existing?.role) {
    return NextResponse.json({ error: 'Chỉ admin được thay đổi vai trò' }, { status: 403 });
  }
  if (['admin', 'director'].includes(existing?.role) && user.role !== 'admin') {
    return NextResponse.json({ error: 'Chỉ admin được thay đổi tài khoản admin' }, { status: 403 });
  }
  if (!await roleExists(role)) return NextResponse.json({ error: 'Vai trò không hợp lệ' }, { status: 400 });
  if (role === 'admin' && manager_id) {
    return NextResponse.json({ error: 'Tài khoản hệ thống không thuộc sơ đồ tổ chức' }, { status: 400 });
  }
  const managerError = await validateManagerAssignment(id, manager_id);
  if (managerError) return NextResponse.json({ error: managerError }, { status: 400 });
  const { rows } = await query(
    `UPDATE employees SET full_name = $1, position = $2, department_id = $3, manager_id = $4,
     phone = $5, role = $6, status = $7, join_date = $8 WHERE id = $9 RETURNING *`,
    [full_name, position || null, department_id || null, manager_id || null, phone || null, role, status, join_date || null, id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  const { password_hash, token_version, ...emp } = rows[0];
  return NextResponse.json(emp);
}, { roles: ['admin', 'director', 'manager'] });

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { rowCount } = await query(`UPDATE employees SET status = 'inactive' WHERE id = $1 AND role <> 'admin'`, [id]);
  if (!rowCount) return NextResponse.json({ error: 'Không thể xóa tài khoản admin hoặc tài khoản không tồn tại' }, { status: 403 });
  return NextResponse.json({ success: true });
}, { roles: ['admin', 'director', 'manager'] });
