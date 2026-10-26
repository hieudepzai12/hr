'use client';
import { requestReason } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, LockKeyhole, ExternalLink } from 'lucide-react';
import Layout from './Layout';
import Pagination from './Pagination';
import Modal from './Modal';
import ProtectedRoute from './ProtectedRoute';
import MonthInput from './MonthInput';
import GovernanceFields from './GovernanceFields';
import SalaryBudgetFields from './SalaryBudgetFields';
import SalaryBudgetTable from './SalaryBudgetTable';
import SalaryBudgetFilters from './SalaryBudgetFilters';
import SalaryBudgetBatchForm from './SalaryBudgetBatchForm';
import BonusAwardFields from './BonusAwardFields';
import BonusAwardTable from './BonusAwardTable';
import { bonusComponents } from '@/lib/bonus-components';
import { aggregateBudgetFields, canAccessBudget } from '@/lib/salary-budget';
import { vietnamToday } from '@/lib/deadline';
import FolderMap from './FolderMap';
import FolderLinks from './FolderLinks';
import AuditTrail from './AuditTrail';
import PositionDuties, { PositionDutySections, PositionDutyFilters, PositionDutyForm } from './PositionDuties';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { scopeAllows, scopeFor } from '@/lib/access';
import { GOVERNANCE, REVIEW_STATES, VERIFICATION_STATES, vnd } from '@/lib/governance-config';
import { projectStatus } from '@/lib/project-status';

