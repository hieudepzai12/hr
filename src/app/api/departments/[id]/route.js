import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { name, description } = await req.json();
  const { rows } = await query(
    'UPDATE departments SET name = $1, description = $2 WHERE id = $3 RETURNING *',
    [name, description || null, id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy phòng ban' }, { status: 404 });
  return NextResponse.json(rows[0]);
}, { roles: ['admin', 'manager'] });

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  await query('DELETE FROM departments WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin'] });
