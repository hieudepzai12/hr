'use client';
import { progressText } from '@/lib/task-progress';
import { requestReason } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Attachments from '@/components/Attachments';
import Pagination from '@/components/Pagination';
import usePagedList from '@/lib/usePagedList';
import { useAuth } from '@/context/AuthContext';
import { scopeFor, scopeAllows } from '@/lib/access';
import { WorkReportStatusBadge as ReportStatusBadge } from '@/components/Badges';
import DateInput from '@/components/DateInput';
import ReportTaskUpdate from '@/components/ReportTaskUpdate';
import ReportTaskPicker from '@/components/ReportTaskPicker';
import WorkReportTable from '@/components/WorkReportTable';

const inputClass = 'ui-field mt-1';
const dateText = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const blank = { title: '', content: '', type: 'weekly', period_start: '', period_end: '', customer_id: '', task_ids: [] };
const statuses = { draft:'Bản nháp', submitted:'Đã gửi' };

function ReportItems({ items }) {
  const { can } = useAuth();
  if (!items?.length) return <p className="text-sm text-slate">Chưa có công việc liên kết.</p>;
  return <div className="overflow-x-auto rounded-lg border border-line"><table className="ui-table min-w-[850px]"><thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Tiến độ</th><th>Hạn</th><th>Vướng mắc</th><th>Giải pháp</th><th>Ý kiến lãnh đạo</th></tr></thead><tbody>{items.map((item) => { const row = item.snapshot; return <tr key={item.id || item.task_id || row.task_id}><td className="font-semibold">{can('tasks')?<Link className="text-teal hover:underline focus-ring" href={`/timeline?task_id=${row.task_id}`}>#{row.task_id} {row.title}</Link>:<>#{row.task_id} {row.title}</>}</td><td>{row.employee_name || '—'}</td><td className="min-w-40 whitespace-pre-wrap break-words">{progressText(row)}</td><td>{dateText(row.due_date)}</td><td>{row.blockers || '—'}</td><td>{row.solution || '—'}</td><td>{item.leader_opinion || '—'}</td></tr>; })}</tbody></table></div>;
}

function ReportsContent() {
  const { user } = useAuth();
  const filterPanel=useRef(null);const listPanel=useRef(null);const listEntries=useRef(null);
  const [filter, setFilters] = useState({ employee_id: user.id });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects,setProjects]=useState([]);
  const [tasksLoading,setTasksLoading]=useState(scopeFor(user,'tasks','view')!=='none');
  const updateHandles=useRef(new Map());
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);

  const [error,setError]=useFeedback('error');
  const [,setNotice]=useFeedback('success');
  const [saving, setSaving] = useState(false);
  const { items: reports, pagination, loading, error: listError, refresh } = usePagedList('/reports', filter);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const status = query.get('status');
    const taskId = query.get('task_id');
    if (!status && !taskId) return;
    const scope = scopeFor(user, 'reports', 'view');
    const next = scope === 'all' ? 'all' : scope === 'department' ? 'department' : 'mine';
    queueMicrotask(() => {
      setFilters({ ...(next === 'mine' ? { employee_id: user.id } : next === 'department' ? { department_id: user.department_id || -1 } : {}), ...(status?{status}:{}), ...(taskId?{task_id:taskId}:{}) });
    });
  }, [user]);
  useEffect(() => {
    if(scopeFor(user,'projects','view')!=='none')api.get('/governance/projects',{params:{options:1}}).then(({data})=>setProjects(data.projects||[])).catch(()=>{});
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    let active = true;
    const controller = new AbortController();
    if(scopeFor(user,'tasks','view')!=='none')api.get('/tasks', { params: { mine: 1 }, signal: controller.signal }).then(({ data }) => {
      if(!active)return;
      const own = data.filter(task => Number(task.assignee_id)===Number(user.id)||task.collaborator_ids?.map(Number).includes(Number(user.id)));
      setTasks(own);

    }).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được công việc để lập báo cáo.');}).finally(()=>{if(active)setTasksLoading(false);});
    return ()=>{active=false;controller.abort();};
  }, [user, setError]);
  useEffect(()=>{
    const update=()=>{if(listPanel.current)listPanel.current.style.setProperty('--activity-panel-top',`${Math.max(0,listPanel.current.getBoundingClientRect().top)}px`);};
    const observer=new ResizeObserver(update);if(filterPanel.current)observer.observe(filterPanel.current);
    const header=document.querySelector('.app-header');if(header)observer.observe(header);
    window.addEventListener('resize',update);update();return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{if(listEntries.current)listEntries.current.scrollTop=0;},[filter,pagination.page]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const loadDetail = async (report) => {
    try { const { data } = await api.get(`/reports/${report.id}`); setDetail(data); setError(''); }
    catch (err) { setError(err.response?.data?.error || 'Không tải được báo cáo'); }
  };
  const openCreate = async () => {
    setTasksLoading(true);setError('');
    try {
      const own=scopeFor(user,'tasks','view')==='none'?[]:(await api.get('/tasks',{params:{mine:1}})).data.filter(task=>Number(task.assignee_id)===Number(user.id)||task.collaborator_ids?.map(Number).includes(Number(user.id)));
      setTasks(own);
      const task=own.find(item=>String(item.id)===String(filter.task_id));
      updateHandles.current.clear();setEditing({});
      setForm(task?{...blank,title:`Báo cáo: ${task.title}`.slice(0,500),customer_id:task.customer_id||'',task_ids:[task.id]}:{...blank});
    }catch(err){setError(err.response?.data?.error||'Không tải được danh sách công việc.');}
    finally{setTasksLoading(false);}
  };
  const openEdit = () => { updateHandles.current.clear(); setEditing(detail); setForm({ title: detail.title, content: detail.content, type: detail.type, period_start: detail.period_start || '', period_end: detail.period_end || '', customer_id: detail.customer_id || '', task_ids: detail.items.map((item) => item.task_id) }); setDetail(null); setError(''); };
  const save = async (status) => {
    if (saving) return;
    if(!form.title.trim()||form.title.length>500){setError('Tiêu đề báo cáo không hợp lệ.');return;}
    if(form.period_start&&form.period_end&&form.period_start>form.period_end){setError('Từ ngày không được sau Đến ngày.');return;}
    setSaving(true); setError(''); setNotice('');
    try {
      for(const id of form.task_ids){
        const handle=updateHandles.current.get(id);
        if(!handle)throw new Error('Chưa tải xong nội dung công việc.');
        await handle.save();
      }
      if (editing.id) {
        await api.put(`/reports/${editing.id}`, form);
        if (status === 'submitted') await api.post(`/reports/${editing.id}/submit`);
      } else await api.post('/reports', { ...form, status });
      setEditing(null); refresh(); setNotice(status === 'submitted' ? 'Đã gửi báo cáo.' : 'Đã lưu bản nháp.');
    } catch (err) { setError(err.response?.data?.error || err.message || 'Không lưu được báo cáo'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    const reason = await requestReason('Lý do xóa báo cáo:'); if (!reason?.trim()) return;
    try { await api.delete(`/reports/${detail.id}`, { data: { reason } }); setDetail(null); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không xóa được báo cáo'); }
  };
  const restore = async (report) => {
    try { await api.post(`/reports/${report.id}/restore`); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không khôi phục được báo cáo'); }
  };
  const canEdit = detail && canReportAction(user, 'edit', detail);

  const canDelete = detail && canReportAction(user, 'delete', detail) && (detail.status === 'draft' || scopeFor(user, 'reports', 'delete') === 'all');
  return <Layout title="Báo cáo công việc"
    actions={scopeFor(user, 'reports', 'create') !== 'none' && <button disabled={tasksLoading} onClick={openCreate} className="ui-button ui-button-primary">Lập báo cáo</button>}>
    {filter.task_id&&<div className="ui-card mb-3 flex flex-wrap items-center gap-3 p-3 text-sm"><span>Báo cáo liên kết công việc #{filter.task_id}</span><button type="button" className="text-teal hover:underline focus-ring" onClick={()=>setFilter('task_id','')}>Bỏ lọc công việc</button></div>}
    <div ref={filterPanel} className="task-filters-panel ui-card mb-3 p-3">
      <div className="flex justify-end">{scopeFor(user, 'reports', 'restore') !== 'none' && <label className="ml-auto text-xs text-slate"><input type="checkbox" checked={filter.deleted === '1'} onChange={(event) => setFilter('deleted', event.target.checked ? '1' : '')} /> Đã xóa</label>}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><input type="date" aria-label="Kỳ từ" value={filter.from || ''} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} /><input type="date" aria-label="Kỳ đến" value={filter.to || ''} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} /><select aria-label="Phòng ban" value={filter.department_id || ''} onChange={(e) => setFilter('department_id', e.target.value)} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><select aria-label="Nhân viên" value={filter.employee_id || ''} onChange={(e) => setFilter('employee_id', e.target.value)} className={inputClass}><option value="">Mọi nhân viên</option>{!employees.some(e => e.role!=='admin'&&Number(e.id) === Number(user.id)) && <option value={user.id}>Báo cáo của tôi</option>}{employees.filter(employee=>employee.role!=='admin').map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select><select aria-label="Dự án" value={filter.project_id||''} onChange={event=>setFilter('project_id',event.target.value)} className={inputClass}><option value="">Mọi dự án</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select><select aria-label="Trạng thái" value={filter.status || ''} onChange={(e) => setFilter('status', e.target.value)} className={inputClass}><option value="">Mọi trạng thái</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}

    <div ref={listPanel} className="activity-panel"><div ref={listEntries} className="activity-entries report-scroll" role="region" aria-label="Danh sách báo cáo, cuộn để xem thêm" tabIndex={0}>
    {loading?<div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải báo cáo...</div>:!reports.length?<div className="ui-card ui-empty">Chưa có báo cáo phù hợp với bộ lọc.</div>:<WorkReportTable reports={reports} projects={projects} onOpen={loadDetail} onRestore={restore} deleted={filter.deleted==='1'} />}
    </div><div className="shrink-0 border-t border-line pt-2"><Pagination {...pagination} /></div></div>
    {editing && <Modal title={editing.id ? 'Sửa báo cáo' : 'Lập báo cáo công việc'} onClose={() => {if(!saving)setEditing(null);}} width="max-w-7xl">
      <form onSubmit={(event) => { event.preventDefault(); save('draft'); }} className="space-y-5">
        <section className="rounded-xl border border-line bg-slate-50/60 p-4"><h3 className="mb-3 font-semibold">Thông tin chung</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium">Tiêu đề <span className="text-clay">*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Loại báo cáo<select value={form.type} disabled={Boolean(editing.id)} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}><option value="weekly">Báo cáo tuần</option><option value="daily">Hằng ngày</option><option value="monthly">Hằng tháng</option><option value="project">Dự án</option></select></label>

          </div>
        </section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Kỳ báo cáo</h3><div className="grid gap-4 sm:grid-cols-2"><DateInput label="Từ ngày" value={form.period_start} onChange={(value) => setForm({ ...form, period_start: value })} /><DateInput label="Đến ngày" value={form.period_end} onChange={(value) => setForm({ ...form, period_end: value })} /></div></section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Tiến độ, vướng mắc và giải pháp</h3><label className="block text-sm font-medium">Nội dung<textarea rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className={inputClass} /></label><ReportTaskPicker tasks={tasks} selected={form.task_ids} loading={tasksLoading} disabled={saving} onChange={ids=>{const selectedTasks=tasks.filter(task=>ids.includes(task.id));const customerIds=[...new Set(selectedTasks.map(task=>task.customer_id||null))];setForm(current=>({...current,task_ids:ids,customer_id:customerIds.length===1?customerIds[0]||'':''}));}} />{!form.task_ids.length&&<p className="mt-3 text-sm text-slate">Chọn công việc ở trên để nhập Tiến độ, Vướng mắc và Giải pháp cho từng việc.</p>}{tasks.filter(task=>form.task_ids.includes(task.id)).map(task=><ReportTaskUpdate key={task.id} ref={handle=>{if(handle)updateHandles.current.set(task.id,handle);else updateHandles.current.delete(task.id);}} task={task} employeeId={user.id} canUpdate={scopeFor(user,'tasks','edit')!=='none'} disabled={saving} />)}</section>
        {error && <p role="alert" className="ui-notice">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-white py-3"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-secondary">{saving ? 'Đang lưu...' : 'Lưu nháp'}</button><button type="button" disabled={saving || !form.title.trim()} onClick={() => save('submitted')} className="ui-button ui-button-primary">{saving ? 'Đang gửi...' : 'Gửi báo cáo'}</button></div>
      </form>
    </Modal>}
    {detail && <Modal title={detail.title} onClose={() => setDetail(null)} width="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-2"><ReportStatusBadge status={detail.status} /><span className="text-xs text-slate">Phiên bản {detail.version}</span></div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3"><div className="flex-1" />{canEdit && <button onClick={openEdit} className="ui-button ui-button-secondary">Sửa</button>}{canDelete && <button onClick={remove} className="ui-button ui-button-secondary text-clay">Xóa</button>}</div>
      <div className="space-y-5">
        <section className="grid gap-3 rounded-xl bg-paper p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-slate">Người lập</span><strong className="block">{detail.employee_name}</strong></div><div><span className="text-slate">Phòng ban</span><strong className="block">{detail.department_name || '—'}</strong></div><div><span className="text-slate">Kỳ báo cáo</span><strong className="block">{dateText(detail.period_start)} – {dateText(detail.period_end)}</strong></div><div><span className="text-slate">Khách hàng</span><strong className="block">{detail.customer_name || '—'}</strong></div></section>
        <section><h3 className="mb-2 font-semibold">Nội dung</h3><p className="whitespace-pre-wrap text-sm leading-6">{detail.content || 'Chưa có nội dung.'}</p></section>
        <section><h3 className="mb-2 font-semibold">Công việc trong kỳ</h3><ReportItems items={detail.items} /></section>
        <section><h3 className="mb-2 font-semibold">Phản hồi quản lý</h3><p className="rounded-lg bg-paper p-3 text-sm">{detail.feedback || 'Chưa có phản hồi.'}</p></section>
        <section><h3 className="mb-2 font-semibold">Đính kèm</h3><Attachments kind="reports" entityId={detail.id} canManage={Boolean(canEdit)} /></section>

      </div>
      {error && <p role="alert" className="ui-notice mt-3">{error}</p>}
    </Modal>}
  </Layout>;
}

function canReportAction(user, action, report) {
  return scopeAllows(user, 'reports', action, { ownerId: report.employee_id, departmentId: report.effective_department_id ?? report.department_id });
}

export default function ReportsPage() { return <ProtectedRoute permission="reports"><ReportsContent /></ProtectedRoute>; }
