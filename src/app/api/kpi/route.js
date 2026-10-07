import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';

function computeRating(score) {
  if (score >= 9) return 'Xuất sắc';
  if (score >= 7.5) return 'Tốt';
  if (score >= 6) return 'Đạt';
  return 'Cần cải thiện';
}

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const employee_id = searchParams.get('employee_id');
  const period = searchParams.get('period');

  let sql = `SELECT k.*, e.full_name as employee_name, e.avatar_color, e.avatar_path,
             ev.full_name as evaluator_name
             FROM kpi_evaluations k
             JOIN employees e ON k.employee_id = e.id
             LEFT JOIN employees ev ON k.evaluated_by = ev.id
             WHERE 1=1`;
  const params = [];
  if (!user.permissions.kpi.manage) {
    params.push(user.id);
    sql += ` AND k.employee_id = $${params.length}`;
  } else if (employee_id) {
    params.push(employee_id);
    sql += ` AND k.employee_id = $${params.length}`;
  }
  if (period) { params.push(period); sql += ` AND k.period = $${params.length}`; }
  sql = appendPagination(sql + ' ORDER BY k.created_at DESC, k.id DESC', params, pagination);

  const { rows } = await query(sql, params);
  // criteria là cột JSONB — driver pg đã tự parse thành mảng JS, không cần JSON.parse thủ công.
  return NextResponse.json(pagedResult(rows, pagination));
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const { employee_id, period, criteria, comments } = body || {};
  if (!employee_id || !period || !Array.isArray(criteria) || criteria.length === 0) {
    return NextResponse.json({ error: 'Thiếu thông tin đánh giá' }, { status: 400 });
  }
  if (!Number.isSafeInteger(Number(employee_id)) || Number(employee_id) <= 0 || Number(employee_id) === user.id ||
      typeof period !== 'string' || period.length > 40 || criteria.length > 50 ||
      criteria.some(c => typeof c?.name !== 'string' || !c.name.trim() || c.name.length > 200 ||
        !Number.isFinite(Number(c.weight)) || Number(c.weight) <= 0 || Number(c.weight) > 100 ||
        !Number.isFinite(Number(c.score)) || Number(c.score) < 0 || Number(c.score) > 10)) {
    return NextResponse.json({ error: 'Thông tin đánh giá không hợp lệ' }, { status: 400 });
  }
  const target = await queryOne('SELECT role FROM employees WHERE id = $1 AND status = $2', [employee_id, 'active']);
  if (!target || (target.role === 'admin' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Không thể đánh giá nhân viên này' }, { status: 403 });
  }
  const totalWeight = criteria.reduce((s, c) => s + Number(c.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.001) {
    return NextResponse.json({ error: 'Tổng trọng số phải bằng 100%' }, { status: 400 });
  }
  const weightedScore = criteria.reduce((s, c) => s + (Number(c.score || 0) * Number(c.weight || 0)) / 100, 0);
  const totalScore = totalWeight > 0 ? Math.round((weightedScore * 100 / totalWeight) * 10) / 10 : 0;
  const rating = computeRating(totalScore);

  const { rows } = await query(
    `INSERT INTO kpi_evaluations (employee_id, period, criteria, total_score, rating, comments, evaluated_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING *`,
    [employee_id, period, JSON.stringify(criteria), totalScore, rating, comments || null, user.id]
  );
  return NextResponse.json(rows[0], { status: 201 });
}, { roles: ['admin', 'director', 'manager'] });
