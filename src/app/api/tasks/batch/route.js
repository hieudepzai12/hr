import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows } from '@/lib/access';
import { validateTaskInput } from '@/lib/validate-task';
import { validateTaskProject } from '@/lib/project-access';
import { taskGroupKey } from '@/lib/task-grouping';
import { writeAudit } from '@/lib/audit';

export const DELETE = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const ids = body?.task_ids;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647) || reason.length > 2000) {
    return NextResponse.json({ error: 'Danh sách công việc hoặc lý do xóa không hợp lệ' }, { status: 400 });
  }
  return transaction(async client => {
    const uniqueIds = [...new Set(ids)];
    const { rows: tasks } = await client.query('SELECT * FROM tasks WHERE id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [uniqueIds]);
    if (tasks.length !== uniqueIds.length) return NextResponse.json({ error: 'Công việc đã thay đổi. Vui lòng tải lại danh sách.' }, { status: 409 });
    if (tasks.some(task => !scopeAllows(user, 'tasks', 'delete', { ownerId: task.assignee_id, departmentId: task.department_id }))) return forbidden();
    if (tasks.some(task => task.assignee_id !== tasks[0].assignee_id || taskGroupKey(task) !== taskGroupKey(tasks[0]))) {
      return NextResponse.json({ error: 'Chỉ xóa chung công việc của một nhân sự trong cùng dự án' }, { status: 400 });
    }
    const { rows: updated } = await client.query('UPDATE tasks SET deleted_at=NOW(), deleted_reason=$1, updated_at=NOW() WHERE id=ANY($2::int[]) RETURNING *', [reason, uniqueIds]);
    const byId = new Map(updated.map(task => [task.id, task]));
    for (const before of tasks) await writeAudit(client, { entityType: 'task', entityId: before.id, actorId: user.id, action: 'delete', before, after: byId.get(before.id), reason });
    return NextResponse.json({ success: true, deleted: tasks.length });
  });
});

export const PUT = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.tasks) || !body.tasks.length || body.tasks.length > 2000 ||
      body.tasks.some(task => !task || (task.id !== undefined && (!Number.isSafeInteger(task.id) || task.id <= 0 || task.id > 2147483647)) || validateTaskInput({ title: task?.title, description: task?.description, due_date:task?.due_date }))) {
    return NextResponse.json({ error: 'Nội dung công việc không hợp lệ' }, { status: 400 });
  }
  if (body.due_date !== undefined && validateTaskInput({ due_date: body.due_date }, { partial: true })) return NextResponse.json({ error: 'Hạn chót không hợp lệ' }, { status: 400 });
  const ids = body.tasks.filter(task => task.id !== undefined).map(task => task.id);
  if (!ids.length) return NextResponse.json({ error: 'Thiếu công việc gốc' }, { status: 400 });
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Công việc bị trùng' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  return transaction(async client => {
    const { rows: tasks } = await client.query('SELECT * FROM tasks WHERE id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [ids]);
    if (tasks.length !== ids.length) return NextResponse.json({ error: 'Công việc đã thay đổi. Vui lòng tải lại.' }, { status: 409 });
    if ((user.role === 'employee' && tasks.some(task=>Number(task.assignee_id)!==Number(user.id))) || tasks.some(task => !scopeAllows(user, 'tasks', 'edit', { ownerId: task.assignee_id, departmentId: task.department_id }))) return forbidden();
    if (tasks.some(task => task.assignee_id !== tasks[0].assignee_id || taskGroupKey(task) !== taskGroupKey(tasks[0]))) return NextResponse.json({ error: 'Công việc phải cùng nhân sự và dự án' }, { status: 400 });
    const dueDate = body.due_date || null;
    const proposedById = new Map(body.tasks.map(task=>[task.id,task]));
    if (tasks.some(task => {const input=proposedById.get(task.id);const next=input.due_date===undefined?(body.due_date===undefined?task.due_date:dueDate):input.due_date||null;return task.due_date!==next;}) && (!reason || reason.length > 2000)) return NextResponse.json({ error: 'Đổi hạn chót cần ghi lý do' }, { status: 400 });
    const contexts = [];
    for (const task of tasks) {
      const context = {
        assignee_id: task.assignee_id,
        department_id: body.department_id === undefined ? task.department_id : body.department_id,
        customer_id: body.customer_id === undefined ? task.customer_id : body.customer_id,
        project_id: body.project_id === undefined ? task.project_id : body.project_id,
        start_date: body.start_date === undefined ? task.start_date : body.start_date,
      };
      const contextError = ['department_id','customer_id','project_id','start_date'].some(field=>body[field]!==undefined) ? await validateContext(user, context, 'edit') : null;
      if (contextError) return contextError;
      contexts.push(context);
    }
    const additions = body.tasks.filter(task => task.id === undefined);
    if (additions.length && !contexts[0].project_id && !contexts[0].customer_id) return NextResponse.json({ error: 'Chọn dự án hoặc khách hàng để thêm công việc vào nhóm' }, { status: 400 });
    if (additions.length) {
      const contextError = await validateContext(user, contexts[0], 'create');
      if (contextError) return contextError;
    }
    const inputById = new Map(body.tasks.map(task => [task.id, task]));
    for (const [index, before] of tasks.entries()) {
      const input = inputById.get(before.id);
      const nextDate = input.due_date === undefined ? (body.due_date === undefined ? before.due_date : dueDate) : input.due_date || null;
      const { rows } = await client.query('UPDATE tasks SET title=$1, description=$2, due_date=$3, department_id=$4,customer_id=$5,project_id=$6,start_date=$7,updated_at=NOW() WHERE id=$8 RETURNING *', [input.title.trim(), input.description || null, nextDate, contexts[index].department_id || null,contexts[index].customer_id || null,contexts[index].project_id || null,contexts[index].start_date || null,before.id]);
      await writeAudit(client, { entityType: 'task', entityId: before.id, actorId: user.id, action: nextDate !== before.due_date ? 'change_deadline' : 'edit', before, after: rows[0], reason });
    }
    for (const task of additions) await insertTask(client, task, { ...contexts[0], due_date: body.due_date === undefined ? tasks[0].due_date : dueDate }, user.id);
    return NextResponse.json({ success: true, updated: tasks.length, created: additions.length });
  });
});

