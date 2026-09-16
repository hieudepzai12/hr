import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { savePrivateAttachment } from '@/lib/uploads';

function canAccessTask(task, user) {
  if (['admin', 'manager'].includes(user.role)) return true;
  return task.assignee_id === user.id;
}

export const GET = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!canAccessTask(task, user)) return forbidden();

  const { rows } = await query(
    `SELECT id, original_name, mime_type, size, created_at FROM attachments
     WHERE entity_type = 'task' AND entity_id = $1 ORDER BY created_at`,
    [id]
  );
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
  if (!canAccessTask(task, user)) return forbidden();

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  }
  const files = formData.getAll('files').filter((f) => typeof f !== 'string');
  if (!files.length) return NextResponse.json({ error: 'Vui lòng chọn file' }, { status: 400 });

  const inserted = [];
  try {
    for (const file of files) {
      const saved = await savePrivateAttachment(file, `tasks/${id}`);
      const { rows } = await query(
        `INSERT INTO attachments (entity_type, entity_id, original_name, stored_path, mime_type, size, uploaded_by)
         VALUES ('task', $1, $2, $3, $4, $5, $6)
         RETURNING id, original_name, mime_type, size, created_at`,
        [id, saved.originalName, saved.storedPath, saved.mimeType, saved.size, user.id]
      );
      inserted.push(rows[0]);
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json(inserted, { status: 201 });
});
