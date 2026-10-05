'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Users, Building2, Network, FileText, CalendarClock, Target, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Avatar from './Avatar';

const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: LayoutGrid, exact: true },
  { to: '/nhan-vien', label: 'Nhân viên', icon: Users },
  { to: '/so-do-to-chuc', label: 'Sơ đồ tổ chức', icon: Network },
  { to: '/phong-ban', label: 'Phòng ban', icon: Building2 },
  { to: '/bao-cao', label: 'Báo cáo', icon: FileText },
  { to: '/timeline', label: 'Timeline & Deadline', icon: CalendarClock },
  { to: '/kpi', label: 'Đánh giá KPI', icon: Target },
  { to: '/phan-quyen', label: 'Phân quyền', icon: ShieldCheck, adminOnly: true },
];

const NAV_GROUPS = [
  { label: 'Tổng quan', paths: ['/'] },
  { label: 'Nhân sự', paths: ['/nhan-vien', '/so-do-to-chuc', '/phong-ban'] },
  { label: 'Công việc & đánh giá', paths: ['/bao-cao', '/timeline', '/kpi'] },
  { label: 'Quản trị', paths: ['/phan-quyen'] },
];

const PERMISSION_BY_PATH = {
  '/': 'dashboard', '/nhan-vien': 'employees', '/so-do-to-chuc': 'organization',
  '/phong-ban': 'departments', '/bao-cao': 'reports', '/timeline': 'tasks', '/kpi': 'kpi',
};

export default function Sidebar() {
  const { user, logout, can } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-[#effaff] text-ink border-r border-[#d4e8ee]">
      <div className="px-6 py-6 border-b border-[#d4e8ee] flex flex-col items-start text-left">
        <Link href="/" aria-label="Trang chủ" className="inline-block focus-ring rounded-xl"><Image src="/otis-logo.svg" alt="Logo" width={88} height={88} priority /></Link>
        <div className="text-xs text-slate mt-2">Hệ thống quản lý nhân sự</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng chính">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => group.paths.includes(item.to) &&
            (!item.adminOnly || user?.role === 'admin') &&
            (item.adminOnly || can(PERMISSION_BY_PATH[item.to])));
          if (items.length === 0) return null;
          return <div key={group.label} className="mb-4 last:mb-0">
            <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate">{group.label}</div>
            <div className="flex flex-col gap-0.5">{items.map(({ to, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === to : pathname.startsWith(to);
              return <Link key={to} href={to} aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors focus-ring ${isActive ? 'bg-teal text-white font-medium' : 'text-ink/75 hover:bg-white/70 hover:text-ink'}`}>
                <Icon size={17} strokeWidth={2} />{label}
              </Link>;
            })}</div>
          </div>;
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[#d4e8ee]">
        <Link href="/ho-so" aria-label="Xem hồ sơ của tôi" aria-current={pathname === '/ho-so' ? 'page' : undefined} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors focus-ring ${pathname === '/ho-so' ? 'bg-white/80' : 'hover:bg-white/70'}`}>
          <Avatar name={user?.full_name} color={user?.avatar_color} avatarPath={user?.avatar_path} size={36} />
          <div className="min-w-0">
            <div className="text-sm text-ink truncate">{user?.full_name}</div>
            <div className="text-xs text-slate truncate">
              {user?.role_label || (user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'director' ? 'Giám đốc' : user?.role === 'manager' ? 'Quản lý' : 'Nhân viên')}
            </div>
          </div>
        </Link>
        <button
          onClick={logout}
          className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ink/70 hover:bg-white/70 hover:text-ink transition-colors focus-ring"
        >
          <LogOut size={16} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
