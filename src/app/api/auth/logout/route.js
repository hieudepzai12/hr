import { NextResponse } from 'next/server';

export async function POST(req) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const response = NextResponse.json({ success: true });
  response.cookies.delete('hr_session');
  return response;
}
