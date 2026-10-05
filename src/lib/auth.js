import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { ensureSchema, queryOne } from './db';
import { permissionForRequest } from './permissions';
import { getRolePermissions } from './role-permissions';

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
    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) return unauthorized();
    const user = await queryOne('SELECT id, email, full_name, role, status, permissions FROM employees WHERE id = $1', [tokenUser.id]);
    if (!user || user.status !== 'active') return unauthorized();
    user.permissions = await getRolePermissions(user.role);
    const required = permissionForRequest(new URL(req.url).pathname, req.method);
    const customManager = user.role.startsWith('custom_') && roles?.includes('manager') &&
      required?.[1] === 'manage' && user.permissions[required[0]]?.manage;
    if (roles && !roles.includes(user.role) && !customManager) return forbidden();
    if (required && !user.permissions[required[0]]?.[required[1]]) return forbidden();
    return handler(req, ctx, user);
  };
}
