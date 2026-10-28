'use client';
import useFeedback from '@/lib/useFeedback';
import Pagination from '@/components/Pagination';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { GOVERNANCE } from '@/lib/governance-config';
function Content(){
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);const [data,setData]=useState(null);const [error,setError]=useFeedback('error');
  useEffect(()=>{let active=true;api.get('/governance/activity',{params:{page,pageSize}}).then(({data})=>{if(active){setData(data);setError('');}}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được nhật ký');});return()=>{active=false;};},[page,pageSize,setError]);
  return <Layout title="Nhật ký hoạt động">{error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status">Đang tải nhật ký...</p>:<><div className="space-y-3">{!data.items.length&&<p className="ui-card ui-empty">Chưa có nhật ký trong phạm vi quyền.</p>}{data.items.map(item=><div key={item.id} className="ui-card p-4 text-sm"><p className="font-semibold">{GOVERNANCE[item.entity_type.split(':')[1]]?.title||item.entity_type} #{item.entity_id}</p><p>{item.actor_name||'Hệ thống'} · {item.action}</p><p className="text-xs text-slate">{new Date(item.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p></div>)}</div><Pagination page={page} pageSize={pageSize} count={data.items.length} hasMore={data.hasMore} onPageChange={next=>{setData(null);setPage(next);}} onPageSizeChange={size=>{setData(null);setPage(1);setPageSize(size);}} /></>}</Layout>;
}
export default function Page(){return <ProtectedRoute permission="activity"><Content/></ProtectedRoute>;}
