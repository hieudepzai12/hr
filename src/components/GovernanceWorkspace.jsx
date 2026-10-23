'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronLeft, ChevronRight, LockKeyhole, ExternalLink } from 'lucide-react';
import Layout from './Layout';
import Modal from './Modal';
import ProtectedRoute from './ProtectedRoute';
import MonthInput from './MonthInput';
import GovernanceFields from './GovernanceFields';
import FolderMap from './FolderMap';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { scopeAllows, scopeFor } from '@/lib/access';
import { GOVERNANCE, REVIEW_STATES, VERIFICATION_STATES, vnd } from '@/lib/governance-config';
import { projectStatus } from '@/lib/project-status';

const dateText=(value)=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—';
const stateLabel=(config,row)=>REVIEW_STATES[row.status]||config.fields.find((field)=>field.key==='status')?.options?.[row.status]||VERIFICATION_STATES[row.verification_status]||'Đang sử dụng';
const stateTone=(row)=>row.status==='approved'||row.verification_status==='verified'?'bg-green-50 text-green-800':row.status==='rejected'?'bg-red-50 text-red-800':row.status==='submitted'||row.status==='active'?'bg-blue-50 text-blue-800':row.verification_status==='needs_verification'?'bg-amber-50 text-amber-900':'bg-paper text-slate';
const fieldValue=(field,row)=>field.type==='reference'?row[`${field.key}_label`]||`#${row[field.key]||'—'}`:field.type==='date'?dateText(row[field.key]):field.type==='month'?String(row[field.key]||'').split('-').reverse().join('/')||'—':['base_salary','allowance','employer_cost','basis_amount','amount'].includes(field.key)?vnd(row[field.key]):field.type==='select'?field.options[row[field.key]]||'—':row[field.key]??'—';
function Content({resource}){
  const config=GOVERNANCE[resource];const {user}=useAuth();
  const [projectClock,setProjectClock]=useState(()=>new Date());
  useEffect(()=>{
    if(resource!=='projects')return;
    const interval=setInterval(()=>setProjectClock(new Date()),60000);
    return()=>clearInterval(interval);
  },[resource]);
  const rowLabel=row=>resource==='projects'?projectStatus(row,projectClock).label:stateLabel(config,row);
  const rowTone=row=>resource==='projects'?projectStatus(row,projectClock).tone:stateTone(row);
  const stateField=resource==='projects'?null:config.workflow?'status':config.fields.some(field=>field.key==='status')?'status':config.fields.some(field=>field.key==='verification_status')?'verification_status':null;
  const sequence=useRef(0);
  const [data,setData]=useState({items:[],total:0,page:1,pageSize:20});
  const [page,setPage]=useState(1);const [search,setSearch]=useState('');const [status,setStatus]=useState('');const [sort,setSort]=useState('updated_at');const [deleted,setDeleted]=useState(false);
  const [month,setMonth]=useState('');const [department,setDepartment]=useState('');const [project,setProject]=useState('');const [direction,setDirection]=useState('desc');
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [options,setOptions]=useState({});
  const [detail,setDetail]=useState(null);const [form,setForm]=useState(null);const [editing,setEditing]=useState(null);const [saving,setSaving]=useState(false);const [tab,setTab]=useState('detail');
  const allowed=(action,row)=>scopeAllows(user,config.module,action,{ownerId:row.owner_id,departmentId:row.department_id});
  const load=useCallback(async()=>{
    const request=++sequence.current;
    setLoading(true);setError('');
    try{const {data}=await api.get(`/governance/${resource}`,{params:{page,search,[stateField||'status']:status,sort,direction,month,department_id:department,project_id:resource==='assignments'?project:undefined,deleted:deleted?'1':undefined}});if(request===sequence.current)setData(data);}
    catch(err){if(request===sequence.current)setError(err.response?.data?.error||'Không tải được danh sách');}finally{if(request===sequence.current)setLoading(false);}
  },[resource,page,search,status,sort,direction,month,department,project,deleted,stateField]);
  useEffect(()=>{const timer=setTimeout(load,200);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>{let active=true;api.get(`/governance/${resource}`,{params:{options:1}}).then(({data})=>{if(active){setOptions(data);if(resource==='assignments')setProject(new URLSearchParams(window.location.search).get('project_id')||'');}}).catch(()=>{});return()=>{active=false;};},[resource]);
  const open=async(row)=>{
    setError('');setTab('detail');
    try{const {data}=await api.get(`/governance/${resource}/${row.id}`);setDetail({...row,...data});}catch(err){setError(err.response?.data?.error||'Không tải được chi tiết');}
  };
  const edit=async(row=null)=>{
    setError('');
    try{
      const {data}=await api.get(`/governance/${resource}`,{params:{options:1}});setOptions(data);
      setEditing(row);
      setForm({...Object.fromEntries(config.fields.map((field)=>[field.key,row?.[field.key]??(field.type==='select'?Object.keys(field.options)[0]:field.type==='number'?field.key==='allocation'?100:0:'')])),...(resource==='assignments'&&!row?{position_title:'',project_id:project}:{})});
      setDetail(null);
    }catch(err){setError(err.response?.data?.error||'Không tải được dữ liệu biểu mẫu');}
  };
  const save=async(event)=>{
    event.preventDefault();if(saving)return;setSaving(true);setError('');
    try{
      const {data}=editing?await api.put(`/governance/${resource}/${editing.id}`,{...form,version:editing.version}):await api.post(`/governance/${resource}`,form);
      setForm(null);setNotice('Đã lưu dữ liệu.');await load();await open(data);
    }catch(err){setError(err.response?.data?.error||'Không lưu được dữ liệu');}finally{setSaving(false);}
  };
  const transition=async(action,row)=>{
    if(saving)return;
    const needsReason=['delete','reopen','reject'].includes(action);
    const reason=needsReason?window.prompt('Nhập lý do:'):'';if(needsReason&&!reason?.trim())return;
    setSaving(true);setError('');
    try{await api.patch(`/governance/${resource}/${row.id}`,{action,version:row.version,reason});setNotice('Đã cập nhật trạng thái.');setDetail(null);await load();}
    catch(err){setError(err.response?.data?.error||'Không cập nhật được trạng thái');}finally{setSaving(false);}
  };
  const reviewLabel=row=>row.status==='submitted'&&allowed('approve',row)&&(row.created_by!==user.id||user.role==='admin')?'Xem & duyệt':'Chi tiết';
  const columns=resource==='projects'
    ? config.fields.filter(field=>['code','department_id','owner_id','end_date'].includes(field.key))
    : config.fields.filter((field)=>field.key!=='name'&&field.type!=='textarea').slice(0,4);
  return <Layout title={config.title} subtitle={config.description} actions={scopeFor(user,config.module,'create')!=='none'&&<button type="button" onClick={()=>edit()} className="ui-button ui-button-primary"><Plus size={16}/>Thêm mới</button>}>
    <div className="ui-card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative"><span className="sr-only">Tìm kiếm</span><Search size={16} className="absolute left-3 top-3 text-slate"/><input value={search} onChange={(e)=>{setPage(1);setSearch(e.target.value);}} placeholder="Tìm theo tên" className="ui-field pl-9"/></label>
      {stateField&&<select aria-label="Trạng thái" value={status} onChange={(e)=>{setPage(1);setStatus(e.target.value);}} className="ui-field"><option value="">Mọi trạng thái</option>{Object.entries(config.workflow?REVIEW_STATES:stateField==='verification_status'?VERIFICATION_STATES:config.fields.find((field)=>field.key==='status')?.options||{}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}
      <select aria-label="Sắp xếp" value={sort} onChange={(e)=>{setPage(1);setSort(e.target.value);}} className="ui-field"><option value="updated_at">Thời gian cập nhật</option><option value="name">Tên</option><option value="created_at">Ngày tạo</option>{config.fields.filter((field)=>['number','date','month'].includes(field.type)).map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select>
      <select aria-label="Chiều sắp xếp" value={direction} onChange={e=>{setPage(1);setDirection(e.target.value);}} className="ui-field"><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select>
      <select aria-label="Lọc phòng ban" value={department} onChange={e=>{setPage(1);setDepartment(e.target.value);}} className="ui-field"><option value="">Mọi phòng ban được xem</option>{options.departments?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      {resource==='assignments'&&<select aria-label="Dự án" value={project} onChange={event=>{setPage(1);setProject(event.target.value);}} className="ui-field"><option value="">Mọi dự án</option>{options.projects?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      {config.fields.some(field=>field.type==='month')&&<MonthInput label="Lọc tháng" value={month} onChange={value=>{setPage(1);setMonth(value);}}/>}
      {scopeFor(user,config.module,'restore')!=='none'&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deleted} onChange={(e)=>{setPage(1);setDeleted(e.target.checked);}}/>Đã xóa</label>}
    </div>
    {!form&&error&&<p role="alert" className="ui-notice mb-4">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {resource==='folders'&&!deleted&&!loading&&!error&&<FolderMap key={data.items.map(row=>`${row.id}-${row.version}`).join(',')} onSelect={open}/>}
    {loading?<div role="status" className="ui-card ui-empty">Đang tải dữ liệu...</div>:error?<button type="button" onClick={load} className="ui-button ui-button-secondary">Thử tải lại</button>:!data.items.length?<div className="ui-card ui-empty">Chưa có dữ liệu phù hợp. Dữ liệu chưa được xác minh không được tự động nhập từ tài liệu.</div>:<>
      <div className="grid gap-3 md:hidden">{data.items.map((row)=><article key={row.id} className="ui-card min-w-0 p-4"><button onClick={()=>open(row)} className="break-words text-left font-semibold text-teal">{row.name}</button><p className="my-2 text-xs text-slate"><span className={`rounded-full px-2 py-1 font-semibold ${rowTone(row)}`}>{rowLabel(row)}</span> · Phiên bản {row.version}</p><dl className="space-y-2">{columns.map((field)=><div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 text-sm"><dt className="text-slate">{field.label}</dt><dd className="break-words text-right">{String(resource==='projects'&&field.key==='status'?rowLabel(row):fieldValue(field,row))}</dd></div>)}</dl>{resource==='budgets'&&<p className="mt-3 font-semibold">Tổng: {vnd(row.total_amount)}</p>}{resource==='awards'&&<p className="mt-3 font-semibold">Thưởng: {vnd(row.amount)}</p>}{resource==='staffing'&&<p className="mt-3 text-sm">Hiện có trong phòng: {row.actual_count} · Thiếu: {Math.max(0,row.target_count-row.actual_count)}</p>}{resource==='staffing'&&<button type="button" onClick={()=>open(row)} className="ui-button ui-button-secondary mt-3">{reviewLabel(row)}</button>}</article>)}</div>
      <div className="ui-card hidden overflow-x-auto md:block"><table className="ui-table"><thead><tr><th>Tên</th>{columns.map((field)=><th key={field.key}>{field.label}</th>)}{resource==='staffing'&&<th>Thực tế / Thiếu</th>}{resource==='budgets'&&<th>Tổng dự toán</th>}<th>{resource==='projects'?'Cảnh báo tiến độ':'Trạng thái'}</th>{resource==='staffing'&&<th>Thao tác</th>}</tr></thead><tbody>{data.items.map((row)=><tr key={row.id}><td><button onClick={()=>open(row)} className="text-left font-semibold text-teal hover:underline">{row.name}</button></td>{columns.map((field)=><td key={field.key}>{String(resource==='projects'&&field.key==='status'?rowLabel(row):fieldValue(field,row))}</td>)}{resource==='staffing'&&<td>{row.actual_count} / {Math.max(0,row.target_count-row.actual_count)}</td>}{resource==='budgets'&&<td>{vnd(row.total_amount)}</td>}<td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rowTone(row)}`}>{rowLabel(row)}</span></td>{resource==='staffing'&&<td><button type="button" onClick={()=>open(row)} className="ui-button ui-button-secondary whitespace-nowrap">{reviewLabel(row)}</button></td>}</tr>)}</tbody></table></div>
    </>}
    <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{data.total} bản ghi · Trang {page}</span><div className="flex gap-2"><button aria-label="Trang trước" disabled={page===1||loading} onClick={()=>setPage(page-1)} className="icon-button disabled:opacity-40"><ChevronLeft size={18}/></button><button aria-label="Trang sau" disabled={page*20>=data.total||loading} onClick={()=>setPage(page+1)} className="icon-button disabled:opacity-40"><ChevronRight size={18}/></button></div></div>
    {detail&&<Modal title={detail.name} onClose={()=>setDetail(null)} width="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-sm ${rowTone(detail)}`}>{rowLabel(detail)}</span><span className="text-xs text-slate">Phiên bản {detail.version}</span>{config.workflow&&(detail.status==='approved'||(detail.status==='submitted'&&resource!=='staffing'))&&<span className="flex items-center gap-1 text-xs text-teal"><LockKeyhole size={14}/>Nội dung đang khóa</span>}</div>
      {resource==='projects'&&detail.taskSummary?.length>0&&<div className="mb-4 rounded-lg bg-paper p-3 text-sm"><h3 className="font-semibold">Tiến độ công việc trong phạm vi được xem</h3><p className="mt-1">{detail.taskSummary.find(item=>item.status==='done')?.count||0} / {detail.taskSummary.reduce((sum,item)=>sum+item.count,0)} công việc đã nghiệm thu</p><div className="progress-track mt-2"><div className="progress-fill" style={{width:`${(detail.taskSummary.find(item=>item.status==='done')?.count||0)/detail.taskSummary.reduce((sum,item)=>sum+item.count,0)*100}%`}}/></div></div>}
      <div className="mb-4 flex flex-wrap gap-2"><button onClick={()=>setTab('detail')} className="ui-button ui-button-secondary" aria-pressed={tab==='detail'}>Chi tiết</button><button onClick={()=>setTab('history')} className="ui-button ui-button-secondary" aria-pressed={tab==='history'}>Lịch sử & Phiên bản</button>
        {!detail.deleted_at&&allowed('edit',detail)&&(!config.workflow||['draft','rejected'].includes(detail.status)||(resource==='staffing'&&detail.status==='submitted'))&&<button onClick={()=>edit(detail)} className="ui-button ui-button-primary">Sửa</button>}
        {detail.deleted_at?allowed('restore',detail)&&<button disabled={saving} onClick={()=>transition('restore',detail)} className="ui-button ui-button-primary">Khôi phục</button>:<>
          {config.workflow&&['draft','rejected'].includes(detail.status)&&allowed('edit',detail)&&<button disabled={saving} onClick={()=>transition('submit',detail)} className="ui-button ui-button-primary">Gửi duyệt</button>}
          {config.workflow&&detail.status==='submitted'&&(detail.created_by!==user.id||(resource==='staffing'&&user.role==='admin'))&&allowed('approve',detail)&&<><button disabled={saving} onClick={()=>transition('approve',detail)} className="ui-button ui-button-primary">Duyệt</button><button disabled={saving} onClick={()=>transition('reject',detail)} className="ui-button ui-button-secondary">Yêu cầu bổ sung</button></>}
          {config.workflow&&detail.status==='approved'&&allowed('approve',detail)&&<button disabled={saving} onClick={()=>transition('reopen',detail)} className="ui-button ui-button-secondary">Mở lại</button>}
          {allowed('delete',detail)&&detail.status!=='approved'&&<button disabled={saving} onClick={()=>transition('delete',detail)} className="ui-button ui-button-secondary text-clay">Xóa</button>}
        </>}
      </div>
      {tab==='detail'?<div className="space-y-4">{resource==='staffing'&&detail.position_id!=null&&<p className="ui-notice">Định biên cũ theo chức vụ, chưa dùng cho tổng phòng ban. Khi sửa, hãy nhập tổng số người của phòng; lưu sẽ chuyển sang định biên phòng ban và giữ lịch sử cũ.</p>}<dl className="grid gap-4 sm:grid-cols-2">{config.fields.map((field)=><div key={field.key} className={field.type==='textarea'?'sm:col-span-2':''}><dt className="text-xs text-slate">{field.label}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm">{field.key==='url'&&detail.url?<a href={detail.url} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-teal underline"><ExternalLink size={14}/>Mở tài liệu</a>:String(resource==='projects'&&field.key==='status'?rowLabel(detail):fieldValue(field,detail))}</dd></div>)}</dl>{detail.feedback&&<div className="rounded-lg bg-paper p-3 text-sm">Phản hồi: {detail.feedback}</div>}{resource==='budgets'&&<p className="font-semibold">Tổng dự toán: {vnd(detail.total_amount)}</p>}{resource==='awards'&&<p className="font-semibold">Tiền thưởng: {vnd(detail.amount)} · Chính sách phiên bản {detail.policy_snapshot?.version}</p>}{resource==='projects'&&<div className="flex flex-wrap gap-3"><Link href={`/timeline?project_id=${detail.id}`} className="ui-button ui-button-secondary">Công việc dự án</Link>{scopeFor(user,'positions','view')!=='none'&&<Link href={`/chuc-danh?project_id=${detail.id}`} className="ui-button ui-button-secondary">Phân công nhiệm vụ</Link>}<Link href="/nhan-su-du-an" className="ui-button ui-button-secondary">Nhân sự dự án</Link></div>}</div>:<div className="space-y-4"><details><summary className="cursor-pointer font-semibold">Các phiên bản đã lưu ({detail.versions?.length||0})</summary>{detail.versions?.map((version)=><details key={version.version} className="mt-2 rounded border border-line p-3"><summary>Phiên bản {version.version} · {dateText(version.created_at)}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(version.snapshot,null,2)}</pre></details>)}</details>{detail.history?.map((entry)=><div key={entry.id} className="rounded-lg border border-line p-3 text-sm"><strong>{entry.actor_name||'Hệ thống'}</strong><p>{entry.action} · {new Date(entry.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p>{entry.reason&&<p>Lý do: {entry.reason}</p>}<details className="mt-2"><summary className="cursor-pointer">Trường thay đổi, trước và sau</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry.changes,null,2)}</pre></details></div>)}</div>}
      {error&&<p role="alert" className="ui-notice mt-4">{error}</p>}
    </Modal>}
    {form&&<Modal title={editing?'Chỉnh sửa':'Thêm '+config.title.toLocaleLowerCase('vi')} onClose={()=>!saving&&setForm(null)} width="max-w-4xl"><form onSubmit={save} className="space-y-4"><p className="text-sm text-slate">{config.description}</p><div className="grid gap-4 sm:grid-cols-2"><GovernanceFields resource={resource} fields={config.fields} form={form} setForm={setForm} options={options} editing={editing}/></div>{error&&<p role="alert" className="ui-notice">{error}</p>}<div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white py-3"><button type="button" disabled={saving} onClick={()=>setForm(null)} className="ui-button ui-button-secondary">Hủy</button><button disabled={saving} className="ui-button ui-button-primary">{saving?'Đang lưu...':'Lưu dữ liệu'}</button></div></form></Modal>}
  </Layout>;
}
export default function GovernanceWorkspace({resource}){return <ProtectedRoute permission={GOVERNANCE[resource].module}><Content key={resource} resource={resource}/></ProtectedRoute>;}
