'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '@/lib/api';
import { effectivePermissions } from '@/lib/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    localStorage.removeItem('hr_token');
    api.get('/auth/me').then(({ data }) => {
        localStorage.setItem('hr_user', JSON.stringify(data));
        setUser(data);
      }).catch(() => { localStorage.removeItem('hr_user'); setUser(null); })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('hr_user', JSON.stringify(data.user));
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
    setUser((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem('hr_user', JSON.stringify(next));
      return next;
    });
  }, []);

  const permissions = user ? effectivePermissions(user.role, user.permissions) : {};
  const can = (module, action = 'view') => Boolean(permissions[module]?.[action]);
  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading, ready, can, isManager: user && (['admin', 'director', 'manager'].includes(user.role) || Object.values(permissions).some((value) => value.manage)) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
