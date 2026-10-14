import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (Number(before.assignee_id) === Number(user.id) || !scopeAllows(user, 'tasks', 'approve', { ownerId: before.assignee_id, departmentId: before.department_id })) return forbidden();
  if (before.status !== 'review') return NextResponse.json({ error: 'Công việc chưa được gửi nghiệm thu' }, { status: 409 });
  const body = await req.json().catch(() => null);
  if (!['approved', 'rejected'].includes(body?.decision) || typeof body?.opinion !== 'string' || !body.opinion.trim()) {
    return NextResponse.json({ error: 'Cần nhập quyết định và ý kiến lãnh đạo' }, { status: 400 });
  }
  const after = await transaction(async (client) => {
    const { rows } = await client.query(`UPDATE tasks SET status=$1, leader_opinion=$2,
      accepted_at=$3, accepted_by=$4, completed_at=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
    [body.decision === 'approved' ? 'done' : 'in_progress', body.opinion.trim(),
      body.decision === 'approved' ? new Date() : null, body.decision === 'approved' ? user.id : null,
      body.decision === 'approved' ? new Date() : null, id]);
    await writeAudit(client, { entityType: 'task', entityId: Number(id), actorId: user.id,
      action: body.decision === 'approved' ? 'approve' : 'reject', before, after: rows[0], reason: body.opinion });
    return rows[0];
  });
  return NextResponse.json(after);
});
