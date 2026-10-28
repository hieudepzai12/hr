import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import EmployeeProfile from '@/components/EmployeeProfile';

export default async function EmployeeDetailPage({ params }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <ProtectedRoute permission="profiles"><Layout title="Thông tin nhân viên"
    actions={<Link href="/nhan-vien" className="ui-button ui-button-secondary">Về danh sách nhân viên</Link>}>
    <div className="ui-card p-4 sm:p-6"><EmployeeProfile id={id} inline showIdentity /></div>
  </Layout></ProtectedRoute>;
}
