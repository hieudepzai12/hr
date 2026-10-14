import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM customers WHERE id = $1', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 });
  if (!scopeAllows(user, 'customers', 'edit', { ownerId: before.owner_id, departmentId: before.department_id })) return forbidden();
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || name.length < 2 || name.length > 300 || !['active', 'inactive'].includes(body.status)) {
    return NextResponse.json({ error: 'Thông tin khách hàng không hợp lệ' }, { status: 400 });
  }
  const ownerId = body.owner_id ? Number(body.owner_id) : null;
  const departmentId = body.department_id ? Number(body.department_id) : null;
  if (!scopeAllows(user, 'customers', 'edit', { ownerId: ownerId ?? before.owner_id, departmentId: departmentId ?? before.department_id })) return forbidden();
  try {
    const updated = await transaction(async (client) => {
      const { rows } = await client.query(`UPDATE customers SET code=$1, name=$2, short_name=$3,
        customer_group=$4, owner_id=$5, department_id=$6, status=$7, notes=$8, updated_at=NOW()
        WHERE id=$9 RETURNING *`, [code, name, body.short_name || null, body.customer_group || null,
        ownerId, departmentId, body.status, body.notes || null, id]);
      await writeAudit(client, { entityType: 'customer', entityId: Number(id), actorId: user.id, action: 'edit', before, after: rows[0] });
      return rows[0];
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Mã khách hàng đã tồn tại' }, { status: 409 });
    throw error;
  }
});

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const before = await queryOne('SELECT * FROM customers WHERE id = $1', [id]);
  if (!before) return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 });
  if (!scopeAllows(user, 'customers', 'delete', { ownerId: before.owner_id, departmentId: before.department_id })) return forbidden();
  const updated = await transaction(async (client) => {
    const { rows } = await client.query("UPDATE customers SET status='inactive', updated_at=NOW() WHERE id=$1 RETURNING *", [id]);
    await writeAudit(client, { entityType: 'customer', entityId: Number(id), actorId: user.id, action: 'deactivate', before, after: rows[0] });
    return rows[0];
  });
  return NextResponse.json(updated);
});
