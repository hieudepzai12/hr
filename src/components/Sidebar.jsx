'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { LogOut, PanelLeftClose, PanelLeftOpen, X, ChevronDown, ChevronRight } from 'lucide-react';
import { visibleNavigation, navigationActive } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

function SidebarItem({ item, pathname, compact, onClose, onToggle }) {
  const [expanded, setExpanded] = useState(true);
  const submenuId = useId();
  const Icon = item.icon;
  const active = navigationActive(item, pathname);
  const className = `sidebar-menu-item relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-ring ${compact ? 'justify-center' : ''} ${active ? 'bg-[#294368] text-white' : 'text-[#d4dfed] hover:bg-white/10 hover:text-white'}`;
  if (item.children) return <div>
    <button type="button" className={className} title={compact ? item.label : undefined} aria-label={compact ? item.label : undefined} aria-expanded={!compact && expanded} aria-controls={submenuId} onClick={() => { if (compact) { onToggle(); setExpanded(true); } else setExpanded(!expanded); }}>
      <Icon size={18} className="shrink-0" strokeWidth={1.9} />
      {!compact && <><span className="min-w-0 flex-1">{item.label}</span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</>}
    </button>
    {!compact && expanded && <div id={submenuId} className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
      {item.children.map(child => <SidebarItem key={child.to} item={child} pathname={pathname} compact={false} onClose={onClose} onToggle={onToggle} />)}
    </div>}
  </div>;
  return <Link href={item.to} title={compact ? item.label : undefined} aria-label={compact ? item.label : undefined} aria-current={active ? 'page' : undefined} onClick={onClose} className={`${className} ${active ? 'shadow-[inset_3px_0_0_#78a8f2]' : ''}`}>
    <Icon size={18} className="shrink-0" strokeWidth={1.9} />{!compact && <span className="min-w-0">{item.label}</span>}
  </Link>;
}

export default function Sidebar({ collapsed = false, mobileOpen = false, onClose = () => {}, onToggle = () => {} }) {
  const { user, logout, can } = useAuth();
  const pathname = usePathname();
  const compact = collapsed && !mobileOpen;
  const groups = visibleNavigation(user, can);
  return <aside id="app-sidebar" className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(16rem,100vw)] flex-col border-r border-[#233957] bg-[#14243d] text-white transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible'} ${compact ? 'lg:w-[76px]' : 'lg:w-64'}`}>
    <div className={`flex min-h-[84px] items-center border-b border-white/10 ${mobileOpen ? 'justify-between gap-2 px-4' : 'justify-center px-2'} ${compact ? 'lg:justify-center lg:px-2' : 'lg:justify-between lg:gap-2 lg:px-4'}`}>
      {!compact && <Link href="/" aria-label="HR OTIS – Trang chủ" onClick={onClose} className={`min-w-0 items-center gap-3 rounded-md focus-ring ${mobileOpen ? 'flex' : 'hidden lg:flex'}`}>
        <Image src="/logo-otisminhchau2.png" alt="" width={40} height={40} priority className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />
        <span className="min-w-0"><strong className="block truncate text-sm font-bold tracking-[0.08em]">HR OTIS</strong><span className="block truncate text-[11px] text-slate-300">Quản trị nhân sự</span></span>
      </Link>}
      <button type="button" onClick={() => { if (window.matchMedia('(min-width: 1024px)').matches) onToggle(); else onClose(); }} aria-controls="app-sidebar" aria-label={mobileOpen ? 'Đóng menu' : 'Thu gọn thanh bên'} title={mobileOpen ? 'Đóng menu' : compact ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} className="icon-button shrink-0 focus-ring" style={{ color: '#fff' }}>
        <span className="lg:hidden"><X size={20} /></span>
        <span className="hidden lg:inline-flex">{compact ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</span>
      </button>
    </div>
    <nav className={`flex-1 space-y-5 overflow-y-auto px-3 py-5 ${mobileOpen ? '' : 'max-lg:hidden'}`} aria-label="Điều hướng chính">
      {groups.map((group) => {
        const items = group.items;
        if (!items.length) return null;
        return <div key={group.label}>
          {!compact && <div className="px-3 pb-2 text-[13px] font-semibold leading-5 text-[#b8c8dc]">{group.label}</div>}
          {compact && <div className="mx-3 mb-2 border-t border-white/10" />}
          <div className="space-y-1">{items.map(item => <SidebarItem key={item.to || item.label} item={item} pathname={pathname} compact={compact} onClose={onClose} onToggle={onToggle} />)}</div>
        </div>;
      })}
    </nav>
    <div className={`border-t border-white/10 p-3 ${mobileOpen ? '' : 'max-lg:hidden'}`}>
      <button type="button" onClick={logout} title={compact ? 'Đăng xuất' : undefined} aria-label={compact ? 'Đăng xuất' : undefined} className={`sidebar-menu-item flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[#d4dfed] hover:bg-white/10 hover:text-white focus-ring ${compact ? 'justify-center' : ''}`}>
        <LogOut size={18} />{!compact && 'Đăng xuất'}
      </button>
    </div>
  </aside>;
}
