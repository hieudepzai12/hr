'use client';
import { progressText } from '@/lib/task-progress';
import { requestReason } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import Layout from '@/components/Layout';
import AuditTrail from '@/components/AuditTrail';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Attachments from '@/components/Attachments';
import Pagination from '@/components/Pagination';
import usePagedList from '@/lib/usePagedList';
import { useAuth } from '@/context/AuthContext';
import { scopeFor, scopeAllows } from '@/lib/access';
import { ReportStatusBadge } from '@/components/Badges';
import DateInput from '@/components/DateInput';
import ReportTaskUpdate from '@/components/ReportTaskUpdate';

const inputClass = 'ui-field mt-1';
const dateText = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const blank = { title: '', content: '', type: 'weekly', period_start: '', period_end: '', customer_id: '', task_ids: [] };
const statuses = { draft: 'Bản nháp', submitted: 'Đã gửi', reviewed: 'Đã xem xét', approved: 'Đã duyệt',
  rejected: 'Yêu cầu bổ sung', reopened: 'Đã mở lại' };

function ReportSummaryCell({ items = [], field }) {
  if (!items.length) return '—';
  return <div className={field==='due_date'?'min-w-24 space-y-3':'min-w-40 space-y-3'}>{items.map(item=><div key={item.task_id}>
    {items.length>1&&<span className="mb-1 block text-xs text-slate">Công việc #{item.task_id}</span>}
    <p className="whitespace-pre-wrap break-words text-sm leading-6">{field==='progress'?progressText(item):field==='due_date'?dateText(item.due_date):item[field]||'—'}</p>
  </div>)}</div>;
}

function ReportItems({ items }) {
  const { can } = useAuth();
  if (!items?.length) return <p className="text-sm text-slate">Chưa có công việc liên kết.</p>;
  return <div className="overflow-x-auto rounded-lg border border-line"><table className="ui-table min-w-[850px]"><thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Tiến độ</th><th>Hạn</th><th>Kết quả / bước tiếp</th><th>Vướng mắc</th><th>Giải pháp</th><th>Ý kiến lãnh đạo</th></tr></thead><tbody>{items.map((item) => { const row = item.snapshot; return <tr key={item.id || item.task_id || row.task_id}><td className="font-semibold">{can('tasks')?<Link className="text-teal hover:underline focus-ring" href={`/timeline?task_id=${row.task_id}`}>#{row.task_id} {row.title}</Link>:<>#{row.task_id} {row.title}</>}</td><td>{row.employee_name || '—'}</td><td className="min-w-40 whitespace-pre-wrap break-words">{progressText(row)}</td><td>{dateText(row.due_date)}</td><td>{row.result || '—'}<br />{row.next_step || ''}</td><td>{row.blockers || '—'}</td><td>{row.solution || '—'}</td><td>{item.leader_opinion || '—'}</td></tr>; })}</tbody></table></div>;
}

function ReportsContent() {
  const { user } = useAuth();
  const [filter, setFilters] = useState({ employee_id: user.id });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading,setTasksLoading]=useState(scopeFor(user,'tasks','view')!=='none');
  const [pendingUpdates, setPendingUpdates] = useState({});
  const updateState = useCallback((id, pending) => setPendingUpdates((current) => ({ ...current, [id]: pending })), []);
  const hasPendingUpdates = formTaskIds => formTaskIds.some(id => pendingUpdates[id]);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [tab, setTab] = useState('detail');
  const [review, setReview] = useState({ status: 'approved', feedback: '', item_opinions: [] });
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
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/customers').then(({ data }) => setCustomers(data)).catch(() => {});
    let active = true;
    const controller = new AbortController();
    if(scopeFor(user,'tasks','view')!=='none')api.get('/tasks', { params: { mine: 1 }, signal: controller.signal }).then(({ data }) => {
      if(!active)return;
      const own = data.filter(task => Number(task.assignee_id)===Number(user.id)||task.collaborator_ids?.map(Number).includes(Number(user.id)));
      setTasks(own);

    }).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được công việc để lập báo cáo.');}).finally(()=>{if(active)setTasksLoading(false);});
    return ()=>{active=false;controller.abort();};
  }, [user, setError]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const loadDetail = async (report) => {
    try { const { data } = await api.get(`/reports/${report.id}`); setDetail(data); setTab('detail'); setReview({ status: 'approved', feedback: data.feedback || '', item_opinions: data.items.map((item) => ({ id: item.id, opinion: item.leader_opinion || '' })) }); setError(''); }
    catch (err) { setError(err.response?.data?.error || 'Không tải được báo cáo'); }
  };
  const openCreate = () => {
    const task=tasks.find(item=>String(item.id)===String(filter.task_id));
    setPendingUpdates({});setEditing({});setError('');
    setForm(task?{...blank,title:`Báo cáo: ${task.title}`.slice(0,500),customer_id:task.customer_id||'',task_ids:[task.id]}:{...blank});
  };
  const openEdit = () => { setPendingUpdates({}); setEditing(detail); setForm({ title: detail.title, content: detail.content, type: detail.type, period_start: detail.period_start || '', period_end: detail.period_end || '', customer_id: detail.customer_id || '', task_ids: detail.items.map((item) => item.task_id) }); setDetail(null); setError(''); };
  const save = async (status) => {
    if (saving) return;
    if (hasPendingUpdates(form.task_ids)) { setError('Hãy lưu cập nhật công việc trước khi lưu/gửi báo cáo.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      if (editing.id) {
        await api.put(`/reports/${editing.id}`, form);
        if (status === 'submitted') await api.post(`/reports/${editing.id}/submit`);
      } else await api.post('/reports', { ...form, status });
      setEditing(null); refresh(); setNotice(status === 'submitted' ? 'Đã gửi báo cáo.' : 'Đã lưu bản nháp.');
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được báo cáo'); }
    finally { setSaving(false); }
  };
  const submitReview = async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api.put(`/reports/${detail.id}/review`, review); await loadDetail(detail); refresh(); setNotice('Đã lưu phản hồi và trạng thái duyệt.'); }
    catch (err) { setError(err.response?.data?.error || 'Không duyệt được báo cáo'); }
    finally { setSaving(false); }
  };
  const reopen = async () => {
    const reason = await requestReason('Lý do mở lại báo cáo:'); if (!reason?.trim()) return;
    try { await api.post(`/reports/${detail.id}/reopen`, { reason }); await loadDetail(detail); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không mở lại được báo cáo'); }
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
  const canEdit = detail && canReportAction(user, 'edit', detail) && ['draft', 'reopened', 'rejected'].includes(detail.status);
  const canApprove = detail && Number(detail.employee_id) !== Number(user.id) && canReportAction(user, 'approve', detail) && ['submitted', 'reviewed'].includes(detail.status);
  const canDelete = detail && canReportAction(user, 'delete', detail) && (detail.status === 'draft' || scopeFor(user, 'reports', 'delete') === 'all');
  return <Layout title="Báo cáo công việc"
    actions={scopeFor(user, 'reports', 'create') !== 'none' && <button disabled={tasksLoading} onClick={openCreate} className="ui-button ui-button-primary">Lập báo cáo</button>}>
    {filter.task_id&&<div className="ui-card mb-3 flex flex-wrap items-center gap-3 p-3 text-sm"><span>Báo cáo liên kết công việc #{filter.task_id}</span><button type="button" className="text-teal hover:underline focus-ring" onClick={()=>setFilter('task_id','')}>Bỏ lọc công việc</button></div>}
    <div className="ui-card mb-4 p-4">
      <div className="flex justify-end">{scopeFor(user, 'reports', 'restore') !== 'none' && <label className="ml-auto text-xs text-slate"><input type="checkbox" checked={filter.deleted === '1'} onChange={(event) => setFilter('deleted', event.target.checked ? '1' : '')} /> Đã xóa</label>}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><input type="date" aria-label="Kỳ từ" value={filter.from || ''} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} /><input type="date" aria-label="Kỳ đến" value={filter.to || ''} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} /><select aria-label="Phòng ban" value={filter.department_id || ''} onChange={(e) => setFilter('department_id', e.target.value)} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><select aria-label="Nhân viên" value={filter.employee_id || ''} onChange={(e) => setFilter('employee_id', e.target.value)} className={inputClass}><option value="">Mọi nhân viên</option>{!employees.some(e => Number(e.id) === Number(user.id)) && <option value={user.id}>{user.full_name || user.email}</option>}{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select><select aria-label="Khách hàng" value={filter.customer_id || ''} onChange={(e) => setFilter('customer_id', e.target.value)} className={inputClass}><option value="">Mọi khách hàng</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Trạng thái" value={filter.status || ''} onChange={(e) => setFilter('status', e.target.value)} className={inputClass}><option value="">Mọi trạng thái</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}

    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải báo cáo...</div> : !reports.length ? <div className="ui-card ui-empty">Chưa có báo cáo phù hợp với bộ lọc.</div> : <div className="ui-card overflow-x-auto"><table className="ui-table report-list-table min-w-[1300px]"><thead><tr><th>Kỳ báo cáo / Tiêu đề</th><th>Người lập</th><th>Phòng ban</th><th>Khách hàng</th><th>Tiến độ</th><th>Hạn</th><th>Vướng mắc</th><th>Giải pháp</th><th>Trạng thái</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><span className="block text-xs text-slate">{dateText(report.period_start)} – {dateText(report.period_end)}</span><span className="font-semibold text-ink">{report.title}</span></td><td>{report.employee_name}</td><td>{report.department_name || '—'}</td><td>{report.customer_name || '—'}</td><td><ReportSummaryCell items={report.task_summaries} field="progress" /></td><td><ReportSummaryCell items={report.task_summaries} field="due_date" /></td><td><ReportSummaryCell items={report.task_summaries} field="blockers" /></td><td><ReportSummaryCell items={report.task_summaries} field="solution" /></td><td><ReportStatusBadge status={report.status} /></td><td>{report.submitted_at ? new Date(report.submitted_at).toLocaleDateString('vi-VN') : '—'}</td><td>{filter.deleted === '1' ? <button type="button" onClick={() => restore(report)} className="font-semibold text-teal hover:underline">Khôi phục</button> : <button type="button" onClick={() => loadDetail(report)} className="font-semibold text-teal hover:underline">Xem chi tiết</button>}</td></tr>)}</tbody></table></div>}
    <Pagination {...pagination} />
    {editing && <Modal title={editing.id ? 'Sửa báo cáo' : 'Lập báo cáo công việc'} onClose={() => setEditing(null)} width="max-w-4xl">
      <form onSubmit={(event) => { event.preventDefault(); save('draft'); }} className="space-y-5">
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Thông tin chung</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium">Tiêu đề <span className="text-clay">*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Loại báo cáo<select value={form.type} disabled={Boolean(editing.id)} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}><option value="weekly">Báo cáo tuần</option><option value="daily">Hằng ngày</option><option value="monthly">Hằng tháng</option><option value="project">Dự án</option></select></label>
            <label className="text-sm font-medium">Khách hàng<select value={form.customer_id || ''} onChange={(event) => setForm({ ...form, customer_id: event.target.value })} className={inputClass}><option value="">Không có</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          </div>
        </section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Kỳ báo cáo</h3><div className="grid gap-4 sm:grid-cols-2"><DateInput label="Từ ngày" value={form.period_start} onChange={(value) => setForm({ ...form, period_start: value })} /><DateInput label="Đến ngày" value={form.period_end} onChange={(value) => setForm({ ...form, period_end: value })} /></div></section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Tiến độ, vướng mắc và giải pháp</h3><label className="block text-sm font-medium">Nội dung<textarea rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className={inputClass} /></label><fieldset className="mt-4"><legend className="text-sm font-semibold">Chọn công việc cần báo cáo</legend><div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-3">{tasksLoading ? <p role="status" className="text-sm text-slate">Đang tải công việc...</p> : tasks.length ? tasks.map((task) => <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:bg-paper"><input type="checkbox" className="mt-1" checked={form.task_ids.includes(task.id)} onChange={(event) => setForm({ ...form, task_ids: event.target.checked ? [...form.task_ids, task.id] : form.task_ids.filter((id) => id !== task.id) })} /><span>#{task.id} {task.title}</span></label>) : <p className="text-sm text-slate">Chưa có công việc có thể chọn.</p>}</div></fieldset>{!form.task_ids.length&&<p className="mt-3 text-sm text-slate">Chọn công việc ở trên để nhập Tiến độ, Vướng mắc và Giải pháp cho từng việc.</p>}{tasks.filter(task => form.task_ids.includes(task.id)).map(task => <ReportTaskUpdate key={task.id} task={task} employeeId={user.id} canUpdate={scopeFor(user, 'tasks', 'edit') !== 'none'} disabled={saving} onStateChange={updateState} />)}<p className="mt-3 text-xs text-slate">Cập nhật từng công việc và bấm “Lưu cập nhật công việc”, sau đó lưu hoặc gửi báo cáo. Tiến độ được lưu vào công việc gốc.</p></section>
        {error && <p role="alert" className="ui-notice">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-white py-3"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-secondary">{saving ? 'Đang lưu...' : 'Lưu nháp'}</button><button type="button" disabled={saving || !form.title.trim()} onClick={() => save('submitted')} className="ui-button ui-button-primary">{saving ? 'Đang gửi...' : 'Gửi báo cáo'}</button></div>
      </form>
    </Modal>}
    {detail && <Modal title={detail.title} onClose={() => setDetail(null)} width="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-2"><ReportStatusBadge status={detail.status} /><span className="text-xs text-slate">Phiên bản {detail.version}</span>{detail.status === 'approved' && <span className="rounded-full bg-[#e8f5ed] px-2.5 py-1 text-xs font-semibold text-[#17623a]">Nội dung đã khóa</span>}</div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3">{[['detail', 'Chi tiết'], ['history', 'Lịch sử']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key} className={`ui-button ${tab === key ? 'ui-button-primary' : 'ui-button-secondary'}`}>{label}</button>)}<div className="flex-1" />{canEdit && <button onClick={openEdit} className="ui-button ui-button-secondary">Sửa</button>}{detail.status === 'approved' && canReportAction(user, 'approve', detail) && Number(detail.employee_id) !== Number(user.id) && <button onClick={reopen} className="ui-button ui-button-secondary">Mở lại</button>}{canDelete && <button onClick={remove} className="ui-button ui-button-secondary text-clay">Xóa</button>}</div>
      {tab === 'detail' ? <div className="space-y-5">
        <section className="grid gap-3 rounded-xl bg-paper p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-slate">Người lập</span><strong className="block">{detail.employee_name}</strong></div><div><span className="text-slate">Phòng ban</span><strong className="block">{detail.department_name || '—'}</strong></div><div><span className="text-slate">Kỳ báo cáo</span><strong className="block">{dateText(detail.period_start)} – {dateText(detail.period_end)}</strong></div><div><span className="text-slate">Khách hàng</span><strong className="block">{detail.customer_name || '—'}</strong></div></section>
        <section><h3 className="mb-2 font-semibold">Nội dung</h3><p className="whitespace-pre-wrap text-sm leading-6">{detail.content || 'Chưa có nội dung.'}</p></section>
        <section><h3 className="mb-2 font-semibold">Công việc trong kỳ</h3><ReportItems items={detail.items} /></section>
        <section><h3 className="mb-2 font-semibold">Phản hồi quản lý</h3><p className="rounded-lg bg-paper p-3 text-sm">{detail.feedback || 'Chưa có phản hồi.'}</p></section>
        <section><h3 className="mb-2 font-semibold">Đính kèm</h3><Attachments kind="reports" entityId={detail.id} canManage={Boolean(canEdit)} /></section>
        {canApprove && <form onSubmit={submitReview} className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-semibold">Phản hồi và duyệt</h3><label className="block text-sm font-medium">Kết quả<select value={review.status} onChange={(event) => setReview({ ...review, status: event.target.value })} className={inputClass}><option value="reviewed">Đã xem xét</option><option value="approved">Duyệt</option><option value="rejected">Yêu cầu bổ sung</option></select></label><label className="block text-sm font-medium">Phản hồi chung<textarea value={review.feedback} onChange={(event) => setReview({ ...review, feedback: event.target.value })} className={inputClass} /></label>{detail.items.map((item) => <label key={item.id} className="block text-sm font-medium">Ý kiến cho công việc #{item.task_id}<textarea value={review.item_opinions.find((opinion) => opinion.id === item.id)?.opinion || ''} onChange={(event) => setReview({ ...review, item_opinions: review.item_opinions.map((opinion) => opinion.id === item.id ? { ...opinion, opinion: event.target.value } : opinion) })} className={inputClass} /></label>)}<button disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu phản hồi'}</button></form>}
      </div> : <div className="space-y-4"><section><h3 className="mb-2 font-semibold">Phiên bản đã lưu</h3>{detail.versions?.length ? detail.versions.map((version) => <div key={version.version} className="mb-2 rounded-lg border border-line p-3 text-sm"><strong>Phiên bản {version.version}</strong><span className="ml-2 text-slate">{new Date(version.created_at).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}</span><p className="mt-1 whitespace-pre-wrap">{version.snapshot?.report?.content}</p></div>) : <p className="text-sm text-slate">Chưa có phiên bản.</p>}</section><section><h3 className="mb-2 font-semibold">Nhật ký thay đổi</h3><AuditTrail entries={detail.history}/></section></div>}
      {error && <p role="alert" className="ui-notice mt-3">{error}</p>}
    </Modal>}
  </Layout>;
}

function canReportAction(user, action, report) {
  return scopeAllows(user, 'reports', action, { ownerId: report.employee_id, departmentId: report.effective_department_id ?? report.department_id });
}

export default function ReportsPage() { return <ProtectedRoute permission="reports"><ReportsContent /></ProtectedRoute>; }
