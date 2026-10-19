'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { GOVERNANCE } from '@/lib/governance-config';
function Content(){
  const [page,setPage]=useState(1);const [data,setData]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;api.get('/governance/activity',{params:{page}}).then(({data})=>{if(active){setData(data);setError('');}}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được nhật ký');});return()=>{active=false;};},[page]);
  return <Layout title="Nhật ký hoạt động" subtitle="Nhật ký chỉ đọc. Xem giá trị trước/sau trong chi tiết từng bản ghi được cấp quyền.">{error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status">Đang tải nhật ký...</p>:<><div className="space-y-3">{!data.items.length&&<p className="ui-card ui-empty">Chưa có nhật ký trong phạm vi quyền.</p>}{data.items.map(item=><div key={item.id} className="ui-card p-4 text-sm"><p className="font-semibold">{GOVERNANCE[item.entity_type.split(':')[1]]?.title||item.entity_type} #{item.entity_id}</p><p>{item.actor_name||'Hệ thống'} · {item.action}</p><p className="text-xs text-slate">{new Date(item.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p></div>)}</div><div className="mt-4 flex gap-2"><button disabled={page===1} onClick={()=>{setData(null);setPage(page-1);}} className="ui-button ui-button-secondary">Trang trước</button><button disabled={!data.hasMore} onClick={()=>{setData(null);setPage(page+1);}} className="ui-button ui-button-secondary">Trang sau</button></div></>}</Layout>;
}
export default function Page(){return <ProtectedRoute permission="activity"><Content/></ProtectedRoute>;}
