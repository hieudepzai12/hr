import { NextResponse } from 'next/server';
import { transaction } from './db';
import { canViewTask } from './task-access';
import { canReport } from './report-service';
import { canAccessKpiEmployee } from './access';

const RATINGS = ['Không hoàn thành', 'Hoàn thành', 'Hoàn thành tốt'];
const publicFields = 'id, employee_id, period, rating, comments, evaluated_by, created_at';
const invalid = (error, status = 400) => NextResponse.json({ error }, { status });

export async function saveKpi(req, user, evaluationId) {
  const body = await req.json().catch(() => null);
  const { employee_id, period, rating, comments } = body || {};
  const taskIds = body?.task_ids ?? [];
  const reportIds = body?.report_ids;
  if (!employee_id || !period || !rating) return invalid('Thiếu thông tin đánh giá');
  if (!Number.isSafeInteger(Number(employee_id)) || Number(employee_id) <= 0 || Number(employee_id) === Number(user.id) ||
      typeof period !== 'string' || !period.trim() || period.length > 40 || !RATINGS.includes(rating) ||
      (comments != null && (typeof comments !== 'string' || comments.length > 10000)) ||
      !Array.isArray(taskIds) || taskIds.length > 50 ||
      (reportIds !== undefined && (!Array.isArray(reportIds) || reportIds.length > 50)) ||
      [...taskIds, ...(reportIds || [])].some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return invalid('Thông tin đánh giá không hợp lệ');
  }
  return transaction(async client => {
    let existing;
    let previousEvidence = [];
    if (evaluationId !== undefined) {
      existing = (await client.query('SELECT * FROM kpi_evaluations WHERE id=$1 FOR UPDATE', [evaluationId])).rows[0];
      if (!existing) return invalid('Không tìm thấy đánh giá KPI', 404);
      if (Number(existing.employee_id) !== Number(employee_id)) return invalid('Không thể đổi nhân viên của đánh giá đã lưu');
      previousEvidence = (await client.query('SELECT * FROM kpi_evidence WHERE evaluation_id=$1 ORDER BY id', [evaluationId])).rows;
    }
    const target = (await client.query('SELECT id,role,status,department_id FROM employees WHERE id=$1', [employee_id])).rows[0];
    if (!target || (!existing && target.status !== 'active') || !canAccessKpiEmployee(user,target)) {
      return invalid('Không thể đánh giá nhân viên này', 403);
    }
    const evidence = [];
    for (const id of new Set(taskIds.map(Number))) {
      const previous = previousEvidence.find(item => Number(item.task_id) === id);
      if (previous) {
        evidence.push({ taskId: id, reportId: null, snapshot: previous.snapshot });
        continue;
      }
      const task = (await client.query(`SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL AND
        (assignee_id=$2 OR EXISTS (SELECT 1 FROM task_collaborators WHERE task_id=$1 AND employee_id=$2))`, [id, employee_id])).rows[0];
      if (!task || !await canViewTask(task, user, client)) return invalid('Công việc căn cứ không hợp lệ hoặc không có quyền xem', 403);
      evidence.push({ taskId: id, reportId: null, snapshot: {
        title: task.title, status: task.status, due_date: task.due_date,
        completed_at: task.completed_at, accepted_at: task.accepted_at,
        accepted_by: task.accepted_by, progress: task.progress,
      } });
    }
    // Existing report references are historical evidence; the current form does not edit them.
    const selectedReports = reportIds ?? previousEvidence.filter(item => item.report_id).map(item => item.report_id);
    for (const id of new Set(selectedReports.map(Number))) {
      const previous = previousEvidence.find(item => Number(item.report_id) === id);
      if (previous) {
        evidence.push({ taskId: null, reportId: id, snapshot: previous.snapshot });
        continue;
      }
      const report = (await client.query(`SELECT r.*, COALESCE(r.department_id,e.department_id) AS effective_department_id
        FROM reports r JOIN employees e ON e.id=r.employee_id WHERE r.id=$1 AND r.employee_id=$2 AND r.deleted_at IS NULL`, [id, employee_id])).rows[0];
      if (!report || !canReport(user, 'view', report)) return invalid('Báo cáo căn cứ không hợp lệ hoặc không có quyền xem', 403);
      evidence.push({ taskId: null, reportId: id, snapshot: {
        title: report.title, status: report.status, period_start: report.period_start,
        period_end: report.period_end, version: report.version, submitted_at: report.submitted_at,
      } });
    }
    let saved;
    if (existing) {
      saved = (await client.query(`UPDATE kpi_evaluations SET period=$1,rating=$2,comments=$3
        WHERE id=$4 RETURNING ${publicFields}`, [period.trim(), rating, comments || null, evaluationId])).rows[0];
      await client.query('DELETE FROM kpi_evidence WHERE evaluation_id=$1', [evaluationId]);
    } else {
      // Required legacy columns remain for compatibility; assessments no longer use scores.
      saved = (await client.query(`INSERT INTO kpi_evaluations
        (employee_id,period,criteria,total_score,rating,comments,evaluated_by)
        VALUES($1,$2,'[]'::jsonb,0,$3,$4,$5) RETURNING ${publicFields}`,
      [employee_id, period.trim(), rating, comments || null, user.id])).rows[0];
    }
    for (const item of evidence) await client.query(`INSERT INTO kpi_evidence
      (evaluation_id,task_id,report_id,snapshot) VALUES($1,$2,$3,$4::jsonb)`,
    [saved.id, item.taskId, item.reportId, JSON.stringify(item.snapshot)]);
    return NextResponse.json({ ...saved, evidence }, { status: existing ? 200 : 201 });
  });
}
