'use client';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import GovernanceWorkspace from './GovernanceWorkspace';
export default function BonusWorkspace() {
  return <ProtectedRoute permission="bonuses"><Layout title="Quản lý thưởng">
    <div className="space-y-8">
      <GovernanceWorkspace resource="awards" embedded/>
      <GovernanceWorkspace resource="policies" embedded/>
    </div>
  </Layout></ProtectedRoute>;
}
