import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { deadlineAlert } from '@/lib/deadline';

export const GET = withAuth(async (req, ctx, user) => {
  const scope = scopeFor(user, 'tasks', 'view');
  if (scope === 'none') return forbidden();
  const params = [];
  let where = "t.deleted_at IS NULL AND t.status NOT IN ('done','cancelled')";
  if (scope === 'department') {
    params.push(user.department_id ?? -1, user.id);
    where += ` AND (t.department_id=$1 OR t.assignee_id=$2 OR EXISTS
      (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$2))`;
  } else if (scope === 'self') {
    params.push(user.id);
    where += ` AND (t.assignee_id=$1 OR EXISTS
      (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$1))`;
  }
  const { rows } = await query(`SELECT t.id, t.title, t.due_date, t.status, t.progress, t.progress_text,
    t.planned_progress_date, t.planned_progress, t.deleted_at FROM tasks t WHERE ${where}
    ORDER BY t.due_date ASC NULLS LAST LIMIT 300`, params);
  const alerts = rows.map((task) => ({ ...task, alert: deadlineAlert(task) })).filter((task) =>
    task.alert && task.alert.kind !== 'missing');
  return NextResponse.json({ count: alerts.length, alerts });
});
