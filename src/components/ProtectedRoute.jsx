'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({ children, managerOnly = false, permission }) {
  const { user, isManager, ready, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pagePermission = permission || ({ '/': 'dashboard', '/nhan-vien': 'employees', '/so-do-to-chuc': 'organization', '/phong-ban': 'departments', '/bao-cao': 'reports', '/timeline': 'tasks', '/kpi': 'kpi' })[pathname];
  const denied = (managerOnly && !isManager) || (pagePermission && !can(pagePermission)) || (pathname === '/phan-quyen' && user?.role !== 'admin');

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (denied) router.replace('/ho-so');
  }, [ready, user, denied, router]);

  if (!ready || !user || denied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-sm text-slate">Đang tải...</div>
      </div>
    );
  }

  return children;
}
