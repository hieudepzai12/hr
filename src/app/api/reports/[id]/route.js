import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canReport, loadReport, replaceReportItems, saveReportVersion } from '@/lib/report-service';
import { scopeFor } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const GET = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report || report.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canReport(user, 'view', report)) return forbidden();
  const [items, versions, history] = await Promise.all([
    query('SELECT * FROM report_items WHERE report_id=$1 ORDER BY id', [id]),
    query('SELECT version, snapshot, created_at FROM report_versions WHERE report_id=$1 ORDER BY version DESC', [id]),
    query(`SELECT a.*, e.full_name AS actor_name FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id
      WHERE a.entity_type='report' AND a.entity_id=$1 ORDER BY a.created_at DESC, a.id DESC`, [id]),
  ]);
  return NextResponse.json({ ...report, items: items.rows, versions: versions.rows, history: history.rows });
});

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canReport(user, 'edit', before)) return forbidden();
  if (!['draft', 'reopened', 'rejected'].includes(before.status)) {
    return NextResponse.json({ error: 'Báo cáo đã gửi hoặc đã duyệt đang khóa; cần mở lại trước khi sửa' }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 500 ||
    typeof body.content !== 'string' || body.content.length > 100000 ||
    (body.period_start && body.period_end && body.period_start > body.period_end)) {
    return NextResponse.json({ error: 'Nội dung báo cáo không hợp lệ' }, { status: 400 });
  }
  try {
    const after = await transaction(async (client) => {
      const { rows } = await client.query(`UPDATE reports SET title=$1, content=$2, period_start=$3,
        period_end=$4, customer_id=$5, status='draft', version=version+1, updated_at=NOW()
        WHERE id=$6 RETURNING *`,
      [body.title.trim(), body.content, body.period_start || null, body.period_end || null,
        body.customer_id || null, id]);
      if (body.task_ids) await replaceReportItems(client, id, body.task_ids, before.employee_id);
      await saveReportVersion(client, id, user.id);
      await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
        action: 'edit', before, after: rows[0], version: rows[0].version, reason: body.reason });
      return rows[0];
    });
    return NextResponse.json(after);
  } catch (error) {
    if (['INVALID_TASKS', 'TASK_ACCESS'].includes(error.code)) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await loadReport(id);
  if (!before || before.deleted_at) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canReport(user, 'delete', before)) return forbidden();
  if (before.status !== 'draft' && scopeFor(user, 'reports', 'delete') !== 'all') {
    return forbidden('Chỉ người có quyền xóa toàn bộ được xóa báo cáo đã gửi');
  }
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'Cần ghi lý do xóa báo cáo' }, { status: 400 });
  await transaction(async (client) => {
    const { rows } = await client.query('UPDATE reports SET deleted_at=NOW(), deleted_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [reason, id]);
    await writeAudit(client, { entityType: 'report', entityId: Number(id), actorId: user.id,
      action: 'delete', before, after: rows[0], reason, version: before.version });
  });
  return NextResponse.json({ success: true });
});
