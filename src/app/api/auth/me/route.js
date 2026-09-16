import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, ctx, user) => {
  const emp = await queryOne(`
    SELECT e.*, d.name as department_name FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.id = $1`, [user.id]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });
  const { password_hash, ...safeEmp } = emp;
  return NextResponse.json(safeEmp);
});
