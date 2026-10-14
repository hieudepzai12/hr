import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { writeAudit } from '@/lib/audit';

export const POST = withAuth(async (req, ctx, user) => {
  const view = scopeFor(user, 'reports', 'view');
  const print = scopeFor(user, 'reports', 'print');
  if (view === 'none' || print === 'none') return forbidden();
  const body = await req.json().catch(() => ({}));
  const scopeRank = { none: 0, self: 1, department: 2, all: 3 };
  const scope = scopeRank[view] < scopeRank[print] ? view : print;
  const params = [];
  let where = 'r.deleted_at IS NULL';
  if (scope === 'self') { params.push(user.id); where += ` AND r.employee_id=$${params.length}`; }
  if (scope === 'department') { params.push(user.department_id ?? -1); where += ` AND COALESCE(r.department_id,e.department_id)=$${params.length}`; }
  for (const [key, col] of Object.entries({ employee_id: 'r.employee_id', department_id: 'COALESCE(r.department_id,e.department_id)', customer_id: 'r.customer_id', status: 'r.status' })) {
    if (body?.[key]) { params.push(body[key]); where += ` AND ${col}=$${params.length}`; }
  }
  if (body?.from) { params.push(body.from); where += ` AND r.period_end >= $${params.length}`; }
  if (body?.to) { params.push(body.to); where += ` AND r.period_start <= $${params.length}`; }
  const { rows } = await query(`SELECT r.*, e.full_name AS employee_name, d.name AS department_name,
    COALESCE(jsonb_agg(jsonb_build_object('snapshot',ri.snapshot,'leader_opinion',ri.leader_opinion))
      FILTER (WHERE ri.id IS NOT NULL),'[]'::jsonb) AS items
    FROM reports r JOIN employees e ON e.id=r.employee_id
    LEFT JOIN departments d ON d.id=COALESCE(r.department_id,e.department_id)
    LEFT JOIN report_items ri ON ri.report_id=r.id
    WHERE ${where} GROUP BY r.id,e.full_name,d.name ORDER BY r.created_at DESC LIMIT 500`, params);
  await transaction((client) => writeAudit(client, { entityType: 'report_collection', entityId: 'all',
    actorId: user.id, action: 'print_preview', after: { count: rows.length, filters: body } }));
  return NextResponse.json({ reports: rows, filters: body, printed_at: new Date().toISOString() });
});
