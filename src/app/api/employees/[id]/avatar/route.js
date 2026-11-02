import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { savePublicAvatar, deletePublicAvatar } from '@/lib/uploads';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const targetId = Number(id);
  const isManager = user.permissions.employees.edit;
  if (!isManager && user.id !== targetId) {
    return forbidden('Bạn chỉ có thể cập nhật ảnh đại diện của chính mình');
  }

  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [targetId]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  if (emp.role === 'admin' && user.role !== 'admin') return forbidden();

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  }
  const file = formData.get('avatar');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Vui lòng chọn ảnh' }, { status: 400 });
  }

  let avatarUrl;
  try {
    avatarUrl = await savePublicAvatar(file, targetId);
  } catch {
    return NextResponse.json({ error: 'Không thể lưu ảnh. Hãy chọn ảnh PNG, JPG, WEBP hoặc GIF hợp lệ, tối đa 3 MB.' }, { status: 400 });
  }
  try {
    const result = await query('UPDATE employees SET avatar_path = $1 WHERE id = $2 AND avatar_path IS NOT DISTINCT FROM $3', [avatarUrl, targetId, emp.avatar_path]);
    if (!result.rowCount) {
      await deletePublicAvatar(avatarUrl).catch(() => {});
      return NextResponse.json({ error: 'Ảnh đại diện đã thay đổi. Vui lòng tải lại và thử lại.' }, { status: 409 });
    }
    if (emp.avatar_path) await deletePublicAvatar(emp.avatar_path).catch(() => {});
    return NextResponse.json({ avatar_path: avatarUrl });
  } catch {
    await deletePublicAvatar(avatarUrl).catch(() => {});
    return NextResponse.json({ error: 'Chưa thể cập nhật ảnh đại diện. Vui lòng thử lại.' }, { status: 503 });
  }
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const targetId = Number(id);
  const isManager = user.permissions.employees.edit;
  if (!isManager && user.id !== targetId) return forbidden();

  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [targetId]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });
  if (emp.role === 'admin' && user.role !== 'admin') return forbidden();

  const result = await query('UPDATE employees SET avatar_path = NULL WHERE id = $1 AND avatar_path IS NOT DISTINCT FROM $2', [targetId, emp.avatar_path]);
  if (!result.rowCount) return NextResponse.json({ error: 'Ảnh đại diện đã thay đổi. Vui lòng tải lại và thử lại.' }, { status: 409 });
  if (emp.avatar_path) await deletePublicAvatar(emp.avatar_path).catch(() => {});
  return NextResponse.json({ success: true });
});
