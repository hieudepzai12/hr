import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

function computeRating(score) {
  if (score >= 9) return 'Xuất sắc';
  if (score >= 7.5) return 'Tốt';
  if (score >= 6) return 'Đạt';
  return 'Cần cải thiện';
}

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const employee_id = searchParams.get('employee_id');
  const period = searchParams.get('period');

  let sql = `SELECT k.*, e.full_name as employee_name, e.avatar_color, e.avatar_path,
             ev.full_name as evaluator_name
             FROM kpi_evaluations k
             JOIN employees e ON k.employee_id = e.id
             LEFT JOIN employees ev ON k.evaluated_by = ev.id
             WHERE 1=1`;
  const params = [];
  if (user.role === 'employee') {
    params.push(user.id);
    sql += ` AND k.employee_id = $${params.length}`;
  } else if (employee_id) {
    params.push(employee_id);
    sql += ` AND k.employee_id = $${params.length}`;
  }
  if (period) { params.push(period); sql += ` AND k.period = $${params.length}`; }
  sql += ' ORDER BY k.created_at DESC';

  const { rows } = await query(sql, params);
  // criteria là cột JSONB — driver pg đã tự parse thành mảng JS, không cần JSON.parse thủ công.
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, ctx, user) => {
  const { employee_id, period, criteria, comments } = await req.json();
  if (!employee_id || !period || !Array.isArray(criteria) || criteria.length === 0) {
    return NextResponse.json({ error: 'Thiếu thông tin đánh giá' }, { status: 400 });
  }
  const totalWeight = criteria.reduce((s, c) => s + Number(c.weight || 0), 0);
  const weightedScore = criteria.reduce((s, c) => s + (Number(c.score || 0) * Number(c.weight || 0)) / 100, 0);
  const totalScore = totalWeight > 0 ? Math.round((weightedScore * 100 / totalWeight) * 10) / 10 : 0;
  const rating = computeRating(totalScore);

  const { rows } = await query(
    `INSERT INTO kpi_evaluations (employee_id, period, criteria, total_score, rating, comments, evaluated_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING *`,
    [employee_id, period, JSON.stringify(criteria), totalScore, rating, comments || null, user.id]
  );
  return NextResponse.json(rows[0], { status: 201 });
}, { roles: ['admin', 'manager'] });
