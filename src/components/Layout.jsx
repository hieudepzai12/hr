'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Avatar from './Avatar';
import Sidebar from './Sidebar';

export default function Layout({ title, subtitle, actions, children }) {
  const pathname = usePathname();
  const { user, can } = useAuth();
  const canViewTasks = can('tasks');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => { queueMicrotask(() => setCollapsed(localStorage.getItem('hr-sidebar-collapsed') === 'true')); }, []);
  useEffect(() => { queueMicrotask(() => { setMobileOpen(false); setNotificationsOpen(false); }); }, [pathname]);
  useEffect(() => {
    if (!user || !canViewTasks) return;
    let active = true;
    const refresh = () => api.get('/tasks/alerts').then(({ data }) => {
      if (active) setAlerts(data.alerts || []);
    }).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [user, canViewTasks, pathname]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { setMobileOpen(false); setNotificationsOpen(false); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  const toggleCollapsed = () => setCollapsed((current) => {
    localStorage.setItem('hr-sidebar-collapsed', String(!current));
    return !current;
  });
  return <div className="app-shell flex min-h-screen w-full bg-paper">
    {mobileOpen && <button type="button" aria-label="Đóng menu" className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onOpen={() => setMobileOpen(true)} onToggle={toggleCollapsed} alertsCount={alerts.length} />
    <div className="ml-14 min-w-0 flex-1 lg:ml-0">
      <header className="app-header sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 py-3">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">{title}</h1>
            {subtitle && <p className="mt-0.5 hidden truncate text-xs text-slate sm:block sm:text-sm">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {canViewTasks && <div className="relative">
            <button type="button" aria-label={`Thông báo công việc: ${alerts.length}`} aria-expanded={notificationsOpen} title="Thông báo công việc" onClick={() => setNotificationsOpen((current) => !current)} className="icon-button relative">
              <Bell size={19} />{alerts.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-clay px-1.5 text-[10px] font-semibold text-white">{alerts.length}</span>}
            </button>
            {notificationsOpen && <div className="absolute right-0 top-12 z-30 w-[min(90vw,340px)] rounded-xl border border-line bg-white p-3 shadow-xl" role="region" aria-label="Thông báo công việc">
              <div className="mb-2 text-sm font-semibold">Việc cần chú ý</div>
              {alerts.length ? <div className="max-h-64 space-y-1 overflow-auto">{alerts.slice(0, 8).map((task) => <Link key={task.id} href="/timeline" className="block rounded-lg px-2 py-2 text-sm hover:bg-paper"><span className="block truncate font-medium">{task.title}</span><span className="text-xs text-clay">{task.alert.label}</span></Link>)}</div> : <p className="text-sm text-slate">Không có cảnh báo mới.</p>}
              <Link href="/timeline" className="mt-2 block border-t border-line pt-2 text-sm font-medium text-teal">Xem công việc</Link>
            </div>}
          </div>}
          <Link href="/ho-so" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-paper focus-ring" aria-label="Mở hồ sơ tài khoản">
            <Avatar name={user?.full_name} color={user?.avatar_color} avatarPath={user?.avatar_path} size={32} />
            <span className="hidden max-w-36 text-left md:block"><span className="block truncate text-sm font-semibold text-ink">{user?.full_name}</span><span className="block truncate text-xs text-slate">{user?.role_label || user?.role}</span></span>
          </Link>
        </div>
      </header>
      <main className="app-main mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {actions && <div className="mb-5 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        {children}
      </main>
    </div>
  </div>;
}
