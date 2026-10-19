'use client';
import {useEffect,useState} from 'react';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import api from '@/lib/api';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {departmentStructure,isCompanyLeader,subordinateCount} from '@/lib/company-structure';

function PositionBranch({node}){
 return <li className="min-w-0"><div className="mx-auto h-5 w-px bg-slate-300" aria-hidden="true"/><div className="break-words rounded-lg border border-line bg-white p-3 text-sm font-medium">{node.title||'Chưa cập nhật chức danh người phụ trách'}</div><div className="mx-auto h-5 w-px bg-slate-300" aria-hidden="true"/><div className="rounded-lg border border-line bg-slate-50 p-3"><strong className="text-xl text-[#14243d]">{subordinateCount(node)}</strong><p className="mt-1 text-xs text-slate">Nhân viên trực thuộc</p></div></li>;
}

function Content(){
 const {can}=useAuth();
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/organization').then(({data})=>{if(active)setData(data);}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được cơ cấu công ty.');});return()=>{active=false;};},[]);
 const departments=(data?.departments||[]).filter(d=>!['ban giam doc','ban giam doc cong ty'].includes(d.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim()));
 const employees=data?.employees||[];
 const directors=employees.filter(isCompanyLeader);
 return <Layout title="Cơ cấu công ty" subtitle="Phòng ban, chức danh và quan hệ quản lý lấy từ hồ sơ nhân viên đang hoạt động. Không hiển thị tên cá nhân." actions={can('employees','manage')&&<Link href="/nhan-vien" className="ui-button ui-button-primary">Cập nhật cơ cấu từ nhân viên</Link>}>
  {error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status" className="ui-card ui-empty">Đang tải cơ cấu công ty...</p>:<section className="ui-card min-w-0 p-4 sm:p-6" aria-label="Sơ đồ cơ cấu công ty">
   <div className="mx-auto max-w-56 rounded-xl border border-[#14243d] bg-[#14243d] p-4 text-center font-semibold text-white">{directors.length?directors.map(e=>e.position?.trim()||'Giám đốc').join(' · '):'OTIS Minh Châu'}</div>
   {!directors.length&&<p className="mt-2 text-center text-xs text-slate">Chưa có hồ sơ Giám đốc đang hoạt động.</p>}
   <div className="mx-auto h-8 w-px bg-slate-300" aria-hidden="true"/>
   {departments.length?<div className="grid min-w-0 items-start gap-4 border-t border-slate-300 pt-5 sm:grid-cols-2 xl:grid-cols-5">{departments.map(d=>{const structure=departmentStructure(employees,d.id);const heads=structure.roots.filter(node=>node.children.length>0||/trưởng|quản lý/iu.test(node.title||''));const unmanaged=structure.roots.filter(node=>!heads.includes(node));return <article key={d.id} className="relative min-w-0 text-center">
    <div className="absolute -top-5 left-1/2 hidden h-5 w-px bg-slate-300 xl:block" aria-hidden="true"/>
    <h2 className="flex min-h-16 items-center justify-center break-words rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-[#14243d]">{d.name}</h2>
    {structure.count?<><p className="mt-2 text-xs text-slate">{structure.count} hồ sơ đang hoạt động</p><ul>{heads.map(node=><PositionBranch key={node.id} node={node}/>)}</ul>{unmanaged.length>0&&<div className="mt-3 rounded-lg border border-line bg-slate-50 p-3"><strong className="text-xl text-[#14243d]">{unmanaged.length}</strong><p className="mt-1 text-xs text-slate">Nhân viên chưa gán quản lý trực tiếp</p></div>}{structure.unresolved>0&&<p className="mt-2 text-xs text-amber-800">Có quan hệ quản lý cần kiểm tra.</p>}</>:<p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate">Chưa có nhân sự đang hoạt động.</p>}
   </article>;})}</div>:<p className="ui-empty">Chưa có phòng ban trong phạm vi được xem.</p>}
   <p className="mt-5 text-sm text-slate">Dưới chức danh người phụ trách là số nhân viên trực thuộc đang hoạt động trong phòng, tính cả các cấp bên dưới và không tính người phụ trách. Chi tiết từng người nằm ở Sơ đồ nhân sự.</p>
   {(!data.companyWide||departments.length!==5)&&<p className="mt-2 text-sm text-slate">Đang hiển thị {departments.length} phòng ban theo danh mục và quyền truy cập hiện tại.</p>}
  </section>}
 </Layout>;
}
export default function CompanyStructure(){return <ProtectedRoute permission="organization"><Content/></ProtectedRoute>;}
