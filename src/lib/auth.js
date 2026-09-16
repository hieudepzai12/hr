import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { ensureSchema } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Đọc và xác thực JWT từ header Authorization của request.
 * Trả về payload nếu hợp lệ, hoặc null nếu không có / không hợp lệ.
 */
export function getUserFromRequest(req) {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function unauthorized(message = 'Thiếu token xác thực hoặc token không hợp lệ') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Bọc một route handler, yêu cầu người dùng đã đăng nhập.
 * handler nhận (req, ctx, user)
 */
export function withAuth(handler, { roles } = {}) {
  return async (req, ctx) => {
    await ensureSchema();
    const user = getUserFromRequest(req);
    if (!user) return unauthorized();
    if (roles && !roles.includes(user.role)) return forbidden();
    return handler(req, ctx, user);
  };
}
