'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, KeyRound, UserRound } from 'lucide-react';
import Avatar from './Avatar';
import PasswordDialog from './PasswordDialog';
import { useAuth } from '@/context/AuthContext';
import { notify } from '@/lib/feedback';

export default function AccountMenu({ onOpen }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const container = useRef(null), trigger = useRef(null), lastItem = useRef(false);
  const menuId = useId();
  useEffect(()=>{ queueMicrotask(()=>setOpen(false)); },[pathname]);
  useEffect(()=>{
    if (!open) return;
    const items=container.current?.querySelectorAll('[role=menuitem]');
    (lastItem.current ? items?.[items.length-1] : items?.[0])?.focus();
    const outside=event=>{if(!container.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside); document.addEventListener('focusin',outside);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
  },[open]);
  const keyboard=event=>{
    if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const items=[...container.current.querySelectorAll('[role=menuitem]')];
    const index=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  };
  const changePassword=()=>{setOpen(false);trigger.current?.focus();setPasswordOpen(true);};
  return <div ref={container} className="relative">
    <button ref={trigger} type="button" aria-label="Mở menu tài khoản" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={()=>{lastItem.current=false;if(!open)onOpen?.();setOpen(value=>!value);}}
      onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();lastItem.current=event.key==='ArrowUp';onOpen?.();setOpen(true);}}}
      className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-paper focus-ring">
      <Avatar name={user?.full_name} color={user?.avatar_color} avatarPath={user?.avatar_path} size={32}/>
      <span className="hidden max-w-36 text-left md:block"><span className="block truncate text-sm font-semibold text-ink">{user?.full_name}</span><span className="block truncate text-xs text-slate">{user?.role_label||user?.role}</span></span>
      <ChevronDown size={14} className="text-slate" aria-hidden="true"/>
    </button>
    {open&&<div id={menuId} role="menu" aria-label="Tài khoản cá nhân" onKeyDown={keyboard} className="absolute right-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-24px)] rounded-xl border border-line bg-white p-1.5 shadow-xl">
      <Link role="menuitem" tabIndex={-1} href="/ho-so" onClick={()=>setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-paper focus-ring"><UserRound size={16} aria-hidden="true"/>Thông tin cá nhân</Link>
      <button role="menuitem" tabIndex={-1} type="button" onClick={changePassword} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper focus-ring"><KeyRound size={16} aria-hidden="true"/>Đổi mật khẩu</button>
    </div>}
    {passwordOpen&&createPortal(<PasswordDialog onClose={()=>setPasswordOpen(false)} onSaved={()=>{void notify('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');logout();router.replace('/login');}}/>,document.body)}
  </div>;
}
