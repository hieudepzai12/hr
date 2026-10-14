import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor, scopeAllows, scopedWhere } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const GET = withAuth(async (req, ctx, user) => {
  if (scopeFor(user, 'customers', 'view') === 'none') return forbidden();
  const { searchParams } = new URL(req.url);
  const { sql, params } = scopedWhere(user, 'customers', 'view', 'c', 'owner_id', 'department_id');
  const active = searchParams.get('active');
  const { rows } = await query(`SELECT c.*, e.full_name AS owner_name, d.name AS department_name
    FROM customers c LEFT JOIN employees e ON e.id = c.owner_id
    LEFT JOIN departments d ON d.id = c.department_id
    WHERE ${sql} ${active === '1' ? "AND c.status = 'active'" : ''} ORDER BY c.name, c.id`, params);
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || name.length < 2 || name.length > 300) {
    return NextResponse.json({ error: 'Mã hoặc tên khách hàng không hợp lệ' }, { status: 400 });
  }
  const ownerId = body.owner_id ? Number(body.owner_id) : user.id;
  const departmentId = body.department_id ? Number(body.department_id) : user.department_id;
  if (!scopeAllows(user, 'customers', 'create', { ownerId, departmentId })) return forbidden();
  try {
    const customer = await transaction(async (client) => {
      const { rows } = await client.query(`INSERT INTO customers
        (code, name, short_name, customer_group, owner_id, department_id, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name, body.short_name || null, body.customer_group || null, ownerId, departmentId, body.notes || null]);
      await writeAudit(client, { entityType: 'customer', entityId: rows[0].id, actorId: user.id, action: 'create', after: rows[0] });
      return rows[0];
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Mã khách hàng đã tồn tại' }, { status: 409 });
    throw error;
  }
});
