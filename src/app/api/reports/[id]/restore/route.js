import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || !before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo đã xóa' }, { status: 404 });
  if (!canReport(user, 'restore', before)) return forbidden();
  const after = await transaction(async (client) => {
    const { rows } = await client.query('UPDATE reports SET deleted_at=NULL, deleted_reason=NULL, updated_at=NOW() WHERE id=$1 RETURNING *', [id]);
    await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
      action: 'restore', before, after: rows[0], version: before.version });
    return rows[0];
  });
  return NextResponse.json(after);
});
