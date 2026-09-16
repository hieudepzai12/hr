import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { readPrivateAttachment, deletePrivateAttachment } from '@/lib/uploads';

function canAccessTask(task, user) {
  if (['admin', 'manager'].includes(user.role)) return true;
  return task.assignee_id === user.id;
}

export const GET = withAuth(async (req, { params }, user) => {
  const { id, attachmentId } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!canAccessTask(task, user)) return forbidden();

  const att = await queryOne(
    `SELECT * FROM attachments WHERE id = $1 AND entity_type = 'task' AND entity_id = $2`,
    [attachmentId, id]
  );
  if (!att) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 });

  const buffer = await readPrivateAttachment(att.stored_path);
  if (!buffer) return NextResponse.json({ error: 'File không tồn tại trên máy chủ' }, { status: 404 });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': att.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`,
    },
  });
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id, attachmentId } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!canAccessTask(task, user)) return forbidden();

  const att = await queryOne(
    `SELECT * FROM attachments WHERE id = $1 AND entity_type = 'task' AND entity_id = $2`,
    [attachmentId, id]
  );
  if (!att) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 });

  await deletePrivateAttachment(att.stored_path);
  await query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
  return NextResponse.json({ success: true });
});
