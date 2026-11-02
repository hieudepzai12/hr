import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';
import { saveKpi } from '@/lib/kpi-service';

const LEGACY_RATINGS = { 'Xuất sắc': 'Hoàn thành tốt', 'Tốt': 'Hoàn thành tốt', 'Đạt': 'Hoàn thành', 'Cần cải thiện': 'Không hoàn thành' };

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const employee_id = searchParams.get('employee_id');
  const period = searchParams.get('period');

  let sql = `SELECT k.id, k.employee_id, k.period, k.rating, k.comments, k.evaluated_by, k.created_at,
             e.full_name as employee_name, e.avatar_color, e.avatar_path,
             ev.full_name as evaluator_name,
             COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id',ke.task_id,'report_id',ke.report_id,
               'snapshot',ke.snapshot) ORDER BY ke.id) FROM kpi_evidence ke WHERE ke.evaluation_id=k.id), '[]'::jsonb) AS evidence
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
  return NextResponse.json(pagedResult(rows.map(row=>({...row,rating:LEGACY_RATINGS[row.rating]||row.rating})), pagination));
});

export const POST = withAuth((req, ctx, user) => saveKpi(req, user), { roles: ['admin', 'director', 'manager'] });
