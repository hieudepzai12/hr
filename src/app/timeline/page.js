'use client';
import { progressText } from '@/lib/task-progress';
import { requestReason } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useMemo, useRef, useState } from 'react';
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

const blank = { title: '', description: '', assignee_id: '', department_id: '', customer_id: '', collaborator_ids: [],
  business_group: '', expected_outcome: '', priority: 'medium', start_date: '', due_date: '',
  planned_progress_date: '', planned_progress: '' };
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
  const [,setNotice]=useFeedback('success');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects,setProjects]=useState([]);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [tab, setTab] = useState('detail');
  const [review, setReview] = useState({ decision: 'approved', opinion: '' });
  const [error,setError]=useFeedback('error');
  const { items: tasks, loading, error: listError, refresh } = useTaskList({ ...filters, search: debouncedSearch || undefined });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = Object.fromEntries(['status', 'from', 'to', 'department_id', 'assignee_id', 'customer_id','project_id','mine'].filter((key) => params.get(key)).map((key) => [key, params.get(key)]));
    if (Object.keys(initial).length) queueMicrotask(() => setFilters(initial));
    const taskId=params.get('task_id');
    if(taskId&&/^[1-9]\d*$/.test(taskId))api.get(`/tasks/${taskId}`).then(({data})=>{setEditing(data);setForm({...blank,...data,collaborator_ids:data.collaborator_ids||[]});setTab('detail');}).catch(err=>setError(err.response?.data?.error||'Không tải được công việc.'));
  }, [setError]);
  useEffect(()=>{if(scopeFor(user,'projects','view')==='none')return;api.get('/governance/projects',{params:{options:1}}).then(({data})=>setProjects(data.projects||[])).catch(()=>{});},[user]);
  useEffect(() => {
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
    api.get('/customers', { params: { active: 1 } }).then(({ data }) => setCustomers(data)).catch(() => {});
  }, []);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const openCreate = () => { setEditing({}); setForm({ ...blank, assignee_id: user.id, department_id: user.department_id || '' }); setTab('detail'); setError(''); };
  const openTask = async (task) => {
    setError('');
    try {
      const { data } = await api.get(`/tasks/${task.id}`);
      setEditing(data);
      setForm({ ...blank, ...data, collaborator_ids: data.collaborator_ids || [] });
      setTab('detail');
    } catch (err) { setError(err.response?.data?.error || 'Không tải được công việc'); }
  };
  const save = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...form };
      delete payload.planned_progress;
      delete payload.planned_progress_date;
      if (!editing.id) {
        payload.assignee_id = user.id;
        payload.department_id = form.department_id || user.department_id || '';
        payload.collaborator_ids = [];
      }
      if (editing.id) {
        if (payload.due_date !== editing.due_date) {
          const reason = await requestReason('Lý do thay đổi hạn chót:');
          if (!reason?.trim()) return;
          payload.reason = reason;
        }
        delete payload.status; delete payload.progress; delete payload.progress_text; delete payload.leader_opinion;
        await api.put(`/tasks/${editing.id}`, payload);
        await openTask(editing);
      } else {
        const { data } = await api.post('/tasks', payload);
        await openTask(data);
        setTab('updates');
      }
      refresh(); setNotice('Đã lưu công việc.');
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được công việc'); }
    finally { setSaving(false); }
  };
  const decide = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api.post(`/tasks/${editing.id}/review`, review); await openTask(editing); refresh(); setNotice('Đã lưu kết quả nghiệm thu.'); }
    catch (err) { setError(err.response?.data?.error || 'Không lưu được nghiệm thu'); }
    finally { setSaving(false); }
  };
  const remove = async task => {
    if(deleteLock.current||saving)return;
    deleteLock.current=true;setDeletingId(task.id);
    try {
      const reason=await requestReason('Lý do xóa công việc:');
      if(!reason?.trim())return;
      await api.delete(`/tasks/${task.id}`,{data:{reason}});
      if(editing?.id===task.id)setEditing(null);
      refresh();setNotice('Đã xóa công việc.');
    }catch(err){setError(err.response?.data?.error||'Không xóa được công việc');}
    finally{deleteLock.current=false;setDeletingId(null);}
  };
  const restore = async (task) => {
    try { await api.post(`/tasks/${task.id}/restore`); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không khôi phục được công việc'); }
  };
  const canEditRow = task => user.role !== 'employee' && scopeAllows(user,'tasks','edit',{ownerId:task.assignee_id,departmentId:task.department_id});
  const canDeleteRow = task => scopeAllows(user,'tasks','delete',{ownerId:task.assignee_id,departmentId:task.department_id});
  const canEdit = editing?.id && canEditRow(editing);
  const canApprove = editing?.id && editing.status === 'review' && Number(editing.assignee_id) !== Number(user.id) &&
    scopeAllows(user, 'tasks', 'approve', { ownerId: editing.assignee_id, departmentId: editing.department_id });
  const alert = (task) => task.alert && task.alert.kind !== 'missing' && <span className={`text-xs font-semibold ${task.alert.kind === 'overdue' ? 'text-clay' : task.alert.kind === 'review' ? 'text-teal' : 'text-amber-dark'}`}>{task.alert.label}</span>;
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
    return [...groups.values()];
  }, [visibleTasks]);
  return <Layout title="Danh sách công việc"
    actions={<div className="flex flex-wrap gap-2">{scopeFor(user, 'tasks', 'create') !== 'none' && <><button onClick={() => setImportOpen(true)} className="ui-button ui-button-secondary">Nhập Excel</button><button onClick={openCreate} className="ui-button ui-button-primary">Thêm công việc</button></>}</div>}>
    <div className="ui-card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Danh sách công việc</h2></div><div className="flex rounded-lg border border-line bg-paper p-1" role="group" aria-label="Chế độ xem"><button onClick={() => setView('board')} aria-pressed={view === 'board'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}> Tiến độ</button><button onClick={() => setView('table')} aria-pressed={view === 'table'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}>Bảng</button></div></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Tìm kiếm<input aria-label="Tìm công việc" placeholder="Tìm công việc" value={search} onChange={(event) => setSearch(event.target.value)} className="ui-field" /></label>
      <label className="min-w-0 text-sm font-medium">Phòng ban<select aria-label="Lọc phòng ban" value={filters.department_id || ''} onChange={(event) => setFilter('department_id', event.target.value)} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Người thực hiện<select aria-label="Lọc nhân viên" value={filters.mine === '1' ? 'mine' : filters.assignee_id || ''} onChange={(event) => setFilters(current => ({ ...current, mine: event.target.value === 'mine' ? '1' : undefined, assignee_id: event.target.value === 'mine' ? undefined : event.target.value || undefined }))} className={inputClass}><option value="">Mọi người trong phạm vi quyền</option><option value="mine">Việc tôi phụ trách hoặc phối hợp</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Khách hàng<select aria-label="Lọc khách hàng" value={filters.customer_id || ''} onChange={(event) => setFilter('customer_id', event.target.value)} className={inputClass}><option value="">Mọi khách hàng</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {scopeFor(user,'projects','view')!=='none'&&<label className="min-w-0 text-sm font-medium">Dự án<select aria-label="Lọc dự án" value={filters.project_id||''} onChange={e=>setFilter('project_id',e.target.value)} className={inputClass}><option value="">Mọi dự án</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <label className="min-w-0 text-sm font-medium">Hạn từ ngày<input aria-label="Hạn từ ngày" type="date" value={filters.from || ''} onChange={(event) => setFilter('from', event.target.value)} className={inputClass} /></label>
      <label className="min-w-0 text-sm font-medium">Hạn đến ngày<input aria-label="Hạn đến ngày" type="date" value={filters.to || ''} onChange={(event) => setFilter('to', event.target.value)} className={inputClass} /></label>
      {scopeFor(user, 'tasks', 'restore') !== 'none' && <label className="flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={filters.deleted === '1'} onChange={(event) => setFilter('deleted', event.target.checked ? '1' : '')} /> Hiện công việc đã xóa</label>}
      </div>
      {(search || Object.values(filters).some(Boolean)) && <button type="button" onClick={() => { setFilters({}); setSearch(''); }} className="ui-button ui-button-secondary mt-3">Xóa bộ lọc</button>}
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}

    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải công việc...</div> : !visibleTasks.length ? <div className="ui-card ui-empty">Không tìm thấy công việc phù hợp.</div> : view === 'board' ?
      <TaskProgressBoard tasks={visibleTasks} onOpen={task => filters.deleted === '1' ? restore(task) : openTask(task)} /> :
      <div className="ui-card min-w-0 max-w-full overflow-x-auto" role="region" aria-label="Bảng công việc, cuộn ngang để xem các cột" tabIndex={0}><table className="ui-table task-list-table"><colgroup><col className="task-col-title" /><col className="task-col-deadline" /><col className="task-col-actions" /></colgroup><thead><tr><th>Công việc</th><th>Hạn</th><th>Thao tác</th></tr></thead>{taskGroups.map(group => <tbody key={group.key} data-task-assignee={group.key}><tr className="task-group-heading"><td colSpan={3}><div className="flex items-center gap-3"><strong>{group.name}</strong><span className="task-group-count">{group.tasks.length} công việc</span></div></td></tr>{group.tasks.map(task => <tr key={task.id} data-task-id={task.id}><td><button type="button" onClick={() => filters.deleted === '1' ? restore(task) : openTask(task)} className="block w-full whitespace-pre-wrap break-words text-left font-semibold leading-6 text-teal hover:underline focus-ring"><strong className="font-bold">#{task.id} {task.title}</strong></button><TaskContext task={task} />{task.collaborator_ids?.length > 0 && <span className="mt-2 block text-xs text-slate">+{task.collaborator_ids.length} phối hợp</span>}</td><td>{displayDate(task.due_date)}<span className="block">{alert(task)}</span></td><td><div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">{filters.deleted==='1'?scopeAllows(user,'tasks','restore',{ownerId:task.assignee_id,departmentId:task.department_id})&&<button type="button" onClick={()=>restore(task)} className="ui-button ui-button-secondary">Khôi phục</button>:<>{canEditRow(task)&&<button type="button" disabled={saving||deletingId!==null} onClick={()=>openTask(task)} className="ui-button ui-button-secondary">Sửa</button>}{canDeleteRow(task)&&<button type="button" disabled={saving||deletingId!==null} onClick={()=>remove(task)} className="ui-button ui-button-secondary" style={{color:'var(--color-clay)'}}>{deletingId===task.id?'Đang xóa…':'Xóa'}</button>}</>}</div></td></tr>)}</tbody>)}</table></div>}
    {importOpen && <ExcelImport onClose={() => setImportOpen(false)} onImported={({ imported, skipped }) => { refresh(); setNotice(`Đã nhập ${imported} công việc, bỏ qua ${skipped} dòng.`); }} />}
    {editing && <Modal title={editing.id ? `Công việc #${editing.id}` : 'Thêm công việc'} onClose={() => setEditing(null)} width="max-w-7xl">
      {editing.id && <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3">{[['detail', 'Chi tiết'], ['updates', 'Tiến độ và nghiệm thu'], ['history', 'Lịch sử']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-sm ${tab === key ? 'bg-teal text-white' : 'bg-paper'}`}>{label}</button>)}</div>}
      {tab === 'detail' && <div className="space-y-4">{(!editing.id || canEdit) ? <form onSubmit={save} className="space-y-4">
        <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Thông tin chung</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Tên công việc<span className="required-mark">*</span><textarea required rows={4} maxLength={500} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} /></label>
          <label className="text-sm sm:col-span-2">Mô tả<textarea rows={6} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></label>
          <label className="text-sm">Khách hàng<select value={form.customer_id || ''} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputClass}><option value="">Không có</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {scopeFor(user,'projects','view')!=='none'&&<label className="text-sm">Dự án<select value={form.project_id||''} onChange={e=>setForm({...form,project_id:e.target.value})} className={inputClass}><option value="">Không có</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
        </div></fieldset>
        {!editing.id ? <section className="rounded-lg border border-line bg-paper p-4 text-sm"><h3 className="font-semibold">Công việc của tôi</h3><p className="mt-1">Người thực hiện: {user.full_name || user.email}</p><label className="mt-3 block text-sm font-medium">Phòng ban thực hiện{user.role!=='admin'||form.project_id?<span className="required-mark">*</span>:<span className="font-normal text-slate"> (nếu có)</span>}<select aria-label="Phòng ban công việc" required={user.role!=='admin'||Boolean(form.project_id)} value={form.department_id || ''} onChange={event=>setForm({...form,department_id:event.target.value})} className={inputClass}><option value="">{user.role==='admin'&&!form.project_id?'Không gắn phòng ban':'Chọn phòng ban'}</option>{departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label></section> : <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Người thực hiện</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Phòng ban{(user.role!=='admin'||form.project_id)&&<span className="required-mark">*</span>}<select required={user.role!=='admin'||Boolean(form.project_id)} value={form.department_id || ''} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputClass}><option value="">{user.role==='admin'&&!form.project_id?'Không gắn phòng ban':'Chọn phòng ban'}</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="text-sm">Người phụ trách chính<span className="required-mark">*</span><select required value={form.assignee_id || ''} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className={inputClass}><option value="">Chọn nhân viên</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
          <label className="text-sm sm:col-span-2">Người phối hợp<select multiple value={(form.collaborator_ids || []).map(String)} onChange={(e) => setForm({ ...form, collaborator_ids: [...e.target.selectedOptions].map((option) => Number(option.value)) })} className={inputClass}>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select><span className="ui-help">Giữ Ctrl để chọn nhiều người.</span></label>
        </div></fieldset>}
        <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Thời gian và mốc tiến độ</legend><div className="grid gap-3 sm:grid-cols-2">
          <DateInput label="Ngày bắt đầu" value={form.start_date || ''} onChange={(value) => setForm((current) => ({ ...current, start_date: value }))} />
          <DateInput label="Hạn chót" value={form.due_date || ''} onChange={(value) => setForm((current) => ({ ...current, due_date: value }))} />
        </div></fieldset>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white py-3"><button type="button" onClick={() => setEditing(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu công việc'}</button></div>
      </form> : <div className="ui-card space-y-3 whitespace-pre-wrap break-words p-4 text-sm leading-6"><h3 className="font-semibold">{editing.title}</h3><p>{editing.description || 'Chưa có mô tả.'}</p><p>Khách hàng: {customers.find((c) => c.id === editing.customer_id)?.name || '—'}</p><p>Hạn chót: {displayDate(editing.due_date)}</p><p>Ý kiến lãnh đạo: {editing.leader_opinion || '—'}</p></div>}
        {editing.id && <>{editing.source_import_row?.sheet && Number(editing.source_import_row.row)>0 && <details className="rounded-md border border-line p-3 text-xs"><summary className="cursor-pointer">Dòng Excel nguồn: {editing.source_import_row.sheet}!{editing.source_import_row.row}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(editing.source_import_row.values, null, 2)}</pre></details>}{scopeAllows(user, 'tasks', 'delete', { ownerId: editing.assignee_id, departmentId: editing.department_id }) && <button type="button" disabled={deletingId!==null||saving} onClick={()=>remove(editing)} className="text-sm text-clay">Xóa công việc</button>}</>}
      </div>}
      {tab === 'updates' && editing.id && <div className="space-y-4">
        {canApprove && <form onSubmit={decide} className="space-y-2 rounded-md border border-line p-3"><div className="font-medium">Nghiệm thu của quản lý</div><select value={review.decision} onChange={(e) => setReview({ ...review, decision: e.target.value })} className={inputClass}><option value="approved">Nghiệm thu hoàn thành</option><option value="rejected">Yêu cầu bổ sung</option></select><textarea required placeholder="Ý kiến lãnh đạo" value={review.opinion} onChange={(e) => setReview({ ...review, opinion: e.target.value })} className={inputClass} /><button disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu nghiệm thu'}</button></form>}
        {editing.updates?.map((item) => <div key={item.id} className="rounded-md border border-line p-3 text-sm"><div className="font-medium">{item.employee_name} · {new Date(item.created_at).toLocaleString('vi-VN')}</div><p className="whitespace-pre-wrap break-words">Tiến độ {progressText(item)} · {item.result || 'Chưa ghi kết quả'}</p><p className="whitespace-pre-wrap break-words">Tiếp theo: {item.next_step || '—'} · Vướng mắc: {item.blockers || '—'} · Giải pháp: {item.solution || '—'}</p></div>)}</div>}
      {tab === 'history' && editing.id && <AuditTrail entries={editing.history}/>}
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
    </Modal>}
  </Layout>;
}

export default function TimelinePage() { return <ProtectedRoute permission="tasks"><TimelineContent /></ProtectedRoute>; }