const dateText=(value)=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—';
const stateLabel=(config,row)=>REVIEW_STATES[row.status]||config.fields.find((field)=>field.key==='status')?.options?.[row.status]||VERIFICATION_STATES[row.verification_status]||'Đang sử dụng';
const stateTone=(row)=>row.status==='approved'||row.verification_status==='verified'?'bg-green-50 text-green-800':row.status==='rejected'?'bg-red-50 text-red-800':row.status==='submitted'||row.status==='active'?'bg-blue-50 text-blue-800':row.verification_status==='needs_verification'?'bg-amber-50 text-amber-900':'bg-paper text-slate';
const fieldValue=(field,row)=>field.type==='money'?vnd(field.key==='fixed_amount'&&row.fixed_amount==null&&row.policy_snapshot?bonusComponents(row).fixed_amount:row[field.key]||'0'):field.type==='references'?row[`${field.key}_label`]||(row[field.key]||[]).map(id=>`#${id}`).join(', ')||'—':field.type==='reference'?row[`${field.key}_label`]||`#${row[field.key]||'—'}`:field.type==='date'?dateText(row[field.key]):field.type==='month'?String(row[field.key]||'').split('-').reverse().join('/')||'—':['base_salary','allowance','employer_cost','basis_amount','amount'].includes(field.key)?vnd(row[field.key]):field.type==='select'?field.options[row[field.key]]||'—':row[field.key]??'—';
function EmbeddedSection({title,subtitle,actions,children}){
  return <section className="min-w-0" aria-label={title}><header className="mb-4 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm text-slate">{subtitle}</p></div>{actions}</header>{children}</section>;
}
function Content({resource,title,navigation,embedded}){
  const Frame=embedded?EmbeddedSection:Layout;
  const config=GOVERNANCE[resource];const {user}=useAuth();
  const [projectClock,setProjectClock]=useState(()=>new Date());
  useEffect(()=>{
    if(resource!=='projects')return;
    const interval=setInterval(()=>setProjectClock(new Date()),60000);
    return()=>clearInterval(interval);
  },[resource]);
  const rowLabel=row=>resource==='projects'?projectStatus(row,projectClock).label:stateLabel(config,row);
  const rowTone=row=>resource==='projects'?projectStatus(row,projectClock).tone:stateTone(row);
  const showState=resource!=='positions';
  const stateField=['projects','positions'].includes(resource)?null:config.workflow?'status':config.fields.some(field=>field.key==='status')?'status':config.fields.some(field=>field.key==='verification_status')?'verification_status':null;
  const sequence=useRef(0);
  const [folderRevision,setFolderRevision]=useState(0);
  const [data,setData]=useState({items:[],total:0,page:1,pageSize:20});
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);const [search,setSearch]=useState('');const [status,setStatus]=useState('');const [sort,setSort]=useState('updated_at');const [deleted,setDeleted]=useState(false);
  const [month,setMonth]=useState(()=>resource==='budgets'?vietnamToday().slice(0,7):'');const [department,setDepartment]=useState('');const [project,setProject]=useState('');const [direction,setDirection]=useState('desc');
  const [loading,setLoading]=useState(true);const [error,setError]=useFeedback('error');const [,setNotice]=useFeedback('success');const [options,setOptions]=useState({});
  const [detail,setDetail]=useState(null);const [form,setForm]=useState(null);const [editing,setEditing]=useState(null);const [saving,setSaving]=useState(false);const [tab,setTab]=useState('detail');
  const [bulk,setBulk]=useState(null);const [bulkLoading,setBulkLoading]=useState(false);const [revision,setRevision]=useState(0);
  const allowed=(action,row)=>resource==='budgets'?canAccessBudget(user,action,row):scopeAllows(user,config.module,action,{ownerId:row.owner_id,departmentId:row.department_id});
  const load=useCallback(async()=>{
    const request=++sequence.current;
    setLoading(true);setError('');
    try{const {data}=await api.get(`/governance/${resource}`,{params:{page,pageSize,search:resource==='budgets'?undefined:search,[stateField||'status']:status,sort,direction,month,department_id:resource==='budgets'?undefined:department,department_ids:resource==='budgets'?department||undefined:undefined,project_id:resource==='assignments'?project:undefined,deleted:deleted?'1':undefined}});if(request===sequence.current)setData(data);}
    catch(err){if(request===sequence.current)setError(err.response?.data?.error||'Không tải được danh sách');}finally{if(request===sequence.current)setLoading(false);}
  },[resource,page,pageSize,search,status,sort,direction,month,department,project,deleted,stateField,setError]);
  useEffect(()=>{const timer=setTimeout(load,200);return()=>clearTimeout(timer);},[load,revision]);
  useEffect(()=>{let active=true;api.get(`/governance/${resource}`,{params:{options:1}}).then(({data})=>{if(active){setOptions(data);if(resource==='assignments')setProject(new URLSearchParams(window.location.search).get('project_id')||'');}}).catch(()=>{});return()=>{active=false;};},[resource]);
  const open=async(row)=>{
    setError('');setTab('detail');
    try{const {data}=await api.get(`/governance/${resource}/${row.id}`);setDetail({...row,...data});}catch(err){setError(err.response?.data?.error||'Không tải được chi tiết');}
  };
  const openBulk=async()=>{
    if(bulkLoading)return;setBulkLoading(true);setError('');
    try{
      const {data}=await api.get('/governance/budgets',{params:{options:1}});
      setBulk({departments:data.departments||[],month:month||vietnamToday().slice(0,7)});
    }catch(err){setError(err.response?.data?.error||'Không tải được danh sách phòng ban.');}
    finally{setBulkLoading(false);}
  };
  const edit=async(row=null)=>{
    setError('');
    try{
      const {data}=await api.get(`/governance/${resource}`,{params:{options:1}});setOptions(data);
      setEditing(row);
      setForm({...Object.fromEntries(config.fields.map((field)=>[field.key,row?.[field.key]??(field.type==='select'?Object.keys(field.options)[0]:field.type==='number'?field.key==='allocation'?100:0:'')])),...(resource==='assignments'&&!row?{position_title:'',project_id:project}:{}),...(resource==='budgets'?{budget_mode:'aggregate',department_ids:row?.department_ids||[],headcount:row?.headcount??'',total_amount:row?.total_amount??'',month:row?.month||month||vietnamToday().slice(0,7)}:{})});
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
    const reason=needsReason?await requestReason('Nhập lý do:'):'';if(needsReason&&!reason?.trim())return;
    setSaving(true);setError('');
    try{await api.patch(`/governance/${resource}/${row.id}`,{action,version:row.version,reason});setNotice('Đã cập nhật trạng thái.');setDetail(null);await load();}
    catch(err){setError(err.response?.data?.error||'Không cập nhật được trạng thái');}finally{setSaving(false);}
  };
  const reviewLabel=row=>row.status==='submitted'&&allowed('approve',row)&&(row.created_by!==user.id||user.role==='admin')?'Xem & duyệt':'Chi tiết';
  const columns=resource==='projects'
    ? config.fields.filter(field=>['code','department_id','owner_id','end_date'].includes(field.key))
    : resource==='positions'
    ? config.fields.filter(field=>['code','department_id','role_description','responsibilities'].includes(field.key))
    : config.fields.filter((field)=>field.key!=='name'&&field.type!=='textarea').slice(0,4);
  return <Frame title={title||config.title} subtitle={config.description} actions={scopeFor(user,config.module,'create')!=='none'&&(resource==='budgets'?<div className="flex flex-wrap gap-2"><button type="button" disabled={bulkLoading} onClick={openBulk} className="ui-button ui-button-primary">{bulkLoading?'Đang tải…':'Nhập quỹ lương'}</button></div>:<button type="button" onClick={()=>edit()} className="ui-button ui-button-primary"><Plus size={16}/>Thêm mới</button>)}>
    {navigation}
    {resource==='budgets'?<SalaryBudgetFilters value={{month,department,search,status,sort,direction,deleted,currentMonth:vietnamToday().slice(0,7)}} departments={options.departments} canRestore={scopeFor(user,'budgets','restore')!=='none'} onChange={next=>{setPage(1);setMonth(next.month);setDepartment(next.department);setSearch(next.search);setStatus(next.status);setSort(next.sort);setDirection(next.direction);setDeleted(next.deleted);}} onReset={()=>{setPage(1);setMonth(vietnamToday().slice(0,7));setDepartment('');setSearch('');setStatus('');setSort('updated_at');setDirection('desc');setDeleted(false);}}/>:resource==='positions'?<PositionDutyFilters search={search} onSearch={value=>{setPage(1);setSearch(value);}} department={department} onDepartment={value=>{setPage(1);setDepartment(value);}} departments={options.departments} sort={sort} direction={direction} onSort={(sort,direction)=>{setPage(1);setSort(sort);setDirection(direction);}} canRestore={scopeFor(user,config.module,'restore')!=='none'} deleted={deleted} onDeleted={value=>{setPage(1);setDeleted(value);}}/>:<div className="ui-card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative"><span className="sr-only">Tìm kiếm</span><Search size={16} className="absolute left-3 top-3 text-slate"/><input value={search} onChange={(e)=>{setPage(1);setSearch(e.target.value);}} placeholder="Tìm theo tên" className="ui-field pl-9"/></label>
      {stateField&&<select aria-label="Trạng thái" value={status} onChange={(e)=>{setPage(1);setStatus(e.target.value);}} className="ui-field"><option value="">Mọi trạng thái</option>{Object.entries(config.workflow?REVIEW_STATES:stateField==='verification_status'?VERIFICATION_STATES:config.fields.find((field)=>field.key==='status')?.options||{}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}
      <select aria-label="Sắp xếp" value={sort} onChange={(e)=>{setPage(1);setSort(e.target.value);}} className="ui-field"><option value="updated_at">Thời gian cập nhật</option><option value="name">Tên</option><option value="created_at">Ngày tạo</option>{config.fields.filter((field)=>['number','date','month','money'].includes(field.type)&&(resource!=='budgets'||aggregateBudgetFields.has(field.key))&&!(resource==='awards'&&field.key==='fixed_amount')).map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select>
      <select aria-label="Chiều sắp xếp" value={direction} onChange={e=>{setPage(1);setDirection(e.target.value);}} className="ui-field"><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select>
      <select aria-label="Lọc phòng ban" value={department} onChange={e=>{setPage(1);setDepartment(e.target.value);}} className="ui-field"><option value="">Mọi phòng ban được xem</option>{options.departments?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      {resource==='assignments'&&<select aria-label="Dự án" value={project} onChange={event=>{setPage(1);setProject(event.target.value);}} className="ui-field"><option value="">Mọi dự án</option>{options.projects?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      {config.fields.some(field=>field.type==='month')&&<MonthInput label="Lọc tháng" value={month} onChange={value=>{setPage(1);setMonth(value);}}/>}
      {scopeFor(user,config.module,'restore')!=='none'&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deleted} onChange={(e)=>{setPage(1);setDeleted(e.target.checked);}}/>Đã xóa</label>}
    </div>}
    {!form&&error&&<p role="alert" className="ui-notice mb-4">{error}</p>}
    {resource==='folders'&&!deleted&&!loading&&!error&&<FolderMap key={folderRevision+':'+data.items.map(row=>`${row.id}-${row.version}`).join(',')} onSelect={open}/>}
    {loading?<div role="status" className="ui-card ui-empty">Đang tải dữ liệu...</div>:error?<button type="button" onClick={load} className="ui-button ui-button-secondary">Thử tải lại</button>:resource==='budgets'?<SalaryBudgetTable items={data.items} summary={data.summary} offset={(page-1)*pageSize} onOpen={open}/>:!data.items.length?<div className="ui-card ui-empty">{resource==='positions'?'Chưa có chức vụ phù hợp. Thử thay đổi từ khóa hoặc bộ lọc phòng ban.':'Chưa có dữ liệu phù hợp. Dữ liệu chưa được xác minh không được tự động nhập từ tài liệu.'}</div>:resource==='awards'?<BonusAwardTable items={data.items} onOpen={open}/>:resource==='positions'?<PositionDuties items={data.items} total={data.total} onOpen={open} onEdit={edit} canEdit={row=>allowed('edit',row)}/>:<>
      <div className="grid gap-3 md:hidden">{data.items.map((row)=><article key={row.id} className="ui-card min-w-0 p-4"><button onClick={()=>open(row)} className="break-words text-left font-semibold text-teal">{row.name}</button><p className="my-2 text-xs text-slate"><>{showState&&<><span className={`rounded-full px-2 py-1 font-semibold ${rowTone(row)}`}>{rowLabel(row)}</span></>}</></p><dl className="space-y-2">{columns.map((field)=><div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 text-sm"><dt className="text-slate">{field.label}</dt><dd className="break-words text-right">{String(resource==='projects'&&field.key==='status'?rowLabel(row):fieldValue(field,row))}</dd></div>)}</dl>{resource==='budgets'&&<p className="mt-3 font-semibold">Tổng: {vnd(row.total_amount)}</p>}{resource==='awards'&&<p className="mt-3 font-semibold">Thưởng: {vnd(row.amount)}</p>}{resource==='staffing'&&<p className="mt-3 text-sm">Hiện có trong phòng: {row.actual_count} · Thiếu: {Math.max(0,row.target_count-row.actual_count)}</p>}{resource==='staffing'&&<button type="button" onClick={()=>open(row)} className="ui-button ui-button-secondary mt-3">{reviewLabel(row)}</button>}</article>)}</div>
      <div className="ui-card hidden overflow-x-auto md:block"><table className="ui-table"><thead><tr><th>Tên</th>{columns.map((field)=><th key={field.key}>{field.label}</th>)}{resource==='staffing'&&<th>Thực tế / Thiếu</th>}{resource==='budgets'&&<th>Tổng dự toán</th>}{showState&&<th>{resource==='projects'?'Cảnh báo tiến độ':'Trạng thái'}</th>}{resource==='staffing'&&<th>Thao tác</th>}</tr></thead><tbody>{data.items.map((row)=><tr key={row.id}><td><button onClick={()=>open(row)} className="text-left font-semibold text-teal hover:underline">{row.name}</button></td>{columns.map((field)=><td key={field.key}>{String(resource==='projects'&&field.key==='status'?rowLabel(row):fieldValue(field,row))}</td>)}{resource==='staffing'&&<td>{row.actual_count} / {Math.max(0,row.target_count-row.actual_count)}</td>}{resource==='budgets'&&<td>{vnd(row.total_amount)}</td>}{showState&&<td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rowTone(row)}`}>{rowLabel(row)}</span></td>}{resource==='staffing'&&<td><button type="button" onClick={()=>open(row)} className="ui-button ui-button-secondary whitespace-nowrap">{reviewLabel(row)}</button></td>}</tr>)}</tbody></table></div>
    </>}
    <Pagination page={page} pageSize={pageSize} total={data.total} loading={loading} error={error} onPageChange={setPage} onPageSizeChange={size=>{setPage(1);setPageSize(size);}} />
    {detail&&<Modal title={detail.name} onClose={()=>setDetail(null)} width="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">{showState&&<span className={`rounded-full px-3 py-1 text-sm ${rowTone(detail)}`}>{rowLabel(detail)}</span>}{config.workflow&&<span className="text-xs text-slate">Phiên bản {detail.version}</span>}{config.workflow&&(detail.status==='approved'||(detail.status==='submitted'&&resource!=='staffing'))&&<span className="flex items-center gap-1 text-xs text-teal"><LockKeyhole size={14}/>Nội dung đang khóa</span>}</div>
      {resource==='projects'&&detail.taskSummary?.length>0&&<div className="mb-4 rounded-lg bg-paper p-3 text-sm"><h3 className="font-semibold">Tiến độ công việc trong phạm vi được xem</h3><p className="mt-1">{detail.taskSummary.find(item=>item.status==='done')?.count||0} / {detail.taskSummary.reduce((sum,item)=>sum+item.count,0)} công việc đã nghiệm thu</p><div className="progress-track mt-2"><div className="progress-fill" style={{width:`${(detail.taskSummary.find(item=>item.status==='done')?.count||0)/detail.taskSummary.reduce((sum,item)=>sum+item.count,0)*100}%`}}/></div></div>}
      <div className="mb-4 flex flex-wrap gap-2">{resource!=='positions'&&<><button onClick={()=>setTab('detail')} className="ui-button ui-button-secondary" aria-pressed={tab==='detail'}>Chi tiết</button><button onClick={()=>setTab('history')} className="ui-button ui-button-secondary" aria-pressed={tab==='history'}>{config.workflow?'Lịch sử & Phiên bản':'Lịch sử thay đổi'}</button></>}
        {!detail.deleted_at&&allowed('edit',detail)&&(!config.workflow||['draft','rejected'].includes(detail.status)||(resource==='staffing'&&detail.status==='submitted'))&&<button onClick={()=>edit(detail)} className="ui-button ui-button-primary">Sửa</button>}
        {detail.deleted_at?allowed('restore',detail)&&<button disabled={saving} onClick={()=>transition('restore',detail)} className="ui-button ui-button-primary">Khôi phục</button>:<>
          {config.workflow&&['draft','rejected'].includes(detail.status)&&allowed('edit',detail)&&<button disabled={saving} onClick={()=>transition('submit',detail)} className="ui-button ui-button-primary">Gửi duyệt</button>}
          {config.workflow&&detail.status==='submitted'&&(detail.created_by!==user.id||(resource==='staffing'&&user.role==='admin'))&&allowed('approve',detail)&&<><button disabled={saving} onClick={()=>transition('approve',detail)} className="ui-button ui-button-primary">Duyệt</button><button disabled={saving} onClick={()=>transition('reject',detail)} className="ui-button ui-button-secondary">Yêu cầu bổ sung</button></>}
          {config.workflow&&detail.status==='approved'&&allowed('approve',detail)&&<button disabled={saving} onClick={()=>transition('reopen',detail)} className="ui-button ui-button-secondary">Mở lại</button>}
          {allowed('delete',detail)&&detail.status!=='approved'&&<button disabled={saving} onClick={()=>transition('delete',detail)} className="ui-button ui-button-secondary text-clay">Xóa</button>}
        </>}
      </div>
      {tab==='detail'?<div className="space-y-4">{resource==='staffing'&&detail.position_id!=null&&<p className="ui-notice">Định biên cũ theo chức vụ, chưa dùng cho tổng phòng ban. Khi sửa, hãy nhập tổng số người của phòng; lưu sẽ chuyển sang định biên phòng ban và giữ lịch sử cũ.</p>}<dl className="grid gap-4 sm:grid-cols-2">{config.fields.filter(field=>resource==='budgets'&&detail.budget_mode==='aggregate'?aggregateBudgetFields.has(field.key):resource!=='positions'||!['verification_status','role_description','responsibilities','requirements'].includes(field.key)).map((field)=><div key={field.key} className={field.type==='textarea'?'sm:col-span-2':''}><dt className="text-xs text-slate">{field.label}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm">{field.key==='url'&&detail.url?<a href={detail.url} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-teal underline"><ExternalLink size={14}/>Mở tài liệu</a>:String(resource==='projects'&&field.key==='status'?rowLabel(detail):fieldValue(field,detail))}</dd></div>)}</dl>{resource==='positions'&&<PositionDutySections row={detail}/>}{detail.feedback&&<div className="rounded-lg bg-paper p-3 text-sm">Phản hồi: {detail.feedback}</div>}{resource==='budgets'&&<p className="font-semibold">Quỹ lương: {vnd(detail.total_amount)}</p>}{resource==='awards'&&<div className="rounded-xl bg-paper p-4 text-sm"><div className="grid gap-3 sm:grid-cols-3"><p>{detail.award_scope==='department'?'Tổng thưởng phòng ban':'Tiền cố định cũ'}<strong className="mt-1 block">{vnd(detail.fixed_amount)}</strong></p><p>Tiền theo %<strong className="mt-1 block">{vnd(detail.percentage_amount)}</strong></p><p>Tổng thưởng<strong className="mt-1 block text-lg text-teal">{vnd(detail.amount)}</strong></p></div><p className="mt-3 text-xs text-slate">Tỷ lệ đã lưu: {Number(detail.policy_snapshot?.rate||0).toLocaleString('vi-VN',{maximumFractionDigits:4})}% · Chính sách phiên bản {detail.policy_snapshot?.version}. Đây là đề xuất/duyệt thưởng, chưa phải xác nhận chi tiền.</p></div>}{resource==='projects'&&<div className="flex flex-wrap gap-3"><Link href={`/timeline?project_id=${detail.id}`} className="ui-button ui-button-secondary">Công việc dự án</Link><Link href="/nhan-su-du-an" className="ui-button ui-button-secondary">Nhân sự dự án</Link></div>}</div>:<div className="space-y-4">{config.workflow&&<details className="rounded-xl border border-line p-4"><summary className="cursor-pointer font-semibold">Các phiên bản đã lưu ({detail.versions?.length||0})</summary><div className="mt-3 space-y-2">{detail.versions?.map(version=><details key={version.version} className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm">Phiên bản {version.version} · {dateText(version.created_at)}</summary><dl className="mt-3 space-y-3">{config.fields.filter(field=>resource==='budgets'&&version.snapshot?.budget_mode==='aggregate'?aggregateBudgetFields.has(field.key):field.key!=='verification_status').map(field=><div key={field.key}><dt className="text-xs text-slate">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{String(fieldValue(field,version.snapshot||{}))}</dd></div>)}</dl></details>)}</div></details>}<AuditTrail entries={detail.history} fields={config.fields} hiddenFields={resource==='positions'?['verification_status','requirements']:[]}/></div>}

      {resource==='folders'&&tab==='detail'&&<FolderLinks key={detail.id} folder={detail} onChanged={()=>setFolderRevision(value=>value+1)}/>}
      {error&&<p role="alert" className="ui-notice mt-4">{error}</p>}
    </Modal>}
    {form&&<Modal title={editing?'Chỉnh sửa':'Thêm '+config.title.toLocaleLowerCase('vi')} onClose={()=>!saving&&setForm(null)} width={['positions','budgets'].includes(resource)?'max-w-5xl':'max-w-4xl'}><form onSubmit={save} className="space-y-4"><p className="text-sm text-slate">{config.description}</p>{resource==='budgets'?<SalaryBudgetFields form={form} setForm={setForm} departments={options.departments}/>:resource==='awards'?<BonusAwardFields form={form} setForm={setForm} options={options} editing={editing}/>:resource==='positions'?<PositionDutyForm fields={config.fields} form={form} setForm={setForm} options={options} editing={editing}/>:<div className="grid gap-4 sm:grid-cols-2"><GovernanceFields resource={resource} fields={config.fields} form={form} setForm={setForm} options={options} editing={editing}/></div>}{error&&<p role="alert" className="ui-notice">{error}</p>}<div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white py-3"><button type="button" disabled={saving} onClick={()=>setForm(null)} className="ui-button ui-button-secondary">Hủy</button><button disabled={saving} className="ui-button ui-button-primary">{saving?'Đang lưu...':'Lưu dữ liệu'}</button></div></form></Modal>}
    {bulk&&<SalaryBudgetBatchForm departments={bulk.departments} initialMonth={bulk.month} onClose={()=>setBulk(null)} onSaved={result=>{setBulk(null);setMonth(result.month);setPage(1);setSearch('');setDepartment('');setStatus('');setDeleted(false);setSort('updated_at');setDirection('desc');setRevision(value=>value+1);setNotice(`Đã lưu ${result.created} dòng ngân sách.`);}}/>}
  </Frame>;
}
export default function GovernanceWorkspace({resource,title,navigation,embedded=false}){return <ProtectedRoute permission={GOVERNANCE[resource].module}><Content key={resource} resource={resource} title={title} navigation={navigation} embedded={embedded}/></ProtectedRoute>;}
