import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { vietnamToday } from '@/lib/deadline';

export const GET = withAuth(async (req, ctx, user) => {
  const taskScope = scopeFor(user, 'tasks', 'view');
  const reportScope = scopeFor(user, 'reports', 'view');
  const taskWhere = taskScope === 'all' ? 'TRUE' : taskScope === 'department'
    ? `(t.department_id=$2 OR t.assignee_id=$1 OR EXISTS
      (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$1))`
    : taskScope === 'self'
      ? `(t.assignee_id=$1 OR EXISTS
        (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$1))`
      : 'FALSE';
  const reportWhere = reportScope === 'all' ? 'TRUE' : reportScope === 'department'
    ? '(r.department_id=$2 OR r.employee_id=$1)' : reportScope === 'self' ? 'r.employee_id=$1' : 'FALSE';
  const args = [user.id, user.department_id ?? -1, vietnamToday()];
  // One round trip, with the same permission predicates as the list endpoints.
  const counts = await queryOne(`WITH input AS (SELECT $1::int AS employee_id, $2::int AS department_id, $3::text AS today),
      visible_tasks AS MATERIALIZED (SELECT t.id, t.title, t.due_date, t.status, t.assignee_id,
        t.progress, t.progress_text, t.planned_progress_date, t.planned_progress FROM tasks t WHERE t.deleted_at IS NULL AND ${taskWhere}),
      visible_reports AS MATERIALIZED (SELECT r.id, r.title, r.type, r.employee_id, r.status, r.created_at
        FROM reports r WHERE r.deleted_at IS NULL AND ${reportWhere})
      SELECT
      (SELECT COUNT(*)::int FROM employees WHERE status='active') AS total_employees,
      (SELECT COUNT(*)::int FROM departments) AS total_departments,
      (SELECT COUNT(*)::int FROM visible_tasks t WHERE
        t.due_date < $3 AND t.status NOT IN ('done','review')) AS overdue_tasks,
      (SELECT COUNT(*)::int FROM visible_reports r WHERE r.status='submitted') AS pending_reports,
      COALESCE((SELECT jsonb_agg(s) FROM (SELECT t.status, COUNT(*)::int AS c
        FROM visible_tasks t GROUP BY t.status) s), '[]'::jsonb) AS task_statuses,
      COALESCE((SELECT jsonb_agg(d) FROM (SELECT t.id, t.title, t.due_date, t.status,
        t.progress, t.progress_text, t.planned_progress_date, t.planned_progress, e.full_name AS assignee_name FROM visible_tasks t
      LEFT JOIN employees e ON e.id=t.assignee_id
      WHERE t.due_date >= $3 AND t.status NOT IN ('done','review')
      ORDER BY t.due_date ASC, t.id ASC LIMIT 5) d), '[]'::jsonb) AS deadlines,
      COALESCE((SELECT jsonb_agg(recent) FROM (SELECT r.id, r.title, r.type, r.employee_id, r.status, r.created_at,
      e.full_name AS employee_name FROM visible_reports r JOIN employees e ON e.id=r.employee_id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 5) recent), '[]'::jsonb) AS recent_reports`, args);
  const canManageEmployees = user.permissions.employees.manage;
  return NextResponse.json({
    totalEmployees: canManageEmployees ? counts.total_employees : undefined,
    totalDepartments: canManageEmployees ? counts.total_departments : undefined,
    tasksByStatus: counts.task_statuses,
    overdueTasks: counts.overdue_tasks,
    upcomingDeadlines: counts.deadlines,
    pendingReports: scopeFor(user, 'reports', 'approve') !== 'none' ? counts.pending_reports : undefined,
    recentReports: counts.recent_reports,
  });
});
