import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { isTaskParticipant } from '@/lib/task-access';
import { scopeFor } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (scopeFor(user, 'tasks', 'edit') === 'none' || !await isTaskParticipant(task, user.id)) return forbidden('Chỉ người được giao mới được ghi phần việc của mình');
  if (task.status === 'done') return NextResponse.json({ error: 'Công việc đã nghiệm thu' }, { status: 409 });
  const body = await req.json().catch(() => null);
  const progress = body?.progress === undefined ? Number(task.progress || 0) : Number(body.progress);
  const progressText = body?.progress_text ?? '';
  if (!Number.isInteger(progress) || progress < 0 || progress > 100 ||
    typeof progressText !== 'string' || progressText.length > 10000 ||
    ['result', 'next_step', 'blockers', 'solution'].some((key) => typeof body?.[key] !== 'string' || body[key].length > 10000)) {
    return NextResponse.json({ error: 'Nội dung cập nhật không hợp lệ' }, { status: 400 });
  }
  const primary = Number(task.assignee_id) === Number(user.id);
  if (body.submit_for_review && !primary) return forbidden('Chỉ người phụ trách chính được gửi nghiệm thu');
  const update = await transaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO task_updates
      (task_id, employee_id, progress, result, next_step, blockers, solution, progress_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, user.id, progress, body.result, body.next_step, body.blockers, body.solution, progressText]);
    if (primary) {
      await client.query(`UPDATE tasks SET progress=$1, completed_result=$2, next_step=$3, blockers=$4,
        proposed_solution=$5, status=$6, progress_text=$8, updated_at=NOW() WHERE id=$7`,
      [progress, body.result, body.next_step, body.blockers, body.solution,
        body.submit_for_review ? 'review' : 'in_progress', id, progressText]);
    }
    await writeAudit(client, { entityType: 'task', entityId: Number(id), actorId: user.id,
      action: body.submit_for_review ? 'submit' : 'update', after: rows[0] });
    return rows[0];
  });
  return NextResponse.json(update, { status: 201 });
});
