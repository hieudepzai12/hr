'use client';
import useFeedback from '@/lib/useFeedback';
import Pagination from './Pagination';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Plus } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { scopeAllows } from '@/lib/access';
import { safeDocumentUrl } from '@/lib/governance-validation';

export default function FolderLinks({ folder, onChanged }) {
  const { user } = useAuth();
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);
  const [data,setData]=useState(null);
  const [error,setError]=useFeedback('error');
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useFeedback('success');
  const canAdd=!folder.deleted_at&&scopeAllows(user,'documents','create',{ownerId:folder.owner_id,departmentId:folder.department_id});
  const load=useCallback(async()=>{
    const {data}=await api.get('/governance/documents',{params:{folder_id:folder.id,page,pageSize}});
    return data;
  },[folder.id,page,pageSize]);
  useEffect(()=>{
    let active=true;
    load().then(data=>{if(active){setData(data);setError('');}}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được link đính kèm');});
    return()=>{active=false;};
  },[load,setError]);
  const save=async event=>{
    event.preventDefault();if(saving)return;
    if(!safeDocumentUrl(form.url)){setError('Nhập link HTTPS hợp lệ, không chứa tài khoản hoặc mật khẩu.');return;}
    setSaving(true);setError('');setNotice('');
    try{
      await api.post('/governance/documents',{name:form.name,folder_id:folder.id,url:form.url.trim(),instructions:form.instructions.trim()||'Mở đường link để truy cập thư mục hoặc tài liệu; quyền truy cập do nơi lưu trữ quản lý.',verification_status:'needs_verification'});
      setForm(null);setNotice('Đã lưu link đính kèm.');
      setData(await load());onChanged?.();
    }catch(err){setError(err.response?.data?.error||'Không lưu được link');}finally{setSaving(false);}
  };
  return <section className="mt-5 min-w-0 border-t border-line pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Link đính kèm</h3>{canAdd&&!form&&<button type="button" onClick={()=>setForm({name:'',url:'',instructions:''})} className="ui-button ui-button-secondary"><Plus size={15}/>Thêm link</button>}</div>
    <p className="mt-1 text-xs text-slate">Link thư mục, Google Drive, SharePoint hoặc tài liệu HTTPS. Trên sơ đồ hiển thị tối đa 5 link mỗi thư mục; xem toàn bộ tại đây.</p>
    {error&&<p role="alert" className="ui-notice mt-3">{error}</p>}
    {form&&<form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-line bg-paper p-4">
      <label className="block text-sm font-medium">Tên link <span className="required-mark">*</span><input className="ui-field mt-1" required maxLength={2000} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="block text-sm font-medium">Đường dẫn HTTPS <span className="required-mark">*</span><input className="ui-field mt-1" type="url" required maxLength={2000} placeholder="https://..." value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
      <label className="block text-sm font-medium">Hướng dẫn truy cập<textarea className="ui-field mt-1" rows={2} maxLength={20000} value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})}/></label>
      <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={()=>setForm(null)} className="ui-button ui-button-secondary">Hủy</button><button disabled={saving} className="ui-button ui-button-primary">{saving?'Đang lưu...':'Lưu link'}</button></div>
    </form>}
    {!data&&!error?<p role="status" className="mt-3 text-sm text-slate">Đang tải link...</p>:data&&<>
      {!data.items.length?<p className="mt-3 text-sm text-slate">Chưa có link đính kèm trong phạm vi được xem.</p>:<ul className="mt-3 divide-y divide-line">{data.items.map(item=><li key={item.id} className="min-w-0 py-3">{safeDocumentUrl(item.url)&&<a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-2 rounded font-medium text-teal underline focus-ring"><ExternalLink size={16} className="mt-1 shrink-0"/><span className="break-all">{item.name}</span><span className="sr-only"> (mở tab mới)</span></a>}<p className="mt-1 break-all text-xs text-slate">{item.url}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.instructions}</p></li>)}</ul>}
      <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={next=>{setData(null);setPage(next);}} onPageSizeChange={size=>{setData(null);setPage(1);setPageSize(size);}} />
    </>}
    <Link href="/tai-lieu" className="mt-3 inline-block text-sm font-medium text-teal underline">Quản lý, sửa hoặc xóa link trong Tài liệu &amp; Hướng dẫn truy cập</Link>
  </section>;
}
