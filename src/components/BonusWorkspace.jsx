'use client';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import GovernanceWorkspace from './GovernanceWorkspace';
export default function BonusWorkspace() {
  return <ProtectedRoute permission="bonuses"><Layout title="Quản lý thưởng">
    <GovernanceWorkspace resource="awards" embedded/>
  </Layout></ProtectedRoute>;
}
