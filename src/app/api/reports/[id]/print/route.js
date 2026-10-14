import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report || report.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canReport(user, 'view', report) || !canReport(user, 'print', report)) return forbidden();
  const { rows: items } = await query('SELECT task_id, employee_id, snapshot, leader_opinion FROM report_items WHERE report_id=$1 ORDER BY id', [id]);
  await transaction((client) => writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
    action: 'print_preview', after: { version: report.version }, version: report.version }));
  return NextResponse.json({ report, items, printed_at: new Date().toISOString() });
});
