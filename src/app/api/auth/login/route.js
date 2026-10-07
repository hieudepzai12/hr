import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, queryOne, ensureSchema } from '@/lib/db';
import { signToken, isTrustedOrigin, assertAuthConfigured } from '@/lib/auth';
import { getRolePermissions, getRoleLabel } from '@/lib/role-permissions';

const DUMMY_HASH = '$2b$10$PTK.4EqqTxRJ6GZObMpBKOb83AUs9xhUizQjXjQsCCZ3u.dSxgJte';
const limitKey = (kind, value) => `${kind}:${crypto.createHash('sha256').update(value).digest('hex')}`;

async function isLimited(key, max) {
  const row = await queryOne("SELECT failures FROM login_attempts WHERE key = $1 AND window_started_at > NOW() - INTERVAL '15 minutes'", [key]);
  return (row?.failures || 0) >= max;
}

async function recordFailure(key) {
  await query(`INSERT INTO login_attempts (key, failures) VALUES ($1, 1)
    ON CONFLICT (key) DO UPDATE SET
      failures = CASE WHEN login_attempts.window_started_at > NOW() - INTERVAL '15 minutes'
        THEN login_attempts.failures + 1 ELSE 1 END,
      window_started_at = CASE WHEN login_attempts.window_started_at > NOW() - INTERVAL '15 minutes'
        THEN login_attempts.window_started_at ELSE NOW() END`, [key]);
}

export async function POST(req) {
  try {
    return await login(req);
  } catch (error) {
    const safeMessage = String(error.message || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[database URL hidden]');
    console.error('Login infrastructure error', { code: error.code, message: safeMessage });
    const message = error.code === 'AUTH_CONFIG'
      ? 'Hệ thống đăng nhập chưa được cấu hình. Vui lòng liên hệ quản trị.'
      : error.code === 'ADMIN_SETUP'
        ? 'Tài khoản quản trị cần đổi mật khẩu dùng thử trước khi đăng nhập.'
        : 'Không thể kết nối cơ sở dữ liệu. Vui lòng liên hệ quản trị.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

async function login(req) {
  if (!isTrustedOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  assertAuthConfigured();
  await ensureSchema();
  const body = await req.json().catch(() => null);
  const { email, password } = body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 320 || password.length > 1024) {
    return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu hợp lệ' }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipKey = limitKey('ip', ip);
  const emailKey = limitKey('email', normalizedEmail);
  if (await isLimited(ipKey, 20) || await isLimited(emailKey, 5)) {
    return NextResponse.json({ error: 'Thử lại sau 15 phút' }, { status: 429, headers: { 'Retry-After': '900' } });
  }
  const emp = await queryOne('SELECT id, email, full_name, role, status, token_version, password_hash FROM employees WHERE email = $1', [normalizedEmail]);
  const valid = await bcrypt.compare(password, emp?.password_hash || DUMMY_HASH);
  if (!emp || !valid) {
    await Promise.all([recordFailure(ipKey), recordFailure(emailKey)]);
    return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }
  await query('DELETE FROM login_attempts WHERE key = $1', [emailKey]);
  if (emp.status !== 'active') return NextResponse.json({ error: 'Tài khoản đã bị vô hiệu hoá' }, { status: 403 });
  const token = signToken({ id: emp.id, ver: emp.token_version });
  const { password_hash, token_version, ...safeEmp } = emp;
  const response = NextResponse.json({ user: { ...safeEmp, role_label: await getRoleLabel(emp.role), permissions: await getRolePermissions(emp.role) } });
  response.cookies.set('hr_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 });
  return response;
}
