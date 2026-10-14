import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NOT NULL', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy công việc đã xóa' }, { status: 404 });
  if (!scopeAllows(user, 'tasks', 'restore', { ownerId: before.assignee_id, departmentId: before.department_id })) return forbidden();
  const after = await transaction(async (client) => {
    const { rows } = await client.query('UPDATE tasks SET deleted_at=NULL, deleted_reason=NULL, updated_at=NOW() WHERE id=$1 RETURNING *', [id]);
    await writeAudit(client, { entityType: 'task', entityId: Number(id), actorId: user.id, action: 'restore', before, after: rows[0] });
    return rows[0];
  });
  return NextResponse.json(after);
});
