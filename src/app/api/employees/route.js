import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

const COLORS = ['#2C5F5D', '#C97B4A', '#5B5F97', '#8A9B6E', '#B85C5C', '#4A7B8C'];

export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const department_id = searchParams.get('department_id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let sql = `SELECT e.id, e.full_name, e.email, e.role, e.position, e.department_id,
             e.phone, e.join_date, e.status, e.avatar_color, e.avatar_path, d.name as department_name
             FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE 1=1`;
  const params = [];
  if (department_id) { params.push(department_id); sql += ` AND e.department_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND e.status = $${params.length}`; }
  if (search) { params.push(`%${search}%`); sql += ` AND (e.full_name ILIKE $${params.length} OR e.email ILIKE $${params.length})`; }
  sql += ' ORDER BY e.full_name';

  const { rows } = await query(sql, params);
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req) => {
  const { full_name, email, password, role, position, department_id, phone, join_date } = await req.json();
  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const { rows } = await query(
      `INSERT INTO employees (full_name, email, password_hash, role, position, department_id, phone, join_date, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [full_name, email, hash, role || 'employee', position || null, department_id || null, phone || null, join_date || null, color]
    );
    const { password_hash, ...emp } = rows[0];
    return NextResponse.json(emp, { status: 201 });
  } catch (e) {
    if (e.code === '23505') return NextResponse.json({ error: 'Email đã được sử dụng' }, { status: 400 });
    throw e;
  }
}, { roles: ['admin', 'manager'] });
