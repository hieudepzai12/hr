'use client';
import {useState} from 'react';
import {Eye} from 'lucide-react';
import Avatar from '@/components/Avatar';
import EmployeeProfile from '@/components/EmployeeProfile';
import Pagination from '@/components/Pagination';
import usePagedList from '@/lib/usePagedList';
import {useAuth} from '@/context/AuthContext';
import {scopeFor} from '@/lib/access';
export default function ProfilesPanel(){
 const {user}=useAuth();const [search,setSearch]=useState(''),[viewing,setViewing]=useState(null);
 const {items,loading,error,pagination}=usePagedList('/profiles',{search:search||undefined});
 return <section aria-label="Profile nhân sự"><p className="mb-4 text-sm text-slate">{scopeFor(user,'profiles','view')==='all'?'Bạn được xem toàn bộ hồ sơ nhân sự.':scopeFor(user,'profiles','view')==='department'?'Bạn được xem hồ sơ nhân sự trong phòng ban của mình.':'Bạn chỉ được xem hồ sơ của bản thân.'}</p>
  <label className="mb-4 block max-w-md text-sm">Tìm hồ sơ<input className="ui-field mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm theo tên hoặc email..."/></label>
  {error?<p role="alert" className="ui-notice">{error}</p>:loading?<p role="status" className="ui-card ui-empty">Đang tải hồ sơ...</p>:!items.length?<p className="ui-card ui-empty">Không có hồ sơ phù hợp.</p>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(emp=><article key={emp.id} className="ui-card min-w-0 p-4"><div className="flex min-w-0 items-center gap-3"><Avatar name={emp.full_name} color={emp.avatar_color} avatarPath={emp.avatar_path} size={40}/><div className="min-w-0"><h2 className="break-words font-semibold">{emp.full_name}</h2><p className="break-all text-xs text-slate">{emp.email}</p></div></div><p className="mt-3 break-words text-sm">{emp.position||'Chưa cập nhật chức vụ'}</p><p className="mt-1 text-sm text-slate">{emp.department_name||'Chưa phân phòng ban'}</p><button type="button" className="ui-button mt-3" onClick={()=>setViewing(emp.id)}><Eye size={16}/>Xem hồ sơ</button></article>)}</div>}
  <Pagination {...pagination}/>
  {viewing&&<EmployeeProfile key={viewing} id={viewing} onClose={()=>setViewing(null)}/>}
 </section>;
}
