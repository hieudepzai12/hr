import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport, saveReportVersion } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (Number(before.employee_id) === Number(user.id) || !canReport(user, 'approve', before)) return forbidden();
  if (!['submitted', 'reviewed'].includes(before.status)) return NextResponse.json({ error: 'Báo cáo không ở trạng thái chờ duyệt' }, { status: 409 });
  const body = await req.json().catch(() => null);
  if (!['reviewed', 'approved', 'rejected'].includes(body?.status) ||
    typeof body.feedback !== 'string' || body.feedback.length > 10000 ||
    (body.item_opinions !== undefined && (!Array.isArray(body.item_opinions) || body.item_opinions.length > 100))) {
    return NextResponse.json({ error: 'Nội dung duyệt không hợp lệ' }, { status: 400 });
  }
  const after = await transaction(async (client) => {
    for (const item of body.item_opinions || []) {
      if (!Number.isSafeInteger(Number(item.id)) || typeof item.opinion !== 'string' || item.opinion.length > 10000) {
        const error = new Error('Ý kiến từng dòng không hợp lệ'); error.code = 'INVALID_OPINION'; throw error;
      }
      const result = await client.query('UPDATE report_items SET leader_opinion=$1 WHERE id=$2 AND report_id=$3', [item.opinion, item.id, id]);
      if (!result.rowCount) { const error = new Error('Dòng báo cáo không tồn tại'); error.code = 'INVALID_OPINION'; throw error; }
    }
    const { rows } = await client.query(`UPDATE reports SET status=$1, feedback=$2,
      reviewed_at=NOW(), reviewed_by=$3, version=version+1, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [body.status, body.feedback, user.id, id]);
    await saveReportVersion(client, id, user.id);
    await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
      action: body.status === 'approved' ? 'approve' : body.status === 'rejected' ? 'reject' : 'review',
      before, after: rows[0], reason: body.feedback, version: rows[0].version });
    return rows[0];
  }).catch((error) => error.code === 'INVALID_OPINION' ? null : Promise.reject(error));
  if (!after) return NextResponse.json({ error: 'Ý kiến từng dòng không hợp lệ' }, { status: 400 });
  return NextResponse.json(after);
});
