import { NextResponse } from 'next/server';
import { GovernanceError } from './governance-validation';
export async function governanceResponse(work, status = 200) {
  try { return NextResponse.json(await work(), { status }); }
  catch (error) {
    if (error instanceof GovernanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (['23505','23503','23514','22003','22P02'].includes(error.code)) return NextResponse.json({ error: error.code === '23505' ? 'Mã hoặc dữ liệu liên kết bị trùng. Kiểm tra lại trước khi lưu.' : 'Dữ liệu liên kết hoặc giá trị không hợp lệ.' }, { status: 400 });
    throw error;
  }
}
