'use client';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import GovernanceWorkspace from './GovernanceWorkspace';
export default function BonusWorkspace() {
  return <ProtectedRoute permission="bonuses"><Layout title="Quản lý thưởng" subtitle="Tổng tiền thưởng phòng ban và thưởng phần trăm nhân sự theo dự án.">
    <div className="space-y-8">
      <GovernanceWorkspace resource="awards" embedded/>
      <GovernanceWorkspace resource="policies" embedded/>
    </div>
  </Layout></ProtectedRoute>;
}
