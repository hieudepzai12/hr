import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { roleExists } from '@/lib/role-permissions';
import { validateManagerAssignment } from '@/lib/organization';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';

const COLORS = ['#2C5F5D', '#C97B4A', '#5B5F97', '#8A9B6E', '#B85C5C', '#4A7B8C'];

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const department_id = searchParams.get('department_id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const fields = searchParams.get('fields');
  if (fields && fields !== 'options') return NextResponse.json({ error: 'Trường dữ liệu không hợp lệ' }, { status: 400 });
  const isManager = Boolean(user.permissions.employees.manage);
  const canListAssignees = fields === 'options' && (user.permissions.tasks.manage || user.permissions.kpi.manage);

  let sql = fields === 'options' ? `SELECT e.id, e.full_name, e.role, e.position
             FROM employees e WHERE 1=1` : `SELECT e.id, e.full_name, e.email, e.role, e.position, e.department_id, e.manager_id,
             e.phone, e.join_date, e.status, e.avatar_color, e.avatar_path, d.name as department_name
             FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE 1=1`;
  const params = [];

  if (!isManager && !canListAssignees) {
    // Nhân viên thường: chỉ xem được đồng nghiệp cùng phòng ban của mình, bỏ qua mọi filter khác từ client.
    const myDeptId = user.department_id ?? -1;
    params.push(myDeptId, user.id);
    sql += ` AND (e.department_id = $${params.length - 1} OR e.id = $${params.length})`;
  } else {
    if (department_id) { params.push(department_id); sql += ` AND e.department_id = $${params.length}`; }
  }
  if (status) { params.push(status); sql += ` AND e.status = $${params.length}`; }
  if (search) { params.push(`%${search}%`); sql += ` AND (e.full_name ILIKE $${params.length} OR e.email ILIKE $${params.length})`; }
  sql = appendPagination(sql + ' ORDER BY e.full_name, e.id', params, pagination);

  const { rows } = await query(sql, params);
  return NextResponse.json(pagedResult(rows, pagination));
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const { full_name, email, password, role, position, department_id, manager_id, phone, join_date } = body || {};
  if (!await roleExists(role || 'employee') || (user.role !== 'admin' && role && role !== 'employee')) {
    return NextResponse.json({ error: 'Vai trò không hợp lệ' }, { status: 403 });
  }
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.length > 300 ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
      typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    return NextResponse.json({ error: 'Thông tin nhân viên không hợp lệ' }, { status: 400 });
  }
  if ((role || 'employee') === 'admin' && manager_id) {
    return NextResponse.json({ error: 'Tài khoản hệ thống không thuộc sơ đồ tổ chức' }, { status: 400 });
  }
  const managerError = await validateManagerAssignment(null, manager_id);
  if (managerError) return NextResponse.json({ error: managerError }, { status: 400 });
  try {
    const hash = await bcrypt.hash(password, 10);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const { rows } = await query(
      `INSERT INTO employees (full_name, email, password_hash, role, position, department_id, manager_id, phone, join_date, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [full_name.trim(), email.trim().toLowerCase(), hash, role || 'employee', position || null, department_id || null, manager_id || null, phone || null, join_date || null, color]
    );
    const { password_hash, token_version, ...emp } = rows[0];
    return NextResponse.json(emp, { status: 201 });
  } catch (e) {
    if (e.code === '23505') return NextResponse.json({ error: 'Email đã được sử dụng' }, { status: 400 });
    throw e;
  }
}, { roles: ['admin', 'director', 'manager'] });
