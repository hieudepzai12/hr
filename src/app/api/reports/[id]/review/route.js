import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

export const PUT = withAuth(async () => NextResponse.json({ error: 'Báo cáo công việc không còn sử dụng quy trình phê duyệt' }, { status: 410 }));
