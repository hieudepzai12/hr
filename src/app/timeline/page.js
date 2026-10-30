'use client';
import { progressText } from '@/lib/task-progress';
import { confirmAction, requestReason } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import AuditTrail from '@/components/AuditTrail';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import ExcelImport from '@/components/ExcelImport';
import TaskProgressBoard from '@/components/TaskProgressBoard';
import useTaskList from '@/lib/useTaskList';
import { useAuth } from '@/context/AuthContext';
import { scopeFor, scopeAllows } from '@/lib/access';
import DateInput from '@/components/DateInput';
import TaskGroupEditor from '@/components/TaskGroupEditor';
import { taskGroupKey } from '@/lib/task-grouping';

function TaskContext({ task }) {
  const prefix = 'Khách hàng / đơn vị theo file: ';
  const lines = (task.description || '').split(/\r?\n/);
  const sourceLine = task.source_import_key ? lines.find(line => line.startsWith(prefix)) : null;
  const customer = task.customer_name || sourceLine?.slice(prefix.length).trim();
  const description = (sourceLine ? lines.filter(line => line !== sourceLine).join('\n') : task.description) || '';
  return <>
    {customer && <p className="mt-1 break-words text-sm text-ink"><span className="text-slate">Khách hàng: </span><strong>{customer}</strong></p>}
    {description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate">{description}</p>}
  </>;
}

const inputClass = 'ui-field mt-1';
const displayDate = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

function TimelineContent() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({});
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [saving, setSaving] = useState(false);
  const [deletingId,setDeletingId]=useState(null);
  const deleteLock=useRef(false);
  const filtersPanel=useRef(null);
  const listPanel=useRef(null);
  const [,setNotice]=useFeedback('success');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects,setProjects]=useState([]);
  const [editing, setEditing] = useState(null);
  const [groupForm, setGroupForm] = useState(null);
  const [opinionTask,setOpinionTask]=useState(null);
  const [opinionText,setOpinionText]=useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState('detail');
  const [review, setReview] = useState({ decision: 'approved', opinion: '' });
  const [error,setError]=useFeedback('error');
  const { items: tasks, loading, error: listError, refresh } = useTaskList({ ...filters, search: debouncedSearch || undefined });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = Object.fromEntries(['status', 'from', 'to', 'department_id', 'assignee_id', 'customer_id','project_id'].filter((key) => params.get(key)).map((key) => [key, params.get(key)]));
    if (Object.keys(initial).length) queueMicrotask(() => setFilters(initial));
    const taskId=params.get('task_id');
    if(taskId&&/^[1-9]\d*$/.test(taskId))api.get(`/tasks/${taskId}`).then(({data})=>{setEditing(data);setTab('detail');}).catch(err=>setError(err.response?.data?.error||'Không tải được công việc.'));
  }, [setError]);
  useEffect(()=>{if(scopeFor(user,'projects','view')==='none')return;api.get('/governance/projects',{params:{options:1}}).then(({data})=>setProjects(data.projects||[])).catch(()=>{});},[user]);
  useEffect(() => {
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
    api.get('/customers', { params: { active: 1 } }).then(({ data }) => setCustomers(data)).catch(() => {});
  }, []);
  useEffect(()=>{
    const update=()=>{
      const panel=listPanel.current;
      if(panel)panel.style.setProperty('--task-list-top',`${Math.max(0,panel.getBoundingClientRect().top)}px`);
    };
    const observer=new ResizeObserver(update);
    if(filtersPanel.current)observer.observe(filtersPanel.current);
    const header=document.querySelector('.app-header');
    if(header)observer.observe(header);
    window.addEventListener('resize',update);
    update();
    return ()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[error,listError]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const openCreate = () => { setEditing(null); setGroupForm({ isNew:true, name:'', department_id:user.department_id||'', customer_id:'', project_id:'', start_date:'', touched:{}, tasks:[{id:`new-${crypto.randomUUID()}`,title:'',description:''}] }); setError(''); };

  const openTask = async (task) => {
    setError('');
    try {
      const { data } = await api.get(`/tasks/${task.id}`);
      setEditing(data);
      setTab('detail');
    } catch (err) { setError(err.response?.data?.error || 'Không tải được công việc'); }
  };
  const decide = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api.post(`/tasks/${editing.id}/review`, review); await openTask(editing); refresh(); setNotice('Đã lưu kết quả nghiệm thu.'); }
    catch (err) { setError(err.response?.data?.error || 'Không lưu được nghiệm thu'); }
    finally { setSaving(false); }
  };
  const removeGroup = async project => {
    if (deleteLock.current || saving) return;
    deleteLock.current = true;
    const key = `group-${project.tasks[0].assignee_id}-${project.key}`;
    setDeletingId(key);
    try {
      if (!await confirmAction(`Xóa ${project.tasks.length} công việc đang hiển thị trong ${project.name}?`)) return;
      await api.delete('/tasks/batch', { data: { task_ids: project.tasks.map(task => task.id) } });
      if (project.tasks.some(task => task.id === editing?.id)) setEditing(null);
      refresh();
      setNotice(`Đã xóa ${project.tasks.length} công việc.`);
    } catch (err) { setError(err.response?.data?.error || 'Không xóa được nhóm công việc'); }
    finally { deleteLock.current = false; setDeletingId(null); }
  };
  const restore = async (task) => {
    try { await api.post(`/tasks/${task.id}/restore`); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không khôi phục được công việc'); }
  };
  const saveOpinion=async event=>{
    event.preventDefault();if(saving)return;setSaving(true);
    try{await api.post(`/tasks/${opinionTask.id}/opinion`,{opinion:opinionText});setOpinionTask(null);refresh();setNotice('Đã lưu ý kiến lãnh đạo.');}
    catch(err){setError(err.response?.data?.error||'Không lưu được ý kiến');}
    finally{setSaving(false);}
  };
  const canEditRow = task => (user.role!=='employee'||Number(task.assignee_id)===Number(user.id)) && scopeAllows(user,'tasks','edit',{ownerId:task.assignee_id,departmentId:task.department_id});
  const canDeleteRow = task => scopeAllows(user,'tasks','delete',{ownerId:task.assignee_id,departmentId:task.department_id});
  const canApprove = editing?.id && editing.status === 'review' && Number(editing.assignee_id) !== Number(user.id) &&
    scopeAllows(user, 'tasks', 'approve', { ownerId: editing.assignee_id, departmentId: editing.department_id });
  const groupStatus = project => {
    const active=project.tasks.filter(task=>task.status!=='done'&&task.status!=='cancelled');
    if(!active.length)return {label:project.tasks.every(task=>task.status==='done')?'Hoàn thành':'Đã kết thúc',className:'text-emerald-700'};
    const priority={overdue:0,behind:1,today:2,upcoming:3,review:4};
    const warning=active.map(task=>task.alert).filter(item=>item&&priority[item.kind]!==undefined).sort((a,b)=>priority[a.kind]-priority[b.kind]||(a.days??0)-(b.days??0))[0];
    if(warning)return {label:warning.label,className:warning.kind==='overdue'||warning.kind==='behind'?'text-clay':warning.kind==='review'?'text-teal':'text-amber-dark'};
    if(active.every(task=>task.status==='review'))return {label:'Chờ nghiệm thu',className:'text-teal'};
    return active.some(task=>task.status==='in_progress'||task.status==='review')||active.length<project.tasks.length?{label:'Đang thực hiện',className:'text-blue-700'}:{label:'Chưa bắt đầu',className:'text-slate'};
  };

  const visibleTasks = useMemo(() => [...tasks].sort((a, b) => {
    if (a.assignee_id == null) return b.assignee_id == null ? 0 : 1;
    if (b.assignee_id == null) return -1;
    return (a.assignee_name || '').localeCompare(b.assignee_name || '', 'vi') ||
      Number(a.assignee_id) - Number(b.assignee_id);
  }), [tasks]);
  const taskGroups = useMemo(() => {
    const groups = new Map();
    for (const task of visibleTasks) {
      const key = task.assignee_id == null ? 'unassigned' : String(task.assignee_id);
      if (!groups.has(key)) groups.set(key, { key, name: task.assignee_name || '—', tasks: [] });
      groups.get(key).tasks.push(task);
    }
    return [...groups.values()].map(group => {
      const byProject = new Map();
      for (const task of group.tasks) {
        const key = taskGroupKey(task);
        if (!byProject.has(key)) byProject.set(key, { key, name: task.project_id ? task.project_name||projects.find(project => Number(project.id) === Number(task.project_id))?.name || `Dự án #${task.project_id}` : task.customer_name || 'Chưa gắn dự án / khách hàng', tasks: [] });
        byProject.get(key).tasks.push(task);
      }
      return { ...group, projects: [...byProject.values()] };
    });
  }, [visibleTasks, projects]);


  const openGroup = project => {
    setGroupForm({ ...project, isNew:false, touched:{}, department_id:project.tasks[0].department_id||'', customer_id:project.tasks[0].customer_id||'',project_id:project.tasks[0].project_id||'',start_date:project.tasks[0].start_date||'', tasks: project.tasks.map(task => ({ ...task, original_due_date:task.due_date||'' })) });
    setError('');
  };
  const removeFormTask = async id => {
    if(saving||deleteLock.current)return;
    const remaining=groupForm.tasks.filter(task=>task.id!==id);
    if(typeof id==='string'){
      setGroupForm(current=>({...current,tasks:remaining.length?remaining:[{id:`new-${crypto.randomUUID()}`,title:'',description:'',due_date:''}]}));
      return;
    }
    if(remaining.length&&!remaining.some(task=>typeof task.id==='number')){
      setError('Hãy lưu các công việc mới trước khi xóa công việc đã lưu cuối cùng.');
      return;
    }
    deleteLock.current=true;setSaving(true);
    try{
      if(!await confirmAction('Xóa công việc này?'))return;
      await api.delete(`/tasks/${id}`);
      setGroupForm(current=>remaining.length?{...current,tasks:remaining}:null);
      refresh();setNotice('Đã xóa công việc. Có thể khôi phục trong mục Đã xóa.');
    }catch(err){setError(err.response?.data?.error||'Không xóa được công việc');}
    finally{deleteLock.current=false;setSaving(false);}
  };
  const saveGroup = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (groupForm.tasks.some(task => !task.title.trim() || task.title.length > 500)) {
        setError('Mỗi công việc cần có nội dung và không quá 500 ký tự.');
        return;
      }
      const payload = { tasks: groupForm.tasks.map(({ id, title, description, due_date }) => ({ ...(typeof id==='number'?{id}:{}), title: title.trim(), description, due_date:due_date||'' })) };
      for(const field of ['department_id','project_id','start_date']) if(groupForm.isNew||groupForm.touched[field]) payload[field]=groupForm[field];
      if (!groupForm.isNew && groupForm.tasks.some(task=>typeof task.id==='number'&&(task.due_date||'')!==task.original_due_date)) {
        payload.reason=await requestReason('Lý do thay đổi hạn chót công việc:');
        if(!payload.reason)return;
      }
      if(groupForm.isNew) await api.post('/tasks/batch',payload); else await api.put('/tasks/batch', payload);
      setGroupForm(null); refresh(); setNotice('Đã lưu nhóm công việc.');
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được nhóm công việc'); }
    finally { setSaving(false); }
  };
  return <Layout title="Danh sách công việc"
    actions={<div className="task-toolbar-actions flex flex-wrap gap-2">{scopeFor(user,'tasks','restore')!=='none'&&<button type="button" aria-pressed={filters.deleted==='1'} onClick={()=>setFilter('deleted',filters.deleted==='1'?'':'1')} className="ui-button ui-button-secondary">{filters.deleted==='1'?'Về danh sách':'Đã xóa'}</button>}{scopeFor(user, 'tasks', 'create') !== 'none' && <><button onClick={() => setImportOpen(true)} className="ui-button ui-button-secondary">Nhập Excel</button><button onClick={openCreate} className="ui-button ui-button-primary">Thêm công việc</button></>}</div>}>
    <div ref={filtersPanel} className="task-filters-panel ui-card mb-3 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Danh sách công việc</h2></div><div className="flex rounded-lg border border-line bg-paper p-1" role="group" aria-label="Chế độ xem"><button onClick={() => setView('board')} aria-pressed={view === 'board'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}> Tiến độ</button><button onClick={() => setView('table')} aria-pressed={view === 'table'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}>Bảng</button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Tìm kiếm<input aria-label="Tìm công việc" placeholder="Tên việc, nhân viên..." value={search} onChange={(event) => setSearch(event.target.value)} className="ui-field mt-1" /></label>
      {scopeFor(user,'projects','view')!=='none'&&<label className="min-w-0 text-sm font-medium">Dự án<select aria-label="Lọc dự án" value={filters.project_id||''} onChange={e=>setFilter('project_id',e.target.value)} className={inputClass}><option value="">Mọi dự án</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}

      <label className="min-w-0 text-sm font-medium">Phòng ban<select aria-label="Lọc phòng ban" value={filters.department_id||''} onChange={event=>setFilters(current=>({...current,department_id:event.target.value||undefined,assignee_id:undefined}))} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Người thực hiện<select aria-label="Lọc nhân viên" value={filters.assignee_id||''} onChange={event=>setFilters(current=>({...current,mine:undefined,assignee_id:event.target.value||undefined}))} className={inputClass}><option value="">Tất cả nhân viên</option>{employees.filter(employee=>employee.role!=='admin'&&(!filters.department_id||String(employee.department_id)===String(filters.department_id))).map(employee=><option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
      </div>

      {(filters.from||filters.to)&&<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate"><span>Hạn: {displayDate(filters.from)} – {displayDate(filters.to)}</span><button type="button" className="text-teal underline" onClick={()=>setFilters(current=>({...current,from:undefined,to:undefined}))}>Bỏ lọc ngày</button></div>}

      {filters.customer_id&&<div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span>Khách hàng: {customers.find(customer=>String(customer.id)===String(filters.customer_id))?.name||filters.customer_id}</span><button type="button" onClick={()=>setFilter('customer_id','')} className="text-teal underline">Bỏ lọc khách hàng</button></div>}
      {filters.status&&<div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span>Đang lọc trạng thái từ Tổng quan</span><button type="button" onClick={()=>setFilter('status','')} className="text-teal underline">Bỏ lọc trạng thái</button></div>}
      {(search || Object.values(filters).some(Boolean)) && <button type="button" onClick={() => { setFilters({}); setSearch(''); }} className="ui-button ui-button-secondary mt-3">Xóa bộ lọc</button>}
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}

    <div ref={listPanel} className="task-list-scroll" role="region" aria-label="Danh sách công việc, cuộn để xem thêm" tabIndex={0}>
    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải công việc...</div> : !visibleTasks.length ? <div className="ui-card ui-empty">Không tìm thấy công việc phù hợp.</div> : view === 'board' ?
      <TaskProgressBoard tasks={visibleTasks} onOpen={task => filters.deleted === '1' ? restore(task) : openTask(task)} /> :
      <div className="ui-card min-w-0 max-w-full" role="region" aria-label="Bảng công việc, cuộn ngang để xem các cột" tabIndex={0}><table className="ui-table task-list-table"><colgroup><col className="task-col-title" /><col className="task-col-deadline" /><col className="task-col-progress" /><col className="task-col-report" /><col className="task-col-report" /><col className="task-col-opinion" /><col className="task-col-actions" /></colgroup><thead><tr><th>Công việc</th><th>Hạn / Trạng thái</th><th>Tiến độ</th><th>Vướng mắc</th><th>Giải pháp</th><th>Ý kiến lãnh đạo</th><th>Thao tác</th></tr></thead>{taskGroups.map(group => <tbody key={group.key} data-task-assignee={group.key}><tr className="task-group-heading"><td colSpan={7}><div className="flex items-center gap-3"><strong>{group.name}</strong><span className="task-group-count">{group.tasks.length} công việc</span></div></td></tr>{group.projects.map(project => <Fragment key={project.key}>
      <tr className="task-project-heading"><td colSpan={7}><div className="task-project-caption"><h3>{project.name}</h3><span>{project.tasks.length} công việc</span></div></td></tr>
      {project.tasks.map((task,index)=>{
        const status=groupStatus({tasks:[task]});
        return <tr key={task.id} data-task-row={task.id} data-task-project={index===0?project.key:undefined} data-task-count={index===0?project.tasks.length:undefined} className="task-project-row">
          <td className="task-project-content"><div data-task-id={task.id} className="task-project-item"><strong className="block whitespace-pre-wrap break-words font-semibold leading-6 text-ink">{index+1}. {task.title}</strong><TaskContext task={task} /></div></td>
          <td data-label="Hạn / Trạng thái" className="task-deadline-cell"><div data-task-deadline={task.id}><strong className="text-sm">{task.due_date?displayDate(task.due_date):'Chưa đặt hạn'}</strong><span className={`mt-1 block text-xs font-semibold ${status.className}`}>{status.label}</span></div></td>
          {['progress','blockers','solution'].map(field=>{const value=field==='progress'?progressText(task.report_update||{}):task.report_update?.[field]?.trim();return <td key={field} data-label={{progress:'Tiến độ',blockers:'Vướng mắc',solution:'Giải pháp'}[field]}><div data-task-report={task.id} className="task-report-value">{value&&value!=='—'?value:null}</div></td>;})}
          <td data-label="Ý kiến lãnh đạo"><p className="whitespace-pre-wrap break-words text-sm leading-6">{task.leader_opinion||''}</p>{filters.deleted!=='1'&&task.has_submitted_report&&scopeAllows(user,'tasks','approve',{ownerId:task.assignee_id,departmentId:task.department_id})&&<button type="button" disabled={saving} onClick={()=>{setOpinionTask(task);setOpinionText(task.leader_opinion||'');}} className="mt-2 text-xs font-semibold text-teal hover:underline focus-ring">{task.leader_opinion?'Sửa ý kiến':'Cho ý kiến'}</button>}</td>
          {index===0&&<td rowSpan={project.tasks.length} className="task-actions-cell" data-label="Thao tác">{filters.deleted!=='1'?<div className="flex flex-wrap gap-2">{project.tasks.every(canEditRow)&&<button type="button" disabled={saving||deletingId!==null} onClick={()=>openGroup(project)} className="ui-button ui-button-secondary">Sửa</button>}{project.tasks.every(canDeleteRow)&&<button type="button" disabled={saving||deletingId!==null} onClick={()=>removeGroup(project)} className="ui-button ui-button-secondary" style={{color:'var(--color-clay)'}}>{deletingId===`group-${project.tasks[0].assignee_id}-${project.key}`?'Đang xóa…':'Xóa'}</button>}</div>:project.tasks.map(task => <div key={task.id} className="mb-3"><span className="mb-1 block text-xs text-slate">#{task.id}</span>{scopeAllows(user,'tasks','restore',{ownerId:task.assignee_id,departmentId:task.department_id})&&<button type="button" onClick={()=>restore(task)} className="ui-button ui-button-secondary">Khôi phục</button>}</div>)}</td>}
        </tr>;
      })}
    </Fragment>) }</tbody>)}</table></div>}
    </div>
    {opinionTask&&<Modal title={opinionTask.leader_opinion?'Sửa ý kiến lãnh đạo':'Cho ý kiến lãnh đạo'} onClose={()=>{if(!saving)setOpinionTask(null);}} width="max-w-2xl"><form onSubmit={saveOpinion} className="space-y-4"><h3 className="whitespace-pre-wrap break-words text-sm font-semibold">{opinionTask.title}</h3><label className="block text-sm font-medium">Ý kiến<textarea required maxLength={10000} rows={6} value={opinionText} disabled={saving} onChange={event=>setOpinionText(event.target.value)} className="ui-field mt-2" /></label><div className="flex justify-end gap-2 border-t border-line pt-3"><button type="button" disabled={saving} onClick={()=>setOpinionTask(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving||!opinionText.trim()||opinionText.trim()===(opinionTask.leader_opinion||'').trim()} className="ui-button ui-button-primary">{saving?'Đang lưu...':'Lưu ý kiến'}</button></div></form></Modal>}
    {groupForm && <Modal title={groupForm.isNew?'Thêm công việc':`Sửa công việc – ${groupForm.name}`} onClose={()=>{if(!saving)setGroupForm(null);}} width="max-w-7xl"><form onSubmit={saveGroup} className="space-y-5"><fieldset disabled={saving} className="space-y-4">
      <section className="rounded-xl border border-line bg-slate-50/60 p-4"><h3 className="mb-4 text-sm font-semibold text-ink">Thông tin chung</h3><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Dự án<select aria-label="Dự án công việc" value={groupForm.project_id} onChange={event=>setGroupForm(current=>({...current,project_id:event.target.value,touched:{...current.touched,project_id:true}}))} className="ui-field mt-2"><option value="">Không chọn dự án</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>

      <label className="text-sm font-medium">Phòng ban thực hiện{(user.role!=='admin'||groupForm.project_id)&&<span className="required-mark">*</span>}<select aria-label="Phòng ban công việc" required={user.role!=='admin'||Boolean(groupForm.project_id)} value={groupForm.department_id} onChange={event=>setGroupForm(current=>({...current,department_id:event.target.value,touched:{...current.touched,department_id:true}}))} className="ui-field mt-2"><option value="">{user.role==='admin'?'Không gắn phòng ban':'Chọn phòng ban'}</option>{departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <DateInput label="Ngày bắt đầu" value={groupForm.start_date} onChange={value=>setGroupForm(current=>({...current,start_date:value,touched:{...current.touched,start_date:true}}))} />

      </div></section>
      <TaskGroupEditor tasks={groupForm.tasks} canDeleteTask={canDeleteRow} onDeadlineChange={(id,due_date)=>setGroupForm(current=>({...current,tasks:current.tasks.map(task=>task.id===id?{...task,due_date}:task)}))} onDescriptionChange={(id,description)=>setGroupForm(current=>({...current,tasks:current.tasks.map(task=>task.id===id?{...task,description}:task)}))} onAdd={()=>setGroupForm(current=>({...current,tasks:[...current.tasks,{id:`new-${crypto.randomUUID()}`,title:'',description:''}]}))} onRemove={removeFormTask} onChange={(id,title)=>setGroupForm(current=>({...current,tasks:current.tasks.map(task=>task.id===id?{...task,title}:task)}))} />


      </fieldset><div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-line bg-white px-1 py-3"><button type="button" disabled={saving} onClick={()=>setGroupForm(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving?'Đang lưu...':'Lưu thay đổi'}</button></div></form></Modal>}
    {importOpen && <ExcelImport onClose={() => setImportOpen(false)} onImported={({ imported, skipped }) => { refresh(); setNotice(`Đã nhập ${imported} công việc, bỏ qua ${skipped} dòng.`); }} />}
    {editing && <Modal title={editing.id ? `Công việc #${editing.id}` : 'Thêm công việc'} onClose={() => setEditing(null)} width="max-w-7xl">

      {editing.id && <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3">{[['detail', 'Chi tiết'], ['updates', 'Tiến độ và nghiệm thu'], ['history', 'Lịch sử']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-sm ${tab === key ? 'bg-teal text-white' : 'bg-paper'}`}>{label}</button>)}</div>}
      {tab === 'detail' && <div className="space-y-4"><div className="ui-card space-y-3 whitespace-pre-wrap break-words p-4 text-sm leading-6"><h3 className="font-semibold">{editing.title}</h3><p>{editing.description || 'Chưa có mô tả.'}</p><p>Khách hàng: {customers.find((c) => c.id === editing.customer_id)?.name || '—'}</p><p>Hạn chót: {displayDate(editing.due_date)}</p><p>Ý kiến lãnh đạo: {editing.leader_opinion || '—'}</p></div>
        {editing.id && <>{editing.source_import_row?.sheet && Number(editing.source_import_row.row)>0 && <details className="rounded-md border border-line p-3 text-xs"><summary className="cursor-pointer">Dòng Excel nguồn: {editing.source_import_row.sheet}!{editing.source_import_row.row}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(editing.source_import_row.values, null, 2)}</pre></details>}</>}
      </div>}
      {tab === 'updates' && editing.id && <div className="space-y-4">
        {canApprove && <form onSubmit={decide} className="space-y-2 rounded-md border border-line p-3"><div className="font-medium">Nghiệm thu của quản lý</div><select value={review.decision} onChange={(e) => setReview({ ...review, decision: e.target.value })} className={inputClass}><option value="approved">Nghiệm thu hoàn thành</option><option value="rejected">Yêu cầu bổ sung</option></select><textarea required placeholder="Ý kiến lãnh đạo" value={review.opinion} onChange={(e) => setReview({ ...review, opinion: e.target.value })} className={inputClass} /><button disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu nghiệm thu'}</button></form>}
        {editing.updates?.map((item) => <div key={item.id} className="rounded-md border border-line p-3 text-sm"><div className="font-medium">{item.employee_name} · {new Date(item.created_at).toLocaleString('vi-VN')}</div><p className="whitespace-pre-wrap break-words">Tiến độ: {progressText(item)}</p><p className="whitespace-pre-wrap break-words">Vướng mắc: {item.blockers || '—'} · Giải pháp: {item.solution || '—'}</p></div>)}
      </div>}
      {tab === 'history' && editing.id && <AuditTrail entries={editing.history}/>}
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
    </Modal>}
  </Layout>;
}

export default function TimelinePage() { return <ProtectedRoute permission="tasks"><TimelineContent /></ProtectedRoute>; }
