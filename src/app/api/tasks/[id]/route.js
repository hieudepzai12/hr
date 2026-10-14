import { NextResponse } from 'next/server';
import { query, queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows, scopeFor } from '@/lib/access';
import { canViewTask, canEditTask, isTaskParticipant } from '@/lib/task-access';
import { validateTaskInput } from '@/lib/validate-task';
import { writeAudit } from '@/lib/audit';
import { deadlineAlert } from '@/lib/deadline';

export const GET = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!await canViewTask(task, user)) return forbidden();
  const [collaborators, updates, history] = await Promise.all([
    query('SELECT employee_id FROM task_collaborators WHERE task_id=$1 ORDER BY employee_id', [id]),
    query(`SELECT u.*, e.full_name AS employee_name FROM task_updates u
      JOIN employees e ON e.id=u.employee_id WHERE u.task_id=$1 ORDER BY u.created_at DESC, u.id DESC`, [id]),
    query(`SELECT a.*, e.full_name AS actor_name FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id
      WHERE a.entity_type='task' AND a.entity_id=$1 ORDER BY a.created_at DESC, a.id DESC`, [id]),
  ]);
  return NextResponse.json({ ...task, source_import_row: Number(task.created_by) === Number(user.id) || user.role === 'admin' ? task.source_import_row : null,
    collaborator_ids: collaborators.rows.map((row) => row.employee_id),
    updates: updates.rows, history: history.rows, alert: deadlineAlert(task) });
});

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const validationError = validateTaskInput(body, { partial: true });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (body.status === 'done') return NextResponse.json({ error: 'Cần nghiệm thu công việc trước khi hoàn thành' }, { status: 409 });
  const canEdit = canEditTask(before, user);
  const participant = await isTaskParticipant(before, user.id);
  if (!canEdit && (!participant || scopeFor(user, 'tasks', 'edit') === 'none')) return forbidden();
  const managerFields = ['title', 'description', 'assignee_id', 'department_id', 'customer_id', 'business_group',
    'data_period', 'expected_outcome', 'priority', 'start_date', 'due_date', 'planned_progress_date',
    'planned_progress', 'collaborator_ids', 'leader_opinion'];
  if (before.status === 'done' && (body.status !== undefined || body.progress !== undefined)) {
    return NextResponse.json({ error: 'Công việc đã nghiệm thu đang khóa tiến độ' }, { status: 409 });
  }
  if (user.role === 'employee' && managerFields.some((field) => body[field] !== undefined)) return forbidden('Bạn chỉ được cập nhật phần việc của mình');
  if (!canEdit && managerFields.some((field) => body[field] !== undefined && body[field] !== before[field])) return forbidden('Bạn chỉ được cập nhật phần việc của mình');
  if (!participant && (body.status !== undefined || body.progress !== undefined)) return forbidden('Chỉ người được giao mới cập nhật tiến độ');
  if (body.leader_opinion !== undefined) return forbidden('Ý kiến lãnh đạo phải được ghi ở bước nghiệm thu');
  if (!canEdit && body.status && !['todo', 'in_progress', 'review'].includes(body.status)) return forbidden();
  if (body.due_date !== undefined && body.due_date !== before.due_date && !String(body.reason || '').trim()) {
    return NextResponse.json({ error: 'Đổi hạn chót cần ghi lý do' }, { status: 400 });
  }
  if (body.customer_id) {
    const customer = await queryOne("SELECT 1 FROM customers WHERE id=$1 AND status='active'", [body.customer_id]);
    if (!customer) return NextResponse.json({ error: 'Khách hàng không hoạt động hoặc không tồn tại' }, { status: 400 });
  }
  const assigneeId = Number(body.assignee_id || before.assignee_id);
  const departmentId = Number(body.department_id || before.department_id);
  if (canEdit && !scopeAllows(user, 'tasks', 'edit', { ownerId: assigneeId, departmentId })) return forbidden();
  const after = await transaction(async (client) => {
    const cols = canEdit ? ['title', 'description', 'assignee_id', 'department_id', 'customer_id', 'business_group',
      'data_period', 'expected_outcome', 'priority', 'start_date', 'due_date', 'planned_progress_date',
      'planned_progress'] : [];
    if (participant) cols.push('status', 'progress');
    if (cols.length === 0) return before;
    const values = cols.map((column) => body[column] === undefined ? before[column] : body[column] === '' ? null : body[column]);
    const { rows } = await client.query(`UPDATE tasks SET ${cols.map((column, index) => `${column}=$${index + 1}`).join(', ')},
      updated_at=NOW() WHERE id=$${cols.length + 1} RETURNING *`, [...values, id]);
    if (canEdit && body.collaborator_ids) {
      await client.query('DELETE FROM task_collaborators WHERE task_id=$1', [id]);
      for (const employeeId of new Set(body.collaborator_ids.map(Number))) {
        if (employeeId !== Number(assigneeId)) await client.query('INSERT INTO task_collaborators (task_id,employee_id) VALUES ($1,$2)', [id, employeeId]);
      }
    }
    const action = body.due_date !== undefined && body.due_date !== before.due_date ? 'change_deadline' : 'edit';
    await writeAudit(client, { entityType: 'task', entityId: Number(id), actorId: user.id, action, before, after: rows[0], reason: body.reason });
    return rows[0];
  });
  return NextResponse.json(after);
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!scopeAllows(user, 'tasks', 'delete', { ownerId: before.assignee_id, departmentId: before.department_id })) return forbidden();
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'Cần ghi lý do xóa' }, { status: 400 });
  await transaction(async (client) => {
    const { rows } = await client.query('UPDATE tasks SET deleted_at=NOW(), deleted_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [reason, id]);
    await writeAudit(client, { entityType: 'task', entityId: Number(id), actorId: user.id, action: 'delete', before, after: rows[0], reason });
  });
  return NextResponse.json({ success: true });
});
