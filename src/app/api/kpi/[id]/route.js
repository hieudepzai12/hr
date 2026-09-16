import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const DELETE = withAuth(async (req, { params }) => {
  const { id } = await params;
  await query('DELETE FROM kpi_evaluations WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}, { roles: ['admin', 'manager'] });
