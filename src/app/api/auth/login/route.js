import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, ensureSchema } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req) {
  await ensureSchema();
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu' }, { status: 400 });
  }

  const emp = await queryOne('SELECT * FROM employees WHERE email = $1', [email]);
  if (!emp) return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });

  const valid = bcrypt.compareSync(password, emp.password_hash);
  if (!valid) return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });

  if (emp.status !== 'active') {
    return NextResponse.json({ error: 'Tài khoản đã bị vô hiệu hoá' }, { status: 403 });
  }

  const token = signToken({ id: emp.id, email: emp.email, role: emp.role, full_name: emp.full_name });
  const { password_hash, ...safeEmp } = emp;

  return NextResponse.json({ token, user: safeEmp });
}
