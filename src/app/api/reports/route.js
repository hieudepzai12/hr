import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const employee_id = searchParams.get('employee_id');
  const status = searchParams.get('status');
  const type = searchParams.get('type');

  let sql = `SELECT ${pagination ? `r.id, r.title, LEFT(r.content, 240) AS excerpt, r.type, r.employee_id,
             r.status, r.feedback, r.period_start, r.period_end, r.created_at, r.reviewed_at, r.reviewed_by` : 'r.*'},
             e.full_name as employee_name, e.avatar_color, e.avatar_path,
             rv.full_name as reviewer_name
             FROM reports r
             JOIN employees e ON r.employee_id = e.id
             LEFT JOIN employees rv ON r.reviewed_by = rv.id
             WHERE 1=1`;
  const params = [];

  if (!user.permissions.reports.manage) {
    params.push(user.id);
    sql += ` AND r.employee_id = $${params.length}`;
  } else if (employee_id) {
    params.push(employee_id);
    sql += ` AND r.employee_id = $${params.length}`;
  }
  if (status) { params.push(status); sql += ` AND r.status = $${params.length}`; }
  if (type) { params.push(type); sql += ` AND r.type = $${params.length}`; }
  sql = appendPagination(sql + ' ORDER BY r.created_at DESC, r.id DESC', params, pagination);

  const { rows } = await query(sql, params);
  return NextResponse.json(pagedResult(rows, pagination));
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const { title, content, type, period_start, period_end } = body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 500 ||
      typeof content !== 'string' || !content.trim() || content.length > 100000 ||
      (type && !['daily', 'weekly', 'monthly', 'project'].includes(type))) {
    return NextResponse.json({ error: 'Thông tin báo cáo không hợp lệ' }, { status: 400 });
  }
  const { rows } = await query(
    `INSERT INTO reports (title, content, type, employee_id, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title, content, type || 'weekly', user.id, period_start || null, period_end || null]
  );
  return NextResponse.json(rows[0], { status: 201 });
});
