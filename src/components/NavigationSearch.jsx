'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { visibleNavigation, flattenNavigation } from '@/lib/navigation';
export default function NavigationSearch(){
  const {user,can}=useAuth();const [search,setSearch]=useState('');
  const container=useRef(null);const resultsId=useId();
  useEffect(()=>{
    const close=event=>{if(!container.current?.contains(event.target))setSearch('');};
    document.addEventListener('pointerdown',close);document.addEventListener('focusin',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('focusin',close);};
  },[]);
  const entries=flattenNavigation(visibleNavigation(user,can).flatMap(group=>group.items)).filter(item=>item.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <div ref={container} onKeyDown={event=>{if(event.key==='Escape'){setSearch('');container.current?.querySelector('input')?.focus();}}} className="relative hidden w-44 min-w-0 lg:block xl:w-56"><label className="relative block"><span className="sr-only">Tìm chức năng</span><Search size={15} className="absolute left-3 top-3 text-slate"/><input autoComplete="off" aria-controls={search?resultsId:undefined} value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'&&search){e.preventDefault();container.current?.querySelector('a')?.focus();}}} placeholder="Tìm chức năng..." className="ui-field pl-9"/></label>{search&&<div id={resultsId} className="absolute right-0 top-12 z-30 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-xl">{entries.length?entries.map(item=><Link key={item.to} href={item.to} onClick={()=>setSearch('')} className="block rounded px-3 py-2 text-sm hover:bg-paper">{item.label}</Link>):<p className="p-3 text-sm text-slate">Không tìm thấy chức năng được cấp quyền.</p>}</div>}</div>;
}
