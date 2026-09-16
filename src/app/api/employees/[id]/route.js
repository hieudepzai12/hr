import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const emp = await queryOne(`
    SELECT e.id, e.full_name, e.email, e.role, e.position, e.department_id,
           e.phone, e.join_date, e.status, e.avatar_color, e.avatar_path, d.name as department_name
    FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = $1`, [id]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  return NextResponse.json(emp);
});

export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { full_name, position, department_id, phone, role, status, join_date } = await req.json();
  const { rows } = await query(
    `UPDATE employees SET full_name = $1, position = $2, department_id = $3,
     phone = $4, role = $5, status = $6, join_date = $7 WHERE id = $8 RETURNING *`,
    [full_name, position || null, department_id || null, phone || null, role, status, join_date || null, id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  const { password_hash, ...emp } = rows[0];
  return NextResponse.json(emp);
}, { roles: ['admin', 'manager'] });

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  await query(`UPDATE employees SET status = 'inactive' WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin'] });
