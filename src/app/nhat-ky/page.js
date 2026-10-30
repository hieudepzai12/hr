'use client';
import useFeedback from '@/lib/useFeedback';
import Pagination from '@/components/Pagination';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { GOVERNANCE } from '@/lib/governance-config';
import { useAuth } from '@/context/AuthContext';
import { scopeFor } from '@/lib/access';
import DateInput from '@/components/DateInput';
const actions={leader_opinion:'Ghi ý kiến lãnh đạo',create:'Tạo mới',edit:'Chỉnh sửa',update:'Cập nhật',import:'Nhập Excel',delete:'Xóa',restore:'Khôi phục',submit:'Gửi duyệt',approve:'Phê duyệt',approved:'Phê duyệt',review:'Xem xét',reviewed:'Xem xét',reject:'Yêu cầu bổ sung',rejected:'Yêu cầu bổ sung',reopen:'Mở lại',accept:'Nghiệm thu',change_deadline:'Thay đổi hạn chót',permission_change:'Thay đổi phân quyền',reset_password:'Đặt lại mật khẩu',verify:'Xác nhận'};
const locations={task:'Danh sách công việc',report:'Báo cáo công việc',customer:'Danh mục khách hàng',role:'Vai trò và phân quyền'};
function ActivityEntry({item}){
  const location=GOVERNANCE[item.entity_type.split(':')[1]]?.title||locations[item.entity_type]||item.entity_type;
  const actor=item.actor_name||(item.actor_id?`Tài khoản #${item.actor_id}`:'Hệ thống');
  const date=new Date(item.created_at);
  return <article className="ui-card p-4 text-sm" data-activity-id={item.id}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-ink">{item.entity_type==='report'&&item.action==='submit'?'Gửi báo cáo':actions[item.action]||item.action}{item.record_name?` “${item.record_name}”`:` #${item.entity_id}`}</p><p className="mt-1 text-slate">Tại: <strong className="font-medium text-ink">{location}</strong><span className="ml-2 text-xs">#{item.entity_id}</span></p></div><time dateTime={item.created_at} className="shrink-0 text-xs leading-6 text-slate"><span className="block">Ngày: {date.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'})}</span><span className="block">Giờ: {date.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span></time></div>
    <p className="mt-3 border-t border-line pt-3 text-slate">Người thao tác: <strong className="font-semibold text-ink">{actor}</strong></p>
  </article>;
}
function Content(){
  const {user}=useAuth();
  const filterPanel=useRef(null);const activityPanel=useRef(null);const entriesPanel=useRef(null);
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);const [data,setData]=useState(null);const [error,setError]=useFeedback('error');
  const [filters,setFilters]=useState({});
  const [search,setSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);setData(null);setFilters(current=>({...current,search:search.trim()||undefined}));},300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    const update=()=>{if(activityPanel.current)activityPanel.current.style.setProperty('--activity-panel-top',`${Math.max(0,activityPanel.current.getBoundingClientRect().top)}px`);};
    const observer=new ResizeObserver(update);
    if(filterPanel.current)observer.observe(filterPanel.current);
    const header=document.querySelector('.app-header');if(header)observer.observe(header);
    window.addEventListener('resize',update);update();
    return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{if(entriesPanel.current)entriesPanel.current.scrollTop=0;},[page,pageSize,filters]);
  const updateFilter=(key,value)=>{setPage(1);setData(null);setFilters(current=>({...current,[key]:value||undefined}));};

  useEffect(()=>{let active=true;api.get('/governance/activity',{params:{page,pageSize,...filters}}).then(({data})=>{if(active){setData(data);setError('');}}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được nhật ký');});return()=>{active=false;};},[page,pageSize,filters,setError]);
  return <Layout title="Nhật ký hoạt động"><section ref={filterPanel} aria-label="Bộ lọc nhật ký" className="ui-card mb-4 p-3"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="text-sm font-medium sm:col-span-2 xl:col-span-1">Tìm kiếm<input aria-label="Tìm nhật ký" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Người thao tác, nội dung..." className="ui-field mt-1" /></label>
    <label className="text-sm font-medium">Hành động<select aria-label="Lọc hành động" value={filters.action||''} onChange={event=>updateFilter('action',event.target.value)} className="ui-field mt-1"><option value="">Tất cả hành động</option>{Object.entries(actions).filter(([key])=>!['update','approved','reviewed','rejected'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="text-sm font-medium">Mục chức năng<select aria-label="Lọc mục chức năng" value={filters.entity_type||''} onChange={event=>updateFilter('entity_type',event.target.value)} className="ui-field mt-1"><option value="">Tất cả mục</option>{Object.entries(locations).filter(([key])=>key==='role'?user.role==='admin':scopeFor(user,{task:'tasks',report:'reports',customer:'customers'}[key],'view')!=='none').map(([key,label])=><option key={key} value={key}>{label}</option>)}{Object.entries(GOVERNANCE).filter(([,config])=>scopeFor(user,config.module,'view')!=='none').map(([key,config])=><option key={key} value={`governance:${key}`}>{config.title}</option>)}</select></label>
    <DateInput label="Từ ngày" value={filters.from||''} onChange={value=>updateFilter('from',value)} />
    <DateInput label="Đến ngày" value={filters.to||''} onChange={value=>updateFilter('to',value)} />
    </div>{(search||Object.values(filters).some(Boolean))&&<button type="button" onClick={()=>{setSearch('');setFilters({});setPage(1);setData(null);}} className="mt-3 text-sm font-medium text-teal hover:underline">Xóa bộ lọc</button>}</section><div ref={activityPanel} className="activity-panel"><div ref={entriesPanel} className="activity-entries space-y-3" role="region" aria-label="Nhật ký hoạt động, cuộn để xem thêm" tabIndex={0}>{error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status">Đang tải nhật ký...</p>:!data.items.length?<p className="ui-card ui-empty">Chưa có nhật ký phù hợp với bộ lọc.</p>:data.items.map(item=><ActivityEntry key={item.id} item={item} />)}</div>{data&&!error&&<div className="shrink-0 border-t border-line bg-paper pt-2"><Pagination page={page} pageSize={pageSize} count={data.items.length} hasMore={data.hasMore} onPageChange={next=>{setData(null);setPage(next);}} onPageSizeChange={size=>{setData(null);setPage(1);setPageSize(size);}} /></div>}</div></Layout>;
}
export default function Page(){return <ProtectedRoute permission="activity"><Content/></ProtectedRoute>;}
