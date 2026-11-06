import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { canAccessKpiEmployee } from '@/lib/access';
import { saveKpi } from '@/lib/kpi-service';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  return saveKpi(req, user, id);
}, { roles: ['admin', 'director', 'manager'] });

export const DELETE = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const employee = await queryOne('SELECT e.id,e.role,e.department_id FROM kpi_evaluations k JOIN employees e ON e.id=k.employee_id WHERE k.id=$1',[id]);
  if (!employee) return NextResponse.json({error:'Không tìm thấy đánh giá KPI'},{status:404});
  if (!canAccessKpiEmployee(user,employee)) return forbidden();
  await query('DELETE FROM kpi_evaluations WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin', 'director', 'manager'] });
