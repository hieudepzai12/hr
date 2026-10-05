import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, ctx, user) => {
  const isManager = ['admin', 'director', 'manager'].includes(user.role) || user.permissions.departments.manage;
  if (isManager) {
    const { rows } = await query(`
      SELECT d.*, COUNT(e.id) FILTER (WHERE e.status = 'active') AS employee_count
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.id ORDER BY d.name`);
    return NextResponse.json(rows);
  }

  // Nhân viên thường: chỉ thấy phòng ban của chính mình.
  const { rows } = await query(`
    SELECT d.*, COUNT(e.id) FILTER (WHERE e.status = 'active') AS employee_count
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id
    WHERE d.id = (SELECT department_id FROM employees WHERE id = $1)
    GROUP BY d.id ORDER BY d.name`, [user.id]);
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req) => {
  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: 'Tên phòng ban là bắt buộc' }, { status: 400 });
  try {
    const { rows } = await query(
      'INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (e) {
    if (e.code === '23505') return NextResponse.json({ error: 'Tên phòng ban đã tồn tại' }, { status: 400 });
    throw e;
  }
}, { roles: ['admin', 'director', 'manager'] });
