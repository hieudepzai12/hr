import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req, ctx, user) => {
  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password) {
    return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
  }
  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [user.id]);
  if (!bcrypt.compareSync(current_password, emp.password_hash)) {
    return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 401 });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  await query('UPDATE employees SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  return NextResponse.json({ success: true });
});
