import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { ensureSchema, queryOne } from './db';
import { permissionForRequest } from './permissions';
import { effectivePermissions } from './permissions';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must be at least 32 bytes');
  return secret;
}

export function signToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: '1d' });
}

/**
 * Đọc và xác thực JWT từ header Authorization của request.
 * Trả về payload nếu hợp lệ, hoặc null nếu không có / không hợp lệ.
 */
export function getUserFromRequest(req) {
  const token = req.cookies.get('hr_session')?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
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
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) return forbidden();
    }
    await ensureSchema();
    const tokenUser = getUserFromRequest(req);
    if (!tokenUser) return unauthorized();
    const pathname = new URL(req.url).pathname;
    const idSegments = pathname.match(/^\/api\/(?:employees|tasks|reports|kpi|departments)\/([^/]+)(?:\/attachments\/([^/]+))?/);
    if (idSegments && [idSegments[1], idSegments[2]].filter(Boolean).some(value =>
      !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647)) {
      return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    }
    const user = await queryOne(`SELECT e.id, e.email, e.full_name, e.role, e.status, e.department_id,
      e.token_version, rp.permissions AS role_permissions
      FROM employees e LEFT JOIN role_permissions rp ON rp.role = e.role WHERE e.id = $1`, [tokenUser.id]);
    if (!user || user.status !== 'active') return unauthorized();
    if (tokenUser.ver !== user.token_version) return unauthorized();
    user.permissions = effectivePermissions(user.role, user.role_permissions);
    const required = permissionForRequest(pathname, req.method);
    const customManager = user.role.startsWith('custom_') && roles?.includes('manager') &&
      required?.[1] === 'manage' && user.permissions[required[0]]?.manage;
    if (roles && !roles.includes(user.role) && !customManager) return forbidden();
    if (required && !user.permissions[required[0]]?.[required[1]]) return forbidden();
    return handler(req, ctx, user);
  };
}
