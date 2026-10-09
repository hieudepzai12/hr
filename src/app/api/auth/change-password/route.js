import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req, ctx, user) => {
  const { current_password, new_password } = await req.json();
  if (!new_password || (user.role !== 'admin' && !current_password)) {
    return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return NextResponse.json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' }, { status: 400 });
  }
  if (user.role !== 'admin') {
    const emp = await queryOne('SELECT password_hash FROM employees WHERE id = $1', [user.id]);
    if (typeof current_password !== 'string' || !await bcrypt.compare(current_password, emp.password_hash)) {
      return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 400 });
    }
  }
  const newHash = await bcrypt.hash(new_password, 10);
  await query('UPDATE employees SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [newHash, user.id]);
  return NextResponse.json({ success: true });
});
