import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport, replaceReportItems, saveReportVersion } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (Number(before.employee_id) !== Number(user.id) || !canReport(user, 'edit', before)) return forbidden();
  if (!['draft', 'reopened', 'rejected'].includes(before.status)) return NextResponse.json({ error: 'Báo cáo không ở trạng thái có thể gửi' }, { status: 409 });
  const after = await transaction(async (client) => {
    const { rows: currentItems } = await client.query('SELECT task_id FROM report_items WHERE report_id=$1 ORDER BY id', [id]);
    if (currentItems.length) await replaceReportItems(client, id, currentItems.map((item) => item.task_id), user.id);
    const { rows } = await client.query(`UPDATE reports SET status='submitted', submitted_at=NOW(),
      version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id]);
    await saveReportVersion(client, id, user.id);
    await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
      action: 'submit', before, after: rows[0], version: rows[0].version });
    return rows[0];
  });
  return NextResponse.json(after);
});
