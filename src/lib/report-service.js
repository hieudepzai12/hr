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
  const ids = [...new Set(taskIds.map(Number))];
  if (!ids.length) return;
  const { rows: tasks } = await client.query(`SELECT t.*, e.full_name AS employee_name,
      c.name AS customer_name, c.code AS customer_code,
      own.progress AS own_progress, own.result AS own_result, own.next_step AS own_next_step,
      own.blockers AS own_blockers, own.solution AS own_solution
      FROM tasks t LEFT JOIN employees e ON e.id=$2
      LEFT JOIN customers c ON c.id=t.customer_id
      LEFT JOIN LATERAL (SELECT progress, result, next_step, blockers, solution
        FROM task_updates WHERE task_id=t.id AND employee_id=$2 ORDER BY created_at DESC LIMIT 1) own ON TRUE
      WHERE t.id=ANY($1::int[]) AND t.deleted_at IS NULL AND
        (t.assignee_id=$2 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$2))`,
    [ids, userId]);
  if (tasks.length !== ids.length) {
    const error = new Error('Bạn chỉ được đưa phần việc của mình vào báo cáo');
    error.code = 'TASK_ACCESS';
    throw error;
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const snapshots = ids.map(id => {
    const task = byId.get(id);
    return {
      task_id: task.id, title: task.title, employee_id: userId, employee_name: task.employee_name,
      customer_id: task.customer_id, customer_name: task.customer_name, customer_code: task.customer_code,
      department_id: task.department_id, due_date: task.due_date, data_period: task.data_period,
      status: task.status, progress: task.own_progress ?? task.progress,
      result: task.own_result ?? task.completed_result, next_step: task.own_next_step ?? task.next_step,
      blockers: task.own_blockers ?? task.blockers, solution: task.own_solution ?? task.proposed_solution,
    };
  });
  await client.query(`INSERT INTO report_items (report_id, task_id, employee_id, snapshot)
    SELECT $1, (item->>'task_id')::int, $2, item FROM jsonb_array_elements($3::jsonb) item`,
  [reportId, userId, JSON.stringify(snapshots)]);
}

export async function saveReportVersion(client, reportId, actorId) {
  const { rows } = await client.query(`INSERT INTO report_versions (report_id, version, snapshot, actor_id)
    SELECT r.id, r.version, jsonb_build_object('report', to_jsonb(r), 'items',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id', i.task_id,
        'employee_id', i.employee_id, 'snapshot', i.snapshot, 'leader_opinion', i.leader_opinion) ORDER BY i.id)
        FROM report_items i WHERE i.report_id=r.id), '[]'::jsonb)), $2
    FROM reports r WHERE r.id=$1 RETURNING snapshot`, [reportId, actorId]);
  return rows[0].snapshot;
}
