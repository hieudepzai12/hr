import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';

function canAccessReport(report, user) {
  if (['admin', 'manager'].includes(user.role)) return true;
  return report.employee_id === user.id;
}

export const GET = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const report = await queryOne(`
    SELECT r.*, e.full_name as employee_name FROM reports r
    JOIN employees e ON r.employee_id = e.id WHERE r.id = $1`, [id]);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canAccessReport(report, user)) return forbidden('Không có quyền xem báo cáo này');
  return NextResponse.json(report);
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const report = await queryOne('SELECT * FROM reports WHERE id = $1', [id]);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  if (!canAccessReport(report, user)) return forbidden('Không có quyền xoá báo cáo này');
  await query('DELETE FROM reports WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
});
