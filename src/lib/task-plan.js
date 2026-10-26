const STATUS_VALUES = new Set(['todo', 'in_progress', 'review', 'done', 'cancelled']);

export function buildTaskPlanQuery({ userId, departmentId, viewScope, printScope, filters = {} }) {
  if (viewScope === 'none' || printScope === 'none') throw new Error('FORBIDDEN');
  const params = [];
  const where = ['t.deleted_at IS NULL'];
  const addScope = (scope) => {
    if (scope === 'all') return;
    if (scope === 'department') {
      params.push(departmentId ?? -1, userId);
      const department = `$${params.length - 1}`;
      const person = `$${params.length}`;
      where.push(`(t.department_id=${department} OR t.assignee_id=${person} OR EXISTS
        (SELECT 1 FROM task_collaborators tc_scope WHERE tc_scope.task_id=t.id AND tc_scope.employee_id=${person}))`);
      return;
    }
    if (scope === 'self') {
      params.push(userId);
      const person = `$${params.length}`;
      where.push(`(t.assignee_id=${person} OR EXISTS
        (SELECT 1 FROM task_collaborators tc_scope WHERE tc_scope.task_id=t.id AND tc_scope.employee_id=${person}))`);
      return;
    }
    throw new Error('FORBIDDEN');
  };
  addScope(viewScope);
  addScope(printScope);
  if(filters.mine==='1')addScope('self');
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().slice(0, 500)}%`);
    where.push(`(t.title ILIKE $${params.length} OR e.full_name ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }

  for (const [key, column] of Object.entries({ assignee_id: 't.assignee_id', department_id: 't.department_id', customer_id: 't.customer_id', project_id: 't.project_id' })) {
    if (!filters[key]) continue;
    const id = Number(filters[key]);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new Error('Bộ lọc không hợp lệ');
    params.push(id);
    where.push(`${column}=$${params.length}`);
  }
  if (filters.status) {
    if (!STATUS_VALUES.has(filters.status)) throw new Error('Trạng thái không hợp lệ');
    params.push(filters.status);
    where.push(`t.status=$${params.length}`);
  }
  for (const [key, operator] of [['from', '>='], ['to', '<=']]) {
    if (!filters[key]) continue;
    const value = String(filters[key]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Ngày lọc không hợp lệ');
    params.push(value);
    where.push(`t.due_date ${operator} $${params.length}`);
  }

  const sql = `SELECT t.id, t.title, t.description, t.expected_outcome, t.priority, t.status,
      t.progress, t.start_date, t.due_date, t.blockers, t.proposed_solution, t.leader_opinion,
      e.full_name AS assignee_name,
      d.name AS department_name, c.name AS customer_name,
      COALESCE(collaborators.names, '') AS collaborator_names
    FROM tasks t
    LEFT JOIN employees e ON e.id=t.assignee_id
    LEFT JOIN departments d ON d.id=t.department_id
    LEFT JOIN customers c ON c.id=t.customer_id
    LEFT JOIN LATERAL (
      SELECT string_agg(ec.full_name, ', ' ORDER BY ec.full_name) AS names
      FROM task_collaborators tc JOIN employees ec ON ec.id=tc.employee_id
      WHERE tc.task_id=t.id
    ) collaborators ON TRUE
    WHERE ${where.join(' AND ')}
    ORDER BY d.name NULLS LAST, e.full_name NULLS LAST, t.due_date ASC NULLS LAST, t.id`;
  return { sql, params };
}
