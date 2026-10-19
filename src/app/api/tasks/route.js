import { NextResponse } from 'next/server';
import { query, queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor, scopeAllows } from '@/lib/access';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';
import { validateTaskInput } from '@/lib/validate-task';
import { deadlineAlert } from '@/lib/deadline';
import { writeAudit } from '@/lib/audit';
import { validateTaskProject } from '@/lib/project-access';

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const scope = scopeFor(user, 'tasks', 'view');
  if (scope === 'none') return forbidden();
  const deleted = searchParams.get('deleted') === '1';
  if (deleted && scopeFor(user, 'tasks', 'restore') === 'none') return forbidden();
  const params = [];
  let sql = `SELECT t.*, e.full_name AS assignee_name, d.name AS department_name,
      c.name AS customer_name, c.code AS customer_code,
      ARRAY(SELECT tc.employee_id FROM task_collaborators tc WHERE tc.task_id=t.id ORDER BY tc.employee_id) AS collaborator_ids
    FROM tasks t LEFT JOIN employees e ON e.id=t.assignee_id
    LEFT JOIN departments d ON d.id=t.department_id
    LEFT JOIN customers c ON c.id=t.customer_id WHERE t.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`;
  if (scope === 'department') {
    params.push(user.department_id ?? -1, user.id);
    sql += ` AND (t.department_id=$1 OR t.assignee_id=$2 OR EXISTS
      (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$2))`;
  } else if (scope === 'self') {
    params.push(user.id);
    sql += ` AND (t.assignee_id=$1 OR EXISTS
      (SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$1))`;
  }
  for (const [key, column] of Object.entries({ assignee_id: 't.assignee_id', department_id: 't.department_id', customer_id: 't.customer_id', project_id: 't.project_id', status: 't.status', business_group: 't.business_group' })) {
    const value = searchParams.get(key);
    if (value) { params.push(value); sql += ` AND ${column}=$${params.length}`; }
  }
  if (searchParams.get('from')) { params.push(searchParams.get('from')); sql += ` AND t.due_date >= $${params.length}`; }
  if(searchParams.get('mine')==='1'){params.push(user.id);sql+=` AND (t.assignee_id=$${params.length} OR EXISTS(SELECT 1 FROM task_collaborators tc_mine WHERE tc_mine.task_id=t.id AND tc_mine.employee_id=$${params.length}))`;}
  if (searchParams.get('to')) { params.push(searchParams.get('to')); sql += ` AND t.due_date <= $${params.length}`; }
  sql = appendPagination(sql + ' ORDER BY t.due_date ASC NULLS LAST, t.id DESC', params, pagination);
  const { rows } = await query(sql, params);
  return NextResponse.json(pagedResult(rows.map(({ source_import_row, ...task }) => ({ ...task, alert: deadlineAlert(task) })), pagination));
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const validationError = validateTaskInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const assigneeId = Number(body.assignee_id || user.id);
  const assignee = await queryOne("SELECT id, department_id FROM employees WHERE id=$1 AND status='active'", [assigneeId]);
  if (!assignee) return NextResponse.json({ error: 'Người phụ trách không hợp lệ' }, { status: 400 });
  const departmentId = Number(body.department_id || assignee.department_id || user.department_id);
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) {
    return NextResponse.json({ error: 'Cần chọn phòng ban hợp lệ' }, { status: 400 });
  }
  if (!scopeAllows(user, 'tasks', 'create', { ownerId: assigneeId, departmentId })) return forbidden();
  const projectError = await validateTaskProject(user,body.project_id,departmentId,body.customer_id);
  if(projectError)return NextResponse.json({error:projectError},{status:400});
  if (scopeFor(user, 'tasks', 'create') === 'department' && Number(assignee.department_id) !== departmentId) return forbidden();
  if (body.customer_id) {
    const customer = await queryOne("SELECT 1 FROM customers WHERE id=$1 AND status='active'", [body.customer_id]);
    if (!customer) return NextResponse.json({ error: 'Khách hàng không hoạt động hoặc không tồn tại' }, { status: 400 });
  }
  if (body.status && !['todo', 'in_progress'].includes(body.status)) return NextResponse.json({ error: 'Trạng thái ban đầu không hợp lệ' }, { status: 400 });
  const collaborators = [...new Set((body.collaborator_ids || []).map(Number))].filter((id) => id !== assigneeId);
  if (collaborators.length) {
    const { rows } = await query("SELECT id, department_id FROM employees WHERE id=ANY($1::int[]) AND status='active'", [collaborators]);
    if (rows.length !== collaborators.length || (scopeFor(user, 'tasks', 'create') === 'department' &&
      rows.some((person) => Number(person.department_id) !== departmentId))) {
      return NextResponse.json({ error: 'Người phối hợp không hợp lệ hoặc ngoài phạm vi phòng ban' }, { status: 400 });
    }
  }
  const task = await transaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO tasks
      (title, description, assignee_id, created_by, status, priority, start_date, due_date, progress,
      customer_id, department_id, business_group, data_period, expected_outcome, planned_progress_date, planned_progress, project_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [body.title.trim(), body.description || null, assigneeId, user.id, body.status || 'todo', body.priority || 'medium',
      body.start_date || null, body.due_date || null, Number(body.progress || 0), body.customer_id || null, departmentId || null,
      body.business_group || null, body.data_period || null, body.expected_outcome || null,
      body.planned_progress_date || null, body.planned_progress === '' ? null : body.planned_progress ?? null, body.project_id || null]);
    for (const employeeId of collaborators) {
      await client.query('INSERT INTO task_collaborators (task_id, employee_id) VALUES ($1,$2)', [rows[0].id, employeeId]);
    }
    await writeAudit(client, { entityType: 'task', entityId: rows[0].id, actorId: user.id, action: 'create', after: { ...rows[0], collaborator_ids: collaborators } });
    return rows[0];
  });
  return NextResponse.json(task, { status: 201 });
});
