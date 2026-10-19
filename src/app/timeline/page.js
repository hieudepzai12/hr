'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Attachments from '@/components/Attachments';
import ExcelImport from '@/components/ExcelImport';
import TaskPlanPrint from '@/components/TaskPlanPrint';
import LoadMore from '@/components/LoadMore';
import usePagedList from '@/lib/usePagedList';
import { useAuth } from '@/context/AuthContext';
import { scopeFor, scopeAllows } from '@/lib/access';
import { PriorityBadge, TaskStatusBadge } from '@/components/Badges';
import DateInput from '@/components/DateInput';

const columns = [{ key: 'todo', label: 'Chưa bắt đầu' }, { key: 'in_progress', label: 'Đang thực hiện' },
  { key: 'review', label: 'Chờ nghiệm thu' }, { key: 'done', label: 'Đã nghiệm thu' }];
const blank = { title: '', description: '', assignee_id: '', department_id: '', customer_id: '', collaborator_ids: [],
  business_group: '', expected_outcome: '', priority: 'medium', start_date: '', due_date: '',
  planned_progress_date: '', planned_progress: '' };
const textFields = [['expected_outcome', 'Đầu ra và tiêu chí nghiệm thu']];
const inputClass = 'ui-field mt-1';
const displayDate = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

function TimelineContent() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({});
  const [view, setView] = useState('board');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects,setProjects]=useState([]);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [printPayload, setPrintPayload] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [form, setForm] = useState(blank);
  const [tab, setTab] = useState('detail');
  const [update, setUpdate] = useState({ progress: 0, result: '', next_step: '', blockers: '', solution: '', submit_for_review: false });
  const [review, setReview] = useState({ decision: 'approved', opinion: '' });
  const [error, setError] = useState('');
  const { items: tasks, hasMore, loading, loadingMore, error: listError, refresh, loadMore } = usePagedList('/tasks', filters);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = Object.fromEntries(['status', 'from', 'to', 'department_id', 'assignee_id', 'customer_id','project_id','mine'].filter((key) => params.get(key)).map((key) => [key, params.get(key)]));
    if (Object.keys(initial).length) queueMicrotask(() => setFilters(initial));
  }, []);
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
      setUpdate({ progress: data.progress || 0, result: '', next_step: '', blockers: '', solution: '', submit_for_review: false });
      setTab('detail');
    } catch (err) { setError(err.response?.data?.error || 'Không tải được công việc'); }
  };
  const save = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...form, planned_progress: form.planned_progress === '' ? null : form.planned_progress };
      if (editing.id) {
        if (payload.due_date !== editing.due_date) {
          const reason = prompt('Lý do thay đổi hạn chót:');
          if (!reason?.trim()) return;
          payload.reason = reason;
        }
        delete payload.status; delete payload.progress; delete payload.leader_opinion;
        await api.put(`/tasks/${editing.id}`, payload);
        await openTask(editing);
      } else {
        const { data } = await api.post('/tasks', payload);
        await openTask(data);
      }
      refresh(); setNotice('Đã lưu công việc.');
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được công việc'); }
    finally { setSaving(false); }
  };
  const addUpdate = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api.post(`/tasks/${editing.id}/updates`, update); await openTask(editing); refresh(); setNotice('Đã lưu cập nhật phần việc.'); }
    catch (err) { setError(err.response?.data?.error || 'Không lưu được cập nhật'); }
    finally { setSaving(false); }
  };
  const decide = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api.post(`/tasks/${editing.id}/review`, review); await openTask(editing); refresh(); setNotice('Đã lưu kết quả nghiệm thu.'); }
    catch (err) { setError(err.response?.data?.error || 'Không lưu được nghiệm thu'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    const reason = prompt('Lý do xóa công việc:');
    if (!reason?.trim()) return;
    try { await api.delete(`/tasks/${editing.id}`, { data: { reason } }); setEditing(null); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không xóa được công việc'); }
  };
  const restore = async (task) => {
    try { await api.post(`/tasks/${task.id}/restore`); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không khôi phục được công việc'); }
  };
  const printPlan = async () => {
    if (printing || filters.deleted === '1') return;
    setPrinting(true); setError('');
    try {
      const { data } = await api.get('/tasks/print', { params: filters });
      setPrintPayload(data);
    } catch (err) { setError(err.response?.data?.error || 'Không tạo được bản in kế hoạch công việc'); }
    finally { setPrinting(false); }
  };
  const canEdit = editing?.id && user.role !== 'employee' && scopeAllows(user, 'tasks', 'edit', { ownerId: editing.assignee_id, departmentId: editing.department_id });
  const participant = editing?.id && (Number(editing.assignee_id) === Number(user.id) || editing.collaborator_ids?.map(Number).includes(Number(user.id)));
  const canApprove = editing?.id && editing.status === 'review' && Number(editing.assignee_id) !== Number(user.id) &&
    scopeAllows(user, 'tasks', 'approve', { ownerId: editing.assignee_id, departmentId: editing.department_id });
  const alert = (task) => task.alert && task.alert.kind !== 'missing' && <span className={`text-xs font-semibold ${task.alert.kind === 'overdue' ? 'text-clay' : task.alert.kind === 'review' ? 'text-teal' : 'text-amber-dark'}`}>{task.alert.label}</span>;
  const visibleTasks = tasks.filter((task) => `${task.title} ${task.assignee_name || ''} ${task.customer_name || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <Layout title="Timeline & Deadline" subtitle="Công việc gốc và tiến độ theo từng người"
    actions={<div className="flex flex-wrap gap-2">{scopeFor(user, 'tasks', 'print') !== 'none' && <button type="button" disabled={printing || filters.deleted === '1'} onClick={printPlan} title={filters.deleted === '1' ? 'Tắt chế độ xem công việc đã xóa để in' : 'In mọi công việc trong phạm vi quyền và bộ lọc hiện tại'} className="ui-button ui-button-secondary">{printing ? 'Đang tạo bản in...' : 'In kế hoạch công việc'}</button>}{scopeFor(user, 'tasks', 'create') !== 'none' && <><button onClick={() => setImportOpen(true)} className="ui-button ui-button-secondary">Nhập Excel</button><button onClick={openCreate} className="ui-button ui-button-primary">Giao việc mới</button></>}</div>}>
    <div className="ui-card mb-4 p-4">
      <div className="mb-3 flex flex-wrap gap-2"><button type="button" aria-pressed={filters.mine!=='1'} onClick={()=>setFilter('mine','')} className={`ui-button ${filters.mine!=='1'?'ui-button-primary':'ui-button-secondary'}`}>Trong phạm vi quyền</button><button type="button" aria-pressed={filters.mine==='1'} onClick={()=>setFilter('mine','1')} className={`ui-button ${filters.mine==='1'?'ui-button-primary':'ui-button-secondary'}`}>Phần việc của tôi</button></div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Danh sách công việc</h2><p className="text-xs text-slate">Theo phạm vi bạn được xem và xử lý</p></div><div className="flex rounded-lg border border-line bg-paper p-1" role="group" aria-label="Chế độ xem"><button onClick={() => setView('board')} aria-pressed={view === 'board'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}> Tiến độ</button><button onClick={() => setView('table')} aria-pressed={view === 'table'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-slate'}`}>Bảng</button></div></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <input aria-label="Tìm trong công việc đã tải" placeholder="Tìm công việc đã tải" value={search} onChange={(event) => setSearch(event.target.value)} className="ui-field lg:col-span-2" />
      <select aria-label="Lọc phòng ban" value={filters.department_id || ''} onChange={(event) => setFilter('department_id', event.target.value)} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <select aria-label="Lọc nhân viên" value={filters.assignee_id || ''} onChange={(event) => setFilter('assignee_id', event.target.value)} className={inputClass}><option value="">Mọi nhân viên</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select>
      <select aria-label="Lọc khách hàng" value={filters.customer_id || ''} onChange={(event) => setFilter('customer_id', event.target.value)} className={inputClass}><option value="">Mọi khách hàng</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      {scopeFor(user,'projects','view')!=='none'&&<select aria-label="Lọc dự án" value={filters.project_id||''} onChange={e=>setFilter('project_id',e.target.value)} className={inputClass}><option value="">Mọi dự án</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>}
      <select aria-label="Lọc trạng thái" value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)} className={inputClass}><option value="">Mọi trạng thái</option>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select>
      <input aria-label="Hạn từ ngày" type="date" value={filters.from || ''} onChange={(event) => setFilter('from', event.target.value)} className={inputClass} />
      <input aria-label="Hạn đến ngày" type="date" value={filters.to || ''} onChange={(event) => setFilter('to', event.target.value)} className={inputClass} />
      {scopeFor(user, 'tasks', 'restore') !== 'none' && <label className="flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={filters.deleted === '1'} onChange={(event) => setFilter('deleted', event.target.checked ? '1' : '')} /> Hiện công việc đã xóa</label>}
      </div>
      {search && <p className="mt-2 text-xs text-slate">Tìm trong các công việc đã tải; dùng “Xem thêm” để mở rộng kết quả.</p>}
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}
    {notice && <p role="status" className="mb-3 rounded-lg border border-[#b9dfc9] bg-[#edfbf3] px-3 py-2 text-sm text-[#17623a]">{notice}</p>}
    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải công việc...</div> : !visibleTasks.length ? <div className="ui-card ui-empty">Không tìm thấy công việc phù hợp.</div> : view === 'board' ?
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{columns.map((column) => <section key={column.key} className="rounded-xl border border-line bg-[#ebf0f7] p-3"><h2 className="mb-3 flex items-center justify-between text-sm font-semibold">{column.label}<span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate">{visibleTasks.filter((task) => task.status === column.key).length}</span></h2><div className="space-y-2">{visibleTasks.filter((task) => task.status === column.key).map((task) => <button type="button" key={task.id} onClick={() => filters.deleted === '1' ? restore(task) : openTask(task)} className="w-full rounded-lg border border-line bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-ring"><div className="mb-2 text-sm font-semibold text-ink">#{task.id} {task.title}</div><div className="mb-2 flex flex-wrap gap-1"><PriorityBadge priority={task.priority} /><TaskStatusBadge status={task.status} /></div><div className="space-y-1 text-xs text-slate"><div>{task.assignee_name || 'Chưa giao'}</div><div>{task.customer_name || 'Không có khách hàng'}</div><div>Hạn: {displayDate(task.due_date)}</div></div><div className="mt-2">{alert(task)}</div></button>)}</div></section>)}</div> :
      <div className="ui-card overflow-x-auto"><table className="ui-table min-w-[980px]"><thead><tr><th>Công việc</th><th>Khách hàng</th><th>Phụ trách</th><th>Ưu tiên</th><th>Trạng thái</th><th>Tiến độ</th><th>Hạn chót</th><th>Vướng mắc</th></tr></thead><tbody>{visibleTasks.map((task) => <tr key={task.id}><td><button type="button" onClick={() => filters.deleted === '1' ? restore(task) : openTask(task)} className="max-w-64 text-left font-semibold text-teal hover:underline focus-ring">#{task.id} {task.title}</button></td><td>{task.customer_name || '—'}</td><td>{task.assignee_name || '—'}{task.collaborator_ids?.length > 0 && <span className="block text-xs text-slate">+{task.collaborator_ids.length} phối hợp</span>}</td><td><PriorityBadge priority={task.priority} /></td><td><TaskStatusBadge status={task.status} /></td><td><div className="min-w-24"><div className="mb-1 text-xs font-semibold">{task.progress}%</div><div className="progress-track"><div className="progress-fill" style={{ width: `${task.progress || 0}%` }} /></div></div></td><td>{displayDate(task.due_date)}<span className="block">{alert(task)}</span></td><td className="max-w-48 truncate" title={task.blockers || ''}>{task.blockers || '—'}</td></tr>)}</tbody></table></div>}
    <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    {importOpen && <ExcelImport onClose={() => setImportOpen(false)} onImported={({ imported, skipped }) => { refresh(); setNotice(`Đã nhập ${imported} công việc, bỏ qua ${skipped} dòng.`); }} />}
    {printPayload && <TaskPlanPrint payload={printPayload} onClose={() => setPrintPayload(null)} />}
    {editing && <Modal title={editing.id ? `Công việc #${editing.id}` : 'Giao việc mới'} onClose={() => setEditing(null)} width="max-w-5xl">
      {editing.id && <div className="mb-4 flex gap-2 border-b border-line pb-3">{[['detail', 'Chi tiết'], ['updates', 'Cập nhật'], ['history', 'Lịch sử']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-sm ${tab === key ? 'bg-teal text-white' : 'bg-paper'}`}>{label}</button>)}</div>}
      {tab === 'detail' && <div className="space-y-4">{(!editing.id || canEdit) ? <form onSubmit={save} className="space-y-4">
        <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Thông tin chung</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Tên công việc<span className="required-mark">*</span><input required maxLength={500} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} /></label>
          <label className="text-sm sm:col-span-2">Mô tả<textarea rows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></label>
          <label className="text-sm">Khách hàng<select value={form.customer_id || ''} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputClass}><option value="">Không có</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {scopeFor(user,'projects','view')!=='none'&&<label className="text-sm">Dự án<select value={form.project_id||''} onChange={e=>setForm({...form,project_id:e.target.value})} className={inputClass}><option value="">Không có</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
          <label className="text-sm">Ưu tiên<select value={form.priority || 'medium'} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
          {textFields.map(([key, label]) => <label key={key} className="text-sm">{label}<input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} /></label>)}
        </div></fieldset>
        <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Phân công</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Phòng ban<span className="required-mark">*</span><select required value={form.department_id || ''} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputClass}><option value="">Chọn phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="text-sm">Người phụ trách chính<span className="required-mark">*</span><select required value={form.assignee_id || ''} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className={inputClass}><option value="">Chọn nhân viên</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
          <label className="text-sm sm:col-span-2">Người phối hợp<select multiple value={(form.collaborator_ids || []).map(String)} onChange={(e) => setForm({ ...form, collaborator_ids: [...e.target.selectedOptions].map((option) => Number(option.value)) })} className={inputClass}>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select><span className="ui-help">Giữ Ctrl để chọn nhiều người.</span></label>
        </div></fieldset>
        <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-semibold">Thời gian và mốc tiến độ</legend><div className="grid gap-3 sm:grid-cols-2">
          <DateInput label="Ngày bắt đầu" value={form.start_date || ''} onChange={(value) => setForm((current) => ({ ...current, start_date: value }))} />
          <DateInput label="Hạn chót" value={form.due_date || ''} onChange={(value) => setForm((current) => ({ ...current, due_date: value }))} />
          <DateInput label="Mốc tiến độ dự kiến" value={form.planned_progress_date || ''} onChange={(value) => setForm((current) => ({ ...current, planned_progress_date: value }))} />
          <label className="text-sm">Tiến độ dự kiến (%)<input type="number" min="0" max="100" value={form.planned_progress ?? ''} onChange={(e) => setForm({ ...form, planned_progress: e.target.value })} className={inputClass} /></label>
        </div></fieldset>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white py-3"><button type="button" onClick={() => setEditing(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu công việc'}</button></div>
      </form> : <div className="ui-card space-y-2 p-4 text-sm"><p>{editing.description || 'Chưa có mô tả.'}</p><p>Khách hàng: {customers.find((c) => c.id === editing.customer_id)?.name || '—'}</p><p>Đầu ra: {editing.expected_outcome || '—'}</p><p>Hạn chót: {displayDate(editing.due_date)}</p><p>Ý kiến lãnh đạo: {editing.leader_opinion || '—'}</p></div>}
        {editing.id && <>{editing.source_import_row && <details className="rounded-md border border-line p-3 text-xs"><summary className="cursor-pointer">Dòng Excel nguồn: {editing.source_import_row.sheet}!{editing.source_import_row.row}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(editing.source_import_row.values, null, 2)}</pre></details>}<Attachments kind="tasks" entityId={editing.id} canManage={Boolean(canEdit || (participant && scopeFor(user, 'tasks', 'edit') !== 'none'))} />{scopeAllows(user, 'tasks', 'delete', { ownerId: editing.assignee_id, departmentId: editing.department_id }) && <button onClick={remove} className="text-sm text-clay">Xóa công việc</button>}</>}
      </div>}
      {tab === 'updates' && editing.id && <div className="space-y-4">{participant && scopeFor(user, 'tasks', 'edit') !== 'none' && editing.status !== 'done' && <form onSubmit={addUpdate} className="space-y-2 rounded-md border border-line p-3"><div className="text-sm font-medium">Cập nhật phần việc của tôi</div><label className="block text-sm">Tiến độ (%)<input type="number" min="0" max="100" required value={update.progress} onChange={(e) => setUpdate({ ...update, progress: Number(e.target.value) })} className={inputClass} /></label>{[['result', 'Kết quả đã làm'], ['next_step', 'Bước tiếp theo'], ['blockers', 'Vướng mắc'], ['solution', 'Đề xuất giải pháp']].map(([key, label]) => <label key={key} className="block text-sm">{label}<textarea value={update[key]} onChange={(e) => setUpdate({ ...update, [key]: e.target.value })} className={inputClass} /></label>)}{Number(editing.assignee_id) === Number(user.id) && <label className="text-sm"><input type="checkbox" checked={update.submit_for_review} onChange={(e) => setUpdate({ ...update, submit_for_review: e.target.checked })} /> Gửi quản lý nghiệm thu</label>}<div><button disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu cập nhật'}</button></div></form>}
        {canApprove && <form onSubmit={decide} className="space-y-2 rounded-md border border-line p-3"><div className="font-medium">Nghiệm thu của quản lý</div><select value={review.decision} onChange={(e) => setReview({ ...review, decision: e.target.value })} className={inputClass}><option value="approved">Nghiệm thu hoàn thành</option><option value="rejected">Yêu cầu bổ sung</option></select><textarea required placeholder="Ý kiến lãnh đạo" value={review.opinion} onChange={(e) => setReview({ ...review, opinion: e.target.value })} className={inputClass} /><button disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu nghiệm thu'}</button></form>}
        {editing.updates?.map((item) => <div key={item.id} className="rounded-md border border-line p-3 text-sm"><div className="font-medium">{item.employee_name} · {new Date(item.created_at).toLocaleString('vi-VN')}</div><p>Tiến độ {item.progress}% · {item.result || 'Chưa ghi kết quả'}</p><p>Tiếp theo: {item.next_step || '—'} · Vướng mắc: {item.blockers || '—'} · Giải pháp: {item.solution || '—'}</p></div>)}</div>}
      {tab === 'history' && editing.id && <div className="space-y-2">{editing.history?.map((entry) => <div key={entry.id} className="rounded-md border border-line p-3 text-xs"><strong>{entry.actor_name || 'Hệ thống'}</strong> · {entry.action} · {new Date(entry.created_at).toLocaleString('vi-VN')}{entry.reason && <p>Lý do: {entry.reason}</p>}<pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(entry.changes, null, 2)}</pre></div>)}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
    </Modal>}
  </Layout>;
}

export default function TimelinePage() { return <ProtectedRoute permission="tasks"><TimelineContent /></ProtectedRoute>; }
