import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const targetId = Number(id);
  const { new_password } = await req.json();
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: 'Tài khoản không hợp lệ' }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: 'Hãy dùng chức năng đổi mật khẩu của chính bạn' }, { status: 403 });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return NextResponse.json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' }, { status: 400 });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  const { rowCount } = await query('UPDATE employees SET password_hash = $1 WHERE id = $2', [hash, targetId]);
  if (!rowCount) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  return NextResponse.json({ success: true });
}, { roles: ['admin'] });
