import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, ctx, user) => {
  const isManager = Boolean(user.permissions.employees.manage);
  const scopedUser = isManager ? null : user.id;
  const [counts, statusResult, deadlinesResult, reportsResult] = await Promise.all([
    queryOne(`SELECT
      (SELECT COUNT(*)::int FROM employees WHERE status = 'active') AS total_employees,
      (SELECT COUNT(*)::int FROM departments) AS total_departments,
      (SELECT COUNT(*)::int FROM tasks WHERE due_date < to_char(NOW(), 'YYYY-MM-DD')
        AND status <> 'done' AND ($1::int IS NULL OR assignee_id = $1)) AS overdue_tasks,
      (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS pending_reports`, [scopedUser]),
    query(`SELECT status, COUNT(*)::int AS c FROM tasks
      WHERE ($1::int IS NULL OR assignee_id = $1) GROUP BY status`, [scopedUser]),
    query(`SELECT t.*, e.full_name AS assignee_name FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      WHERE t.due_date >= to_char(NOW(), 'YYYY-MM-DD') AND t.status <> 'done'
        AND ($1::int IS NULL OR t.assignee_id = $1)
      ORDER BY t.due_date ASC, t.id ASC LIMIT 5`, [scopedUser]),
    query(`SELECT r.id, r.title, r.type, r.employee_id, r.status, r.created_at,
      e.full_name AS employee_name FROM reports r
      JOIN employees e ON r.employee_id = e.id
      WHERE ($1::int IS NULL OR r.employee_id = $1)
      ORDER BY r.created_at DESC, r.id DESC LIMIT 5`, [scopedUser]),
  ]);

  return NextResponse.json({
    totalEmployees: counts.total_employees,
    totalDepartments: counts.total_departments,
    tasksByStatus: statusResult.rows,
    overdueTasks: counts.overdue_tasks,
    upcomingDeadlines: deadlinesResult.rows,
    pendingReports: isManager ? counts.pending_reports : undefined,
    recentReports: reportsResult.rows,
  });
});
