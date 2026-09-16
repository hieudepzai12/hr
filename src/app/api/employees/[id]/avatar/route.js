import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { savePublicAvatar, deletePublicAvatar } from '@/lib/uploads';

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const targetId = Number(id);
  const isManager = ['admin', 'manager'].includes(user.role);
  if (!isManager && user.id !== targetId) {
    return forbidden('Bạn chỉ có thể cập nhật ảnh đại diện của chính mình');
  }

  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [targetId]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });

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

  try {
    const avatarUrl = await savePublicAvatar(file, targetId);
    if (emp.avatar_path) await deletePublicAvatar(emp.avatar_path);
    await query('UPDATE employees SET avatar_path = $1 WHERE id = $2', [avatarUrl, targetId]);
    return NextResponse.json({ avatar_path: avatarUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const targetId = Number(id);
  const isManager = ['admin', 'manager'].includes(user.role);
  if (!isManager && user.id !== targetId) return forbidden();

  const emp = await queryOne('SELECT * FROM employees WHERE id = $1', [targetId]);
  if (!emp) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 });

  if (emp.avatar_path) await deletePublicAvatar(emp.avatar_path);
  await query('UPDATE employees SET avatar_path = NULL WHERE id = $1', [targetId]);
  return NextResponse.json({ success: true });
});
