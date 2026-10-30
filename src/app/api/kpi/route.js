import { NextResponse } from 'next/server';
import { query, queryOne, transaction } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';
import { canViewTask } from '@/lib/task-access';
import { canReport } from '@/lib/report-service';

const RATINGS = ['Không hoàn thành', 'Hoàn thành', 'Hoàn thành tốt'];
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

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const { employee_id, period, rating, comments } = body || {};
  const taskIds = body?.task_ids || [];
  const reportIds = body?.report_ids || [];
  if (!employee_id || !period || !rating) {
    return NextResponse.json({ error: 'Thiếu thông tin đánh giá' }, { status: 400 });
  }
  if (!Number.isSafeInteger(Number(employee_id)) || Number(employee_id) <= 0 || Number(employee_id) === user.id ||
      typeof period !== 'string' || !period.trim() || period.length > 40 || !RATINGS.includes(rating) ||
      (comments != null && (typeof comments !== 'string' || comments.length > 10000)) ||
      !Array.isArray(taskIds) || !Array.isArray(reportIds) || taskIds.length > 50 || reportIds.length > 50 ||
      [...taskIds, ...reportIds].some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return NextResponse.json({ error: 'Thông tin đánh giá không hợp lệ' }, { status: 400 });
  }
  const target = await queryOne('SELECT role FROM employees WHERE id = $1 AND status = $2', [employee_id, 'active']);
  if (!target || (target.role === 'admin' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Không thể đánh giá nhân viên này' }, { status: 403 });
  }
  const evidence = [];
  for (const id of new Set(taskIds.map(Number))) {
    const task = await queryOne(`SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL AND
      (assignee_id=$2 OR EXISTS (SELECT 1 FROM task_collaborators WHERE task_id=$1 AND employee_id=$2))`, [id, employee_id]);
    if (!task || !await canViewTask(task, user)) return NextResponse.json({ error: 'Công việc căn cứ không hợp lệ hoặc không có quyền xem' }, { status: 403 });
    evidence.push({ taskId: id, reportId: null, snapshot: {
      title: task.title, status: task.status, due_date: task.due_date,
      completed_at: task.completed_at, accepted_at: task.accepted_at,
      accepted_by: task.accepted_by, progress: task.progress,
    } });
  }
  for (const id of new Set(reportIds.map(Number))) {
    const report = await queryOne(`SELECT r.*, COALESCE(r.department_id,e.department_id) AS effective_department_id
      FROM reports r JOIN employees e ON e.id=r.employee_id WHERE r.id=$1 AND r.employee_id=$2 AND r.deleted_at IS NULL`, [id, employee_id]);
    if (!report || !canReport(user, 'view', report)) return NextResponse.json({ error: 'Báo cáo căn cứ không hợp lệ hoặc không có quyền xem' }, { status: 403 });
    evidence.push({ taskId: null, reportId: id, snapshot: {
      title: report.title, status: report.status, period_start: report.period_start,
      period_end: report.period_end, version: report.version, submitted_at: report.submitted_at,
    } });
  }
  const created = await transaction(async (client) => {
    // Retain required legacy columns for schema compatibility; they no longer represent an assessment score.
    const { rows } = await client.query(`INSERT INTO kpi_evaluations
      (employee_id, period, criteria, total_score, rating, comments, evaluated_by)
      VALUES ($1,$2,'[]'::jsonb,0,$3,$4,$5)
      RETURNING id, employee_id, period, rating, comments, evaluated_by, created_at`,
    [employee_id, period.trim(), rating, comments || null, user.id]);
    for (const item of evidence) await client.query(`INSERT INTO kpi_evidence
      (evaluation_id,task_id,report_id,snapshot) VALUES ($1,$2,$3,$4::jsonb)`,
    [rows[0].id, item.taskId, item.reportId, JSON.stringify(item.snapshot)]);
    return rows[0];
  });
  return NextResponse.json({ ...created, evidence }, { status: 201 });
}, { roles: ['admin', 'director', 'manager'] });
