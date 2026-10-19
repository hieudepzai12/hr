'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { scopeFor } from '@/lib/access';
import { GOVERNANCE, vnd } from '@/lib/governance-config';
export default function ManagementInsights({compact=false}){
  const {user}=useAuth();const enabled=scopeFor(user,'insights','view')!=='none';
  const [month,setMonth]=useState('');const [data,setData]=useState(null);const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!enabled)return;setData(null);setError('');try{const {data}=await api.get('/governance/insights',{params:{month:month||undefined}});setData(data);}catch(err){setError(err.response?.data?.error||'Không tải được báo cáo quản trị');}},[enabled,month]);
  useEffect(()=>{const timer=setTimeout(load,0);return()=>clearTimeout(timer);},[load]);
  if(!enabled)return null;
  return <section className="ui-card my-5 min-w-0 p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Tổng hợp quản trị</h2><p className="mt-1 text-xs text-slate">Số liệu trong phạm vi được xem; tiền chỉ tổng hợp các bản đã duyệt.</p></div><label className="text-xs text-slate">Tháng định biên / ngân sách<input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="ui-field mt-1"/></label></div>{error?<div role="alert" className="ui-notice">{error}<button onClick={load} className="ml-3 underline">Thử lại</button></div>:!data?<p role="status" className="text-sm text-slate">Đang tổng hợp...</p>:!data.summaries.length?<p className="ui-empty">Chưa được cấp quyền xem dữ liệu các phân hệ.</p>:<div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{data.summaries.map(summary=>{
    const total=summary.groups.reduce((sum,item)=>sum+item.count,0);const maximum=Math.max(1,...summary.groups.map(item=>item.count));
    return <div key={summary.resource} className="min-w-0 rounded-lg border border-line p-4"><Link href={GOVERNANCE[summary.resource]?.path||'/nhan-vien'} className="font-semibold text-teal hover:underline">{summary.title}</Link><p className="my-2 text-2xl font-bold">{total}<span className="ml-2 text-xs font-normal text-slate">bản ghi</span></p>{!summary.groups.length?<p className="text-xs text-slate">Chưa có dữ liệu</p>:<div className="space-y-3">{summary.groups.slice(0,compact?3:30).map(group=><div key={`${group.department_id||'company'}-${group.month||''}`}><div className="mb-1 flex flex-wrap justify-between gap-1 text-xs"><span className="min-w-0 break-words">{group.department_name||'Toàn công ty'}{group.month?' / '+group.month.split('-').reverse().join('/'):''}</span><span>{group.count}</span></div><div className="progress-track" role="img" aria-label={`${group.department_name||'Toàn công ty'}: ${group.count} bản ghi`}><div className="progress-fill" style={{width:`${group.count/maximum*100}%`}}/></div>{group.approved_amount!==null&&<p className="mt-1 text-xs font-medium">Đã duyệt: {vnd(group.approved_amount)}</p>}{group.target_count!=null&&<p className="mt-1 text-xs">Định biên: {group.target_count} người</p>}</div>)}</div>}</div>;
  })}</div>}</section>;
}
