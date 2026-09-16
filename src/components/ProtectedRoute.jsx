'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({ children, managerOnly = false }) {
  const { user, isManager, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (managerOnly && !isManager) router.replace('/');
  }, [ready, user, isManager, managerOnly, router]);

  if (!ready || !user || (managerOnly && !isManager)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-sm text-slate">Đang tải...</div>
      </div>
    );
  }

  return children;
}
