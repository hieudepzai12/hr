import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { saveKpi } from '@/lib/kpi-service';

export const PUT = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  return saveKpi(req, user, id);
}, { roles: ['admin', 'director', 'manager'] });

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  await query('DELETE FROM kpi_evaluations WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin', 'director', 'manager'] });
