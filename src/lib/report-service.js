import { queryOne } from './db';
import { scopeAllows } from './access';

export async function loadReport(id) {
  return queryOne(`SELECT r.*, e.full_name AS employee_name,
    COALESCE(r.department_id,e.department_id) AS effective_department_id
    FROM reports r JOIN employees e ON e.id=r.employee_id WHERE r.id=$1`, [id]);
}

export function canReport(user, action, report) {
  return scopeAllows(user, 'reports', action, {
    ownerId: report.employee_id,
    departmentId: report.effective_department_id ?? report.department_id,
  });
}

export async function replaceReportItems(client, reportId, taskIds, userId) {
  if (!Array.isArray(taskIds) || taskIds.length > 100 || taskIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    const error = new Error('Danh sách công việc không hợp lệ');
    error.code = 'INVALID_TASKS';
    throw error;
  }
  await client.query('DELETE FROM report_items WHERE report_id=$1', [reportId]);
  for (const taskId of new Set(taskIds.map(Number))) {
    const { rows } = await client.query(`SELECT t.*, e.full_name AS employee_name,
      c.name AS customer_name, c.code AS customer_code
      FROM tasks t LEFT JOIN employees e ON e.id=$2
      LEFT JOIN customers c ON c.id=t.customer_id
      WHERE t.id=$1 AND t.deleted_at IS NULL AND
        (t.assignee_id=$2 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$2))`,
    [taskId, userId]);
    if (!rows[0]) {
      const error = new Error('Bạn chỉ được đưa phần việc của mình vào báo cáo');
      error.code = 'TASK_ACCESS';
      throw error;
    }
    const task = rows[0];
    const { rows: updates } = await client.query(`SELECT employee_id, progress, result, next_step, blockers,
      solution, created_at FROM task_updates WHERE task_id=$1 AND employee_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [taskId, userId]);
    const own = updates[0];
    const snapshot = {
      task_id: task.id, title: task.title, employee_id: userId, employee_name: task.employee_name,
      customer_id: task.customer_id, customer_name: task.customer_name, customer_code: task.customer_code,
      department_id: task.department_id, due_date: task.due_date, data_period: task.data_period,
      status: task.status, progress: own?.progress ?? task.progress,
      result: own?.result ?? task.completed_result, next_step: own?.next_step ?? task.next_step,
      blockers: own?.blockers ?? task.blockers, solution: own?.solution ?? task.proposed_solution,
    };
    await client.query(`INSERT INTO report_items (report_id, task_id, employee_id, snapshot)
      VALUES ($1,$2,$3,$4::jsonb)`, [reportId, taskId, userId, JSON.stringify(snapshot)]);
  }
}

export async function saveReportVersion(client, reportId, actorId) {
  const { rows: reportRows } = await client.query('SELECT * FROM reports WHERE id=$1', [reportId]);
  const report = reportRows[0];
  const { rows: items } = await client.query('SELECT task_id, employee_id, snapshot, leader_opinion FROM report_items WHERE report_id=$1 ORDER BY id', [reportId]);
  await client.query(`INSERT INTO report_versions (report_id, version, snapshot, actor_id)
    VALUES ($1,$2,$3::jsonb,$4)`, [reportId, report.version, JSON.stringify({ report, items }), actorId]);
  return { report, items };
}
