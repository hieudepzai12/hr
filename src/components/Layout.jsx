'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Menu } from 'lucide-react';
import { getTaskAlerts } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AccountMenu from './AccountMenu';
import Sidebar from './Sidebar';
import NavigationSearch from './NavigationSearch';

export default function Layout({ title, subtitle, actions, children }) {
  const pathname = usePathname();
  const { user, can } = useAuth();
  const canViewTasks = can('tasks');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const notificationPanel = useRef(null);
  const userId = user?.id;

  useEffect(() => { queueMicrotask(() => setCollapsed(localStorage.getItem('hr-sidebar-collapsed') === 'true')); }, []);
  useEffect(() => { queueMicrotask(() => { setMobileOpen(false); setNotificationsOpen(false); }); }, [pathname]);
  useEffect(() => {
    if (!userId || !canViewTasks) return;
    let active = true;
    const refresh = () => getTaskAlerts(userId).then(({ data }) => {
      if (active) setAlerts(data.alerts || []);
    }).catch(() => {});
    refresh();
    const interval = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [userId, canViewTasks, pathname]);
  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOutside = (event) => { if (!notificationPanel.current?.contains(event.target)) setNotificationsOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('focusin', closeOutside); };
  }, [notificationsOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const sidebar = document.getElementById('app-sidebar');
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar?.querySelector('a,button')?.focus();
    const keyboard = (event) => {
      if (event.key !== 'Tab') return;
      const nodes = [...(sidebar?.querySelectorAll('a[href],button:not([disabled])') || [])].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const media = window.matchMedia('(min-width: 1024px)');
    const resize = () => { if (media.matches) setMobileOpen(false); };
    document.addEventListener('keydown', keyboard);
    media.addEventListener('change', resize);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); media.removeEventListener('change', resize); previous?.focus?.(); };
  }, [mobileOpen]);
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
  return <div className="app-shell min-h-screen w-full max-w-full overflow-x-clip bg-paper lg:flex">
    <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3">Đến nội dung chính</a>
    {mobileOpen && <button type="button" aria-label="Đóng menu" className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onToggle={toggleCollapsed} />
    <div inert={mobileOpen} className="w-full min-w-0 max-w-full lg:flex-1">
      <header className="app-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:min-h-[72px] sm:px-6 lg:px-7">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="lg:hidden"><button type="button" aria-label="Mở menu" aria-controls="app-sidebar" aria-expanded={mobileOpen} onClick={() => { setNotificationsOpen(false); setMobileOpen(true); }} className="icon-button shrink-0 focus-ring"><Menu size={20} /></button></div>
          <div className="min-w-0 py-3">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">{title}</h1>
            {subtitle && <p className="mt-0.5 hidden truncate text-xs text-slate sm:block sm:text-sm">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NavigationSearch />
          {canViewTasks && <div ref={notificationPanel} className="relative">
            <button type="button" aria-label={`Thông báo công việc: ${alerts.length}`} aria-expanded={notificationsOpen} title="Thông báo công việc" onClick={() => setNotificationsOpen((current) => !current)} className="icon-button relative">
              <Bell size={19} />{alerts.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-clay px-1.5 text-[10px] font-semibold text-white">{alerts.length > 99 ? '99+' : alerts.length}</span>}
            </button>
            {notificationsOpen && <div className="fixed left-3 right-3 top-[72px] z-30 rounded-xl border border-line bg-white p-4 shadow-xl sm:left-auto sm:top-20 sm:w-[340px] lg:absolute lg:right-0 lg:top-12" role="region" aria-label="Thông báo công việc">
              <div className="mb-2 text-sm font-semibold">Việc cần chú ý</div>
              {alerts.length ? <div className="max-h-64 space-y-1 overflow-auto">{alerts.slice(0, 8).map((task) => <Link key={task.id} href="/timeline" className="block rounded-lg px-2 py-2 text-sm hover:bg-paper"><span className="block truncate font-medium">{task.title}</span><span className="text-xs text-clay">{task.alert.label}</span></Link>)}</div> : <p className="text-sm text-slate">Không có cảnh báo mới.</p>}
              <Link href="/timeline" className="mt-2 block border-t border-line pt-2 text-sm font-medium text-teal">Xem công việc</Link>
            </div>}
          </div>}
          <AccountMenu onOpen={()=>setNotificationsOpen(false)} />
        </div>
      </header>
      <main id="app-main" tabIndex={-1} className="app-main mx-auto w-full min-w-0 max-w-[1800px] px-3 py-4 sm:px-6 sm:py-6 lg:px-7">
        {actions && <div className="mb-5 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        {children}
      </main>
    </div>
  </div>;
}
