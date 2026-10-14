import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (before.employee_id === user.id || !canReport(user, 'approve', before)) return forbidden();
  if (before.status !== 'approved') return NextResponse.json({ error: 'Chỉ báo cáo đã duyệt mới cần mở lại' }, { status: 409 });
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'Cần ghi lý do mở lại' }, { status: 400 });
  const after = await transaction(async (client) => {
    const { rows } = await client.query(`UPDATE reports SET status='reopened', feedback=$1,
      reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3 RETURNING *`, [reason, user.id, id]);
    await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
      action: 'reopen', before, after: rows[0], reason, version: before.version });
    return rows[0];
  });
  return NextResponse.json(after);
});
