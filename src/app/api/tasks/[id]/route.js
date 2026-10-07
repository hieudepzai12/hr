import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { validateTaskInput } from '@/lib/validate-task';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!user.permissions.tasks.manage && task.assignee_id !== user.id) {
    return forbidden('Không có quyền chỉnh sửa công việc này');
  }

  const isManager = ['admin', 'director', 'manager'].includes(user.role) || user.permissions.tasks.manage;
  if (isManager && !user.permissions.tasks.manage) return forbidden();
  const body = await req.json().catch(() => null);
  const validationError = validateTaskInput(body, { partial: true });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const { title, description, assignee_id, status, priority, start_date, due_date, progress } = body;

  let rows;
  if (isManager) {
    ({ rows } = await query(
      `UPDATE tasks SET title=$1, description=$2, assignee_id=$3, status=$4, priority=$5,
       start_date=$6, due_date=$7, progress=$8 WHERE id=$9 RETURNING *`,
      [
        title ?? task.title, description ?? task.description, assignee_id ?? task.assignee_id,
        status ?? task.status, priority ?? task.priority, start_date ?? task.start_date,
        due_date ?? task.due_date, progress ?? task.progress, id,
      ]
    ));
  } else {
    ({ rows } = await query(
      'UPDATE tasks SET status=$1, progress=$2 WHERE id=$3 RETURNING *',
      [status ?? task.status, progress ?? task.progress, id]
    ));
  }
  return NextResponse.json(rows[0]);
});

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  await query('DELETE FROM tasks WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin', 'director', 'manager'] });
