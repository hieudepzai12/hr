'use client';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfilesPanel from '@/components/ProfilesPanel';

// Retain the existing lookup URL and its scoped permissions without a personal-profile tab.
export default function Page() {
  return <ProtectedRoute permission="profiles"><Layout title="Tra cứu hồ sơ nhân sự"><ProfilesPanel /></Layout></ProtectedRoute>;
}
