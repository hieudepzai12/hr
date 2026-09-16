'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Users, FileText, CalendarClock, Target, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Avatar from './Avatar';

const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: LayoutGrid, exact: true },
  { to: '/nhan-vien', label: 'Nhân viên', icon: Users, managerOnly: true },
  { to: '/bao-cao', label: 'Báo cáo', icon: FileText },
  { to: '/timeline', label: 'Timeline & Deadline', icon: CalendarClock },
  { to: '/kpi', label: 'Đánh giá KPI', icon: Target },
  { to: '/ho-so', label: 'Hồ sơ của tôi', icon: UserCircle },
];

export default function Sidebar() {
  const { user, logout, isManager } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-ink text-paper-raised">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="font-display text-xl italic text-white">NhanSu</div>
        <div className="text-xs text-white/50 mt-0.5">Hệ thống quản lý nhân sự</div>
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {NAV_ITEMS.filter(item => !item.managerOnly || isManager).map(({ to, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors focus-ring ${
                isActive ? 'bg-teal text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar name={user?.full_name} color={user?.avatar_color} avatarPath={user?.avatar_path} size={36} />
          <div className="min-w-0">
            <div className="text-sm text-white truncate">{user?.full_name}</div>
            <div className="text-xs text-white/50 truncate">
              {user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors focus-ring"
        >
          <LogOut size={16} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
