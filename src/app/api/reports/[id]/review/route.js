import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const { status, feedback } = await req.json();
  if (!['reviewed', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
  }
  const { rows } = await query(
    `UPDATE reports SET status = $1, feedback = $2, reviewed_at = NOW(), reviewed_by = $3 WHERE id = $4 RETURNING *`,
    [status, feedback || null, user.id, id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
  return NextResponse.json(rows[0]);
}, { roles: ['admin', 'manager'] });
