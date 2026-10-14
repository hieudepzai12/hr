import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canViewTask } from '@/lib/task-access';
import { canReport } from '@/lib/report-service';

export const GET = withAuth(async (req, ctx, user) => {
  const employeeId = Number(new URL(req.url).searchParams.get('employee_id') || user.id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) return NextResponse.json({ error: 'Nhân viên không hợp lệ' }, { status: 400 });
  if (employeeId !== Number(user.id) && !user.permissions.kpi.manage) return forbidden();
  const [tasks, reports] = await Promise.all([
    query(`SELECT t.id, t.title, t.status, t.due_date, t.completed_at, t.accepted_at,
      t.assignee_id, t.department_id FROM tasks t WHERE t.deleted_at IS NULL
      AND (t.assignee_id=$1 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$1))
      ORDER BY t.id DESC LIMIT 300`, [employeeId]),
    query(`SELECT r.id, r.title, r.status, r.period_start, r.period_end, r.version,
      r.employee_id, COALESCE(r.department_id,e.department_id) AS effective_department_id
      FROM reports r JOIN employees e ON e.id=r.employee_id
      WHERE r.deleted_at IS NULL AND r.employee_id=$1 ORDER BY r.id DESC LIMIT 300`, [employeeId]),
  ]);
  const visibleTasks = [];
  for (const task of tasks.rows) if (await canViewTask(task, user)) visibleTasks.push(task);
  return NextResponse.json({ tasks: visibleTasks,
    reports: reports.rows.filter((report) => canReport(user, 'view', report)) });
});
