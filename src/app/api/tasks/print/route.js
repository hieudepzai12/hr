import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { buildTaskPlanQuery } from '@/lib/task-plan';

export const GET = withAuth(async (req, ctx, user) => {
  const viewScope = scopeFor(user, 'tasks', 'view');
  const printScope = scopeFor(user, 'tasks', 'print');
  if (viewScope === 'none' || printScope === 'none') return forbidden();
  const searchParams = new URL(req.url).searchParams;
  const filters = Object.fromEntries(['assignee_id', 'department_id', 'customer_id', 'status', 'from', 'to']
    .filter((key) => searchParams.get(key)).map((key) => [key, searchParams.get(key)]));
  let plan;
  try { plan = buildTaskPlanQuery({ userId: user.id, departmentId: user.department_id, viewScope, printScope, filters }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const { rows } = await query(plan.sql, plan.params);
  const rank = { self: 1, department: 2, all: 3 };
  const scope = rank[viewScope] < rank[printScope] ? viewScope : printScope;
  return NextResponse.json({ tasks: rows, scope, filters, printed_at: new Date().toISOString() });
});
