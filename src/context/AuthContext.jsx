'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import api, { SESSION_EXPIRED_EVENT } from '@/lib/api';
import { effectivePermissions } from '@/lib/permissions';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const expireSession = () => {
      setUser(null);
      if (window.location.pathname !== '/login') router.replace('/login');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    api.get('/auth/me').then(({ data }) => {
        setUser(data);
      }).catch(() => { localStorage.removeItem('hr_user'); setUser(null); })
      .finally(() => setReady(true));
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [router]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Đăng nhập thất bại' };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('hr_user');
    setUser(null);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => ({ ...prev, ...partial }));
  }, []);

  const permissions = useMemo(() => user ? effectivePermissions(user.role, user.permissions) : {}, [user]);
  const can = useCallback((module, action = 'view') => Boolean(permissions[module]?.[action]), [permissions]);
  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading, ready, can, isManager: user && (['admin', 'director', 'manager'].includes(user.role) || Object.values(permissions).some((value) => value.manage)) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