async function validateContext(user, context, action) {
  for (const field of ['department_id', 'customer_id', 'project_id']) {
    const value = context[field];
    if (value != null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0 || Number(value) > 2147483647)) return NextResponse.json({ error: 'Thông tin liên kết không hợp lệ' }, { status: 400 });
  }
  const departmentId = context.department_id ? Number(context.department_id) : null;
  if (departmentId === null && user.role !== 'admin') return NextResponse.json({ error: 'Cần chọn phòng ban' }, { status: 400 });
  if (user.role==='employee' && departmentId!==Number(user.department_id)) return forbidden();
  if (!scopeAllows(user, 'tasks', action, { ownerId: context.assignee_id, departmentId })) return forbidden();
  if (departmentId && !await queryOne('SELECT 1 FROM departments WHERE id=$1', [departmentId])) return NextResponse.json({ error: 'Phòng ban không tồn tại' }, { status: 400 });
  const projectError = await validateTaskProject(user, context.project_id, departmentId, null);
  if (projectError) return NextResponse.json({ error: projectError }, { status: 400 });
  if (context.project_id) {
    const project = await queryOne('SELECT customer_id FROM projects WHERE id=$1 AND deleted_at IS NULL', [context.project_id]);
    if (!project) return NextResponse.json({ error: 'Dự án không còn tồn tại' }, { status: 400 });
    context.customer_id = project.customer_id;
  }
  if (context.customer_id && !await queryOne("SELECT 1 FROM customers WHERE id=$1 AND status='active'", [context.customer_id])) return NextResponse.json({ error: 'Khách hàng không hoạt động hoặc không tồn tại' }, { status: 400 });

  if (validateTaskInput({ start_date: context.start_date, due_date: context.due_date }, { partial: true })) return NextResponse.json({ error: 'Ngày công việc không hợp lệ' }, { status: 400 });
  return null;
}

async function insertTask(client, task, context, actorId) {
  const { rows } = await client.query(`INSERT INTO tasks(title,description,assignee_id,created_by,department_id,customer_id,project_id,start_date,due_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [task.title.trim(),task.description || null,context.assignee_id,actorId,context.department_id || null,context.customer_id || null,context.project_id || null,context.start_date || null,(task.due_date===undefined?context.due_date:task.due_date) || null]);
  await writeAudit(client, { entityType: 'task', entityId: rows[0].id, actorId, action: 'create', after: rows[0] });
  return rows[0];
}

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.tasks) || !body.tasks.length || body.tasks.length > 100 || body.tasks.some(task => !task || task.id !== undefined || validateTaskInput(task))) return NextResponse.json({ error: 'Danh sách công việc không hợp lệ' }, { status: 400 });
  if (body.assignee_id && Number(body.assignee_id) !== Number(user.id)) return forbidden();
  const context = { department_id: user.department_id, ...body, assignee_id: user.id };
  const contextError = await validateContext(user, context, 'create');
  if (contextError) return contextError;
  if (body.tasks.length > 1 && !context.project_id && !context.customer_id) return NextResponse.json({ error: 'Chọn dự án hoặc khách hàng cho nhóm công việc' }, { status: 400 });
  return transaction(async client => {
    const tasks = [];
    for (const task of body.tasks) tasks.push(await insertTask(client, task, context, user.id));
    return NextResponse.json({ success: true, tasks }, { status: 201 });
  });
});
