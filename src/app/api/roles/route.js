import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { listRoles } from '@/lib/role-permissions';

export const GET = withAuth(async () => NextResponse.json((await listRoles()).map(({ role, label }) => ({ role, label }))));
