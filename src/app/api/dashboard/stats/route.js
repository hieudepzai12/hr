import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, ctx, user) => {
  const isManager = ['admin', 'manager'].includes(user.role);

  const { rows: totalEmployeesRows } = await query(`SELECT COUNT(*)::int AS c FROM employees WHERE status = 'active'`);
  const totalEmployees = totalEmployeesRows[0].c;
  const { rows: totalDeptRows } = await query('SELECT COUNT(*)::int AS c FROM departments');
  const totalDepartments = totalDeptRows[0].c;

  const taskScopeClause = isManager ? '' : 'AND assignee_id = $1';
  const taskScopeParams = isManager ? [] : [user.id];

  const { rows: tasksByStatus } = await query(
    `SELECT status, COUNT(*)::int AS c FROM tasks WHERE 1=1 ${taskScopeClause} GROUP BY status`,
    taskScopeParams
  );
  const { rows: overdueRows } = await query(
    `SELECT COUNT(*)::int AS c FROM tasks WHERE due_date < to_char(NOW(), 'YYYY-MM-DD') AND status != 'done' ${taskScopeClause}`,
    taskScopeParams
  );
  const overdueTasks = overdueRows[0].c;

  const upcomingParams = isManager ? [] : [user.id];
  const upcomingScope = isManager ? '' : `AND t.assignee_id = $1`;
  const { rows: upcomingDeadlines } = await query(
    `SELECT t.*, e.full_name as assignee_name FROM tasks t
     LEFT JOIN employees e ON t.assignee_id = e.id
     WHERE t.due_date >= to_char(NOW(), 'YYYY-MM-DD') AND t.status != 'done' ${upcomingScope}
     ORDER BY t.due_date ASC LIMIT 5`,
    upcomingParams
  );

  const pendingReports = isManager
    ? (await queryOne(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'submitted'`)).c
    : undefined;

  const reportScope = isManager ? '' : 'AND r.employee_id = $1';
  const reportParams = isManager ? [] : [user.id];
  const { rows: recentReports } = await query(
    `SELECT r.*, e.full_name as employee_name FROM reports r
     JOIN employees e ON r.employee_id = e.id WHERE 1=1 ${reportScope}
     ORDER BY r.created_at DESC LIMIT 5`,
    reportParams
  );

  return NextResponse.json({
    totalEmployees,
    totalDepartments,
    tasksByStatus,
    overdueTasks,
    upcomingDeadlines,
    pendingReports,
    recentReports,
  });
});
