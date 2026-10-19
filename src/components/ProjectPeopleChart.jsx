'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';

const dateText=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Chưa xác định';
function Content(){
 const [projects,setProjects]=useState(null),[projectPage,setProjectPage]=useState(1),[selected,setSelected]=useState('');
 const [members,setMembers]=useState(null),[page,setPage]=useState(1),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/governance/projects',{params:{page:projectPage,sort:'name',direction:'asc'}}).then(({data})=>{if(active){setProjects(data);setError('');}}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được dự án.');});return()=>{active=false;};},[projectPage]);
 const project=projects?.items.find(p=>String(p.id)===selected)||projects?.items[0];
 const projectId=project?.id;
 useEffect(()=>{if(!projectId)return;let active=true;api.get('/governance/members',{params:{project_id:projectId,page}}).then(({data})=>{if(active){setMembers({...data,projectId});setError('');}}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được phân công dự án.');});return()=>{active=false;};},[projectId,page]);
 const ready=members?.projectId===projectId&&members?.page===page;
 const changeProjectPage=next=>{setProjectPage(next);setProjects(null);setSelected('');setMembers(null);setPage(1);};
 return <Layout title="Sơ đồ nhân sự dự án" subtitle="Dự án → Người phụ trách → Nhân sự tham gia. Dùng chung dữ liệu Dự án và Nhân sự dự án hiện có." actions={<Link href="/nhan-su-du-an" className="ui-button">Quản lý phân công</Link>}>
  {error?<p role="alert" className="ui-notice">{error}</p>:!projects?<p role="status" className="ui-card ui-empty">Đang tải dự án...</p>:!projects.items.length?<p className="ui-card ui-empty">Chưa có dự án trong phạm vi được xem. Thêm dự án tại Khách hàng &amp; Dự án → Dự án, rồi phân công nhân sự.</p>:<>
   <div className="ui-card mb-4 flex flex-wrap items-end gap-3 p-4"><label className="min-w-0 flex-1 text-sm">Dự án<select className="ui-field mt-1" value={projectId||''} onChange={e=>{setSelected(e.target.value);setPage(1);setMembers(null);}}>{projects.items.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button className="ui-button" disabled={projectPage===1} onClick={()=>changeProjectPage(projectPage-1)}>Trang trước</button><span className="text-sm">Dự án: trang {projectPage}</span><button className="ui-button" disabled={projectPage*projects.pageSize>=projects.total} onClick={()=>changeProjectPage(projectPage+1)}>Trang sau</button></div>
   <section className="ui-card min-w-0 p-4 sm:p-6" aria-label="Sơ đồ phân công dự án">
    <h2 className="mx-auto max-w-md break-words rounded-xl bg-[#14243d] p-4 text-center font-semibold text-white">{project.name}</h2>
    <div className="mx-auto h-6 w-px bg-slate-300" aria-hidden="true"/><div className="mx-auto max-w-md rounded-lg border border-blue-200 bg-blue-50 p-4 text-center"><p className="text-xs text-slate">Người phụ trách dự án</p><p className="mt-1 font-semibold">{project.owner_id_label||'Chưa xác định'}</p></div>
    <div className="mx-auto h-6 w-px bg-slate-300" aria-hidden="true"/>
    {!ready?<p role="status" className="ui-empty">Đang tải nhân sự tham gia...</p>:!members.items.length?<p className="ui-empty">Dự án chưa có nhân sự tham gia được phân công trong phạm vi được xem.</p>:<><div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-3">{members.items.map(m=><article key={m.id} className="min-w-0 rounded-lg border border-line p-4"><h3 className="break-words font-semibold">{m.employee_id_label||'Chưa xác định'}</h3><p className="mt-1 break-words text-sm">{m.name}</p><p className="mt-2 text-xs text-slate">Tham gia: {dateText(m.start_date)} — {dateText(m.end_date)}</p><p className="mt-1 text-xs text-slate">Tỷ lệ phân bổ: {m.allocation}%</p></article>)}</div><div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button className="ui-button" disabled={page===1} onClick={()=>setPage(page-1)}>Trước</button><span className="text-sm">Trang {page} · {members.total} phân công</span><button className="ui-button" disabled={page*members.pageSize>=members.total} onClick={()=>setPage(page+1)}>Sau</button></div></>}
   </section>
  </>}
 </Layout>;
}
export default function ProjectPeopleChart(){return <ProtectedRoute permission="projects"><Content/></ProtectedRoute>;}
