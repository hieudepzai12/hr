import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { ensureSchema, queryOne } from './db';
import { permissionForRequest } from './permissions';
import { effectivePermissions } from './permissions';

export function assertAuthConfigured() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    const error = new Error('JWT_SECRET must be set to at least 32 bytes in this deployment');
    error.code = 'AUTH_CONFIG';
    throw error;
  }
  return secret;
}

export function signToken(payload) {
  return jwt.sign(payload, assertAuthConfigured(), { expiresIn: '1d' });
}

/**
 * Đọc và xác thực JWT từ header Authorization của request.
 * Trả về payload nếu hợp lệ, hoặc null nếu không có / không hợp lệ.
 */
export function getUserFromRequest(req) {
  const token = req.cookies.get('hr_session')?.value;
  if (!token) return null;
  const secret = assertAuthConfigured();
  try {
    return jwt.verify(token, secret);
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

export function isTrustedOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const requestOrigin = new URL(req.url).origin;
  if (origin === requestOrigin) return true;

  const configuredOrigins = [
    process.env.BETTER_AUTH_URL,
    process.env.V0_RUNTIME_URL,
    process.env.V0_DEV_APP_URL,
    process.env.V0_BUILD_URL,
    process.env.V0_SANDBOX_URL,
  ].filter(Boolean).map((value) => {
    try { return new URL(value.includes('://') ? value : `https://${value}`).origin; } catch { return null; }
  }).filter(Boolean);

  const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((value) => `https://${value.replace(/^https?:\/\//, '')}`);

  return [...configuredOrigins, ...vercelOrigins].includes(origin);
}

/**
 * Bọc một route handler, yêu cầu người dùng đã đăng nhập.
 * handler nhận (req, ctx, user)
 */
export function withAuth(handler, { roles } = {}) {
  return async (req, ctx) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!isTrustedOrigin(req)) return forbidden();
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
    const grantedManager = roles?.includes('manager') && required?.[1] === 'manage' &&
      user.permissions[required[0]]?.manage;
    if (roles && !roles.includes(user.role) && !grantedManager) return forbidden();
    const canListAssignees = pathname === '/api/employees' && req.method === 'GET' &&
      new URL(req.url).searchParams.get('fields') === 'options' &&
      (user.permissions.tasks.manage || user.permissions.kpi.manage);
    if (required && !user.permissions[required[0]]?.[required[1]] && !canListAssignees) return forbidden();
    return handler(req, ctx, user);
  };
}
