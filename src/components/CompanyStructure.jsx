'use client';
import {useEffect,useState} from 'react';
import Layout from './Layout';
import MonthInput from './MonthInput';
import ProtectedRoute from './ProtectedRoute';
import api from '@/lib/api';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {departmentStructure,isCompanyLeader,companyLeadershipTitles,departmentHeads} from '@/lib/company-structure';
import {departmentHeadcount} from '@/lib/recruitment-summary';

function PositionBranch({node}){
 const title=node.title?.split(';').map(title=>title.split(' — ')[0].trim()).filter(Boolean).join('; ');
 return <li className="min-w-0"><div className="mx-auto h-5 w-px bg-slate-300" aria-hidden="true"/><div className="break-words rounded-lg border border-line bg-white p-3 text-sm font-medium">{title||'Chưa cập nhật chức danh người phụ trách'}</div></li>;
}

function Content(){
 const {can}=useAuth();
 const [month,setMonth]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()));
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{if(!month)return;let active=true;api.get('/organization',{params:{month}}).then(({data})=>{if(active)setData(data);}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được cơ cấu công ty.');});return()=>{active=false;};},[month]);
 const departments=(data?.departments||[]).filter(d=>!['ban giam doc','ban giam doc cong ty'].includes(d.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim()));
 const employees=data?.employees||[];
 const directors=employees.filter(isCompanyLeader);
 return <Layout title="Cơ cấu công ty" subtitle="Cơ cấu phòng ban và định biên đã duyệt theo tháng. Không hiển thị tên cá nhân." actions={can('staffing')&&<Link href="/dinh-bien" className="ui-button ui-button-primary">Định biên nhân sự</Link>}>
  <div className="mb-4 max-w-xs"><MonthInput label="Tháng định biên" value={month} required onChange={value=>{if(value!==month){setData(null);setError('');setMonth(value);}}}/></div>
  {!month?<p className="ui-card ui-empty">Chọn đủ tháng và năm để xem cơ cấu.</p>:error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status" className="ui-card ui-empty">Đang tải cơ cấu công ty...</p>:<section className="ui-card min-w-0 p-4 sm:p-6" aria-label="Sơ đồ cơ cấu công ty">
   <div className="mx-auto max-w-56 rounded-xl border border-[#14243d] bg-[#14243d] p-4 text-center font-semibold text-white">{directors.length?[...new Set(directors.flatMap(companyLeadershipTitles))].join(' · '):'OTIS Minh Châu'}</div>
   {!directors.length&&<p className="mt-2 text-center text-xs text-slate">Chưa có hồ sơ Giám đốc đang hoạt động.</p>}
   <div className="mx-auto h-8 w-px bg-slate-300" aria-hidden="true"/>
   {departments.length?<div className="grid min-w-0 items-start gap-4 border-t border-slate-300 pt-5 sm:grid-cols-2 xl:grid-cols-5">{departments.map(d=>{const structure=departmentStructure(employees,d.id,d.name);const heads=departmentHeads(structure);const count=departmentHeadcount(employees,d.id,null,d.name);const target=data.staffing?.find(row=>String(row.department_id)===String(d.id))?.target_count??null;return <article key={d.id} className="relative min-w-0 text-center">
    <div className="absolute -top-5 left-1/2 hidden h-5 w-px bg-slate-300 xl:block" aria-hidden="true"/>
    <h2 className="flex min-h-16 items-center justify-center break-words rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-[#14243d]">{d.name}</h2>
    {heads.length?<ul>{heads.map(node=><PositionBranch key={node.id} node={node}/>)}</ul>:<p className="mt-3 rounded-lg border border-line p-3 text-xs text-slate">Chưa xác định chức danh người phụ trách.</p>}
    <div className="mx-auto h-5 w-px bg-slate-300" aria-hidden="true"/>
    <div className="rounded-lg border border-line bg-slate-50 p-3"><strong className="text-xl text-[#14243d]">{target??'—'}</strong><p className="mt-1 text-xs font-medium text-slate">Định biên đã duyệt</p><p className="mt-2 text-xs text-slate">Hiện có: {count.current}{target!=null&&` · Còn thiếu: ${Math.max(0,target-count.current)}`}</p>{target!=null&&count.current>target&&<p className="mt-2 text-xs text-amber-800">Vượt định biên: {count.current-target} người</p>}{target==null&&<p className="mt-2 text-xs text-slate">{data.staffing==null?'Chưa có quyền xem định biên':'Chưa có định biên đã duyệt trong tháng này'}</p>}</div>
    {structure.unresolved>0&&<p className="mt-2 text-xs text-amber-800">Có quan hệ quản lý cần kiểm tra.</p>}
   </article>;})}</div>:<p className="ui-empty">Chưa có phòng ban trong phạm vi được xem.</p>}
   <p className="mt-5 text-sm text-slate">Định biên là tổng số người của phòng ban đã được duyệt trong tháng đang chọn, gồm người phụ trách và nhân viên. Còn thiếu = định biên − nhân sự hiện có (tối thiểu 0). Không cộng thêm nhu cầu tuyển dụng vào định biên. Cập nhật tại Định biên nhân sự.</p>
   <p className="mt-2 text-xs text-slate">Số hiện có gồm nhân sự thuộc phòng và người kiêm nhiệm phụ trách phòng. Mỗi người chỉ tính một lần trong mỗi phòng, dù xuất hiện ở nhiều ô; khi thống kê toàn công ty cần đếm người duy nhất, không cộng các phòng có người kiêm nhiệm.</p>
   {(!data.companyWide||departments.length!==5)&&<p className="mt-2 text-sm text-slate">Đang hiển thị {departments.length} phòng ban theo danh mục và quyền truy cập hiện tại.</p>}
  </section>}
 </Layout>;
}
export default function CompanyStructure(){return <ProtectedRoute permission="organization"><Content/></ProtectedRoute>;}
