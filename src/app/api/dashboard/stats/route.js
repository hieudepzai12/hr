import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
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
  const [counts, statusResult, deadlinesResult, reportsResult] = await Promise.all([
    queryOne(`WITH input AS (SELECT $1::int AS employee_id, $2::int AS department_id, $3::text AS today)
      SELECT
      (SELECT COUNT(*)::int FROM employees WHERE status='active') AS total_employees,
      (SELECT COUNT(*)::int FROM departments) AS total_departments,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.deleted_at IS NULL AND ${taskWhere}
        AND t.due_date < $3 AND t.status NOT IN ('done','review')) AS overdue_tasks,
      (SELECT COUNT(*)::int FROM reports r WHERE r.deleted_at IS NULL AND ${reportWhere}
        AND r.status='submitted') AS pending_reports`, args),
    query(`WITH input AS (SELECT $1::int AS employee_id, $2::int AS department_id, $3::text AS today)
      SELECT t.status, COUNT(*)::int AS c FROM tasks t
      WHERE t.deleted_at IS NULL AND ${taskWhere} GROUP BY t.status`, args),
    query(`WITH input AS (SELECT $1::int AS employee_id, $2::int AS department_id, $3::text AS today)
      SELECT t.*, e.full_name AS assignee_name FROM tasks t
      LEFT JOIN employees e ON e.id=t.assignee_id
      WHERE t.deleted_at IS NULL AND ${taskWhere} AND t.due_date >= $3 AND t.status NOT IN ('done','review')
      ORDER BY t.due_date ASC, t.id ASC LIMIT 5`, args),
    query(`WITH input AS (SELECT $1::int AS employee_id, $2::int AS department_id, $3::text AS today)
      SELECT r.id, r.title, r.type, r.employee_id, r.status, r.created_at,
      e.full_name AS employee_name FROM reports r JOIN employees e ON e.id=r.employee_id
      WHERE r.deleted_at IS NULL AND ${reportWhere}
      ORDER BY r.created_at DESC, r.id DESC LIMIT 5`, args),
  ]);
  const canManageEmployees = user.permissions.employees.manage;
  return NextResponse.json({
    totalEmployees: canManageEmployees ? counts.total_employees : undefined,
    totalDepartments: canManageEmployees ? counts.total_departments : undefined,
    tasksByStatus: statusResult.rows,
    overdueTasks: counts.overdue_tasks,
    upcomingDeadlines: deadlinesResult.rows,
    pendingReports: scopeFor(user, 'reports', 'approve') !== 'none' ? counts.pending_reports : undefined,
    recentReports: reportsResult.rows,
  });
});
