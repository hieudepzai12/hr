'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Attachments from '@/components/Attachments';
import LoadMore from '@/components/LoadMore';
import usePagedList from '@/lib/usePagedList';
import { useAuth } from '@/context/AuthContext';
import { scopeFor, scopeAllows } from '@/lib/access';
import { ReportStatusBadge } from '@/components/Badges';
import DateInput from '@/components/DateInput';

const inputClass = 'ui-field mt-1';
const dateText = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const blank = { title: '', content: '', type: 'weekly', period_start: '', period_end: '', customer_id: '', task_ids: [] };
const statuses = { draft: 'Bản nháp', submitted: 'Đã gửi', reviewed: 'Đã xem xét', approved: 'Đã duyệt',
  rejected: 'Yêu cầu bổ sung', reopened: 'Đã mở lại' };

function ReportItems({ items }) {
  if (!items?.length) return <p className="text-sm text-slate">Chưa có công việc liên kết.</p>;
  return <div className="overflow-x-auto rounded-lg border border-line"><table className="ui-table min-w-[850px]"><thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Tiến độ</th><th>Kết quả / bước tiếp</th><th>Vướng mắc</th><th>Giải pháp</th><th>Ý kiến lãnh đạo</th></tr></thead><tbody>{items.map((item) => { const row = item.snapshot; return <tr key={item.id || item.task_id || row.task_id}><td className="font-semibold">#{row.task_id} {row.title}</td><td>{row.employee_name || '—'}</td><td><span className="font-semibold">{row.progress}%</span><div className="progress-track mt-1"><div className="progress-fill" style={{ width: `${row.progress || 0}%` }} /></div></td><td>{row.result || '—'}<br />{row.next_step || ''}</td><td>{row.blockers || '—'}</td><td>{row.solution || '—'}</td><td>{item.leader_opinion || '—'}</td></tr>; })}</tbody></table></div>;
}

function ReportsContent() {
  const { user } = useAuth();
  const [mode, setMode] = useState('mine');
  const [filter, setFilters] = useState({ employee_id: user.id });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [tab, setTab] = useState('detail');
  const [review, setReview] = useState({ status: 'approved', feedback: '', item_opinions: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const { items: reports, hasMore, loading, loadingMore, error: listError, refresh, loadMore } = usePagedList('/reports', filter);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (!status) return;
    const scope = scopeFor(user, 'reports', 'view');
    const next = scope === 'all' ? 'all' : scope === 'department' ? 'department' : 'mine';
    queueMicrotask(() => {
      setMode(next);
      setFilters({ ...(next === 'mine' ? { employee_id: user.id } : next === 'department' ? { department_id: user.department_id || -1 } : {}), status });
    });
  }, [user]);
  useEffect(() => {
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/customers').then(({ data }) => setCustomers(data)).catch(() => {});
    api.get('/tasks', { params: { limit: 100, offset: 0 } }).then(({ data }) => setTasks(data.items.filter((task) =>
      Number(task.assignee_id) === Number(user.id) || task.collaborator_ids?.map(Number).includes(Number(user.id))))).catch(() => {});
  }, [user.id]);
  const setModeFilter = (next) => {
    setMode(next);
    setFilters(next === 'mine' ? { employee_id: user.id } : next === 'department' ? { department_id: user.department_id || -1 } : {});
  };
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  const loadDetail = async (report) => {
    try { const { data } = await api.get(`/reports/${report.id}`); setDetail(data); setTab('detail'); setReview({ status: 'approved', feedback: data.feedback || '', item_opinions: data.items.map((item) => ({ id: item.id, opinion: item.leader_opinion || '' })) }); setError(''); }
    catch (err) { setError(err.response?.data?.error || 'Không tải được báo cáo'); }
  };
  const openCreate = () => { setEditing({}); setForm({ ...blank }); setError(''); };
  const openEdit = () => { setEditing(detail); setForm({ title: detail.title, content: detail.content, type: detail.type, period_start: detail.period_start || '', period_end: detail.period_end || '', customer_id: detail.customer_id || '', task_ids: detail.items.map((item) => item.task_id) }); setDetail(null); setError(''); };
  const save = async (status) => {
    if (saving) return; setSaving(true); setError(''); setNotice('');
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
    const reason = prompt('Lý do mở lại báo cáo:'); if (!reason?.trim()) return;
    try { await api.post(`/reports/${detail.id}/reopen`, { reason }); await loadDetail(detail); refresh(); }
    catch (err) { setError(err.response?.data?.error || 'Không mở lại được báo cáo'); }
  };
  const remove = async () => {
    const reason = prompt('Lý do xóa báo cáo:'); if (!reason?.trim()) return;
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
  return <Layout title="Báo cáo" subtitle="Kế hoạch và báo cáo tuần liên kết với công việc"
    actions={scopeFor(user, 'reports', 'create') !== 'none' && <button onClick={openCreate} className="ui-button ui-button-primary">Lập báo cáo</button>}>
    <div className="ui-card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">{[['mine', 'Báo cáo của tôi'], ['department', 'Báo cáo phòng ban'], ['all', 'Toàn bộ báo cáo']].filter(([key]) => key === 'mine' || key === 'department' && ['department', 'all'].includes(scopeFor(user, 'reports', 'view')) || key === 'all' && scopeFor(user, 'reports', 'view') === 'all').map(([key, label]) => <button key={key} onClick={() => setModeFilter(key)} aria-pressed={mode === key} className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === key ? 'bg-teal text-white' : 'bg-paper text-slate hover:text-ink'}`}>{label}</button>)}{scopeFor(user, 'reports', 'restore') !== 'none' && <label className="ml-auto text-xs text-slate"><input type="checkbox" checked={filter.deleted === '1'} onChange={(event) => setFilter('deleted', event.target.checked ? '1' : '')} /> Đã xóa</label>}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><input type="date" aria-label="Kỳ từ" value={filter.from || ''} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} /><input type="date" aria-label="Kỳ đến" value={filter.to || ''} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} /><select aria-label="Phòng ban" value={filter.department_id || ''} onChange={(e) => setFilter('department_id', e.target.value)} className={inputClass}><option value="">Mọi phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><select aria-label="Nhân viên" value={filter.employee_id || ''} onChange={(e) => setFilter('employee_id', e.target.value)} className={inputClass}><option value="">Mọi nhân viên</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select><select aria-label="Khách hàng" value={filter.customer_id || ''} onChange={(e) => setFilter('customer_id', e.target.value)} className={inputClass}><option value="">Mọi khách hàng</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Trạng thái" value={filter.status || ''} onChange={(e) => setFilter('status', e.target.value)} className={inputClass}><option value="">Mọi trạng thái</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    </div>
    {(error || listError) && <p role="alert" className="ui-notice mb-3">{error || listError}</p>}
    {notice && <p role="status" className="mb-3 rounded-lg border border-[#b9dfc9] bg-[#edfbf3] px-3 py-2 text-sm text-[#17623a]">{notice}</p>}
    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải báo cáo...</div> : !reports.length ? <div className="ui-card ui-empty">Chưa có báo cáo phù hợp với bộ lọc.</div> : <div className="ui-card overflow-x-auto"><table className="ui-table min-w-[900px]"><thead><tr><th>Kỳ báo cáo / Tiêu đề</th><th>Người lập</th><th>Phòng ban</th><th>Khách hàng</th><th>Trạng thái</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><span className="block text-xs text-slate">{dateText(report.period_start)} – {dateText(report.period_end)}</span><span className="font-semibold text-ink">{report.title}</span></td><td>{report.employee_name}</td><td>{report.department_name || '—'}</td><td>{report.customer_name || '—'}</td><td><ReportStatusBadge status={report.status} /></td><td>{report.submitted_at ? new Date(report.submitted_at).toLocaleDateString('vi-VN') : '—'}</td><td>{filter.deleted === '1' ? <button type="button" onClick={() => restore(report)} className="font-semibold text-teal hover:underline">Khôi phục</button> : <button type="button" onClick={() => loadDetail(report)} className="font-semibold text-teal hover:underline">Xem chi tiết</button>}</td></tr>)}</tbody></table></div>}
    <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
    {editing && <Modal title={editing.id ? 'Sửa báo cáo' : 'Lập kế hoạch / báo cáo tuần'} onClose={() => setEditing(null)} width="max-w-4xl">
      <form onSubmit={(event) => { event.preventDefault(); save('draft'); }} className="space-y-5">
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Thông tin chung</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium">Tiêu đề <span className="text-clay">*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Loại báo cáo<select value={form.type} disabled={Boolean(editing.id)} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}><option value="weekly">Báo cáo tuần</option><option value="daily">Hằng ngày</option><option value="monthly">Hằng tháng</option><option value="project">Dự án</option></select></label>
            <label className="text-sm font-medium">Khách hàng<select value={form.customer_id || ''} onChange={(event) => setForm({ ...form, customer_id: event.target.value })} className={inputClass}><option value="">Không có</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          </div>
        </section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Kỳ báo cáo</h3><div className="grid gap-4 sm:grid-cols-2"><DateInput label="Từ ngày" value={form.period_start} onChange={(value) => setForm({ ...form, period_start: value })} /><DateInput label="Đến ngày" value={form.period_end} onChange={(value) => setForm({ ...form, period_end: value })} /></div></section>
        <section className="rounded-xl border border-line p-4"><h3 className="mb-3 font-semibold">Nội dung và công việc</h3><label className="block text-sm font-medium">Nội dung<textarea rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className={inputClass} /></label><fieldset className="mt-4"><legend className="text-sm font-semibold">Công việc trong kỳ</legend><p className="mb-2 text-xs text-slate">Dữ liệu công việc được lưu tại thời điểm gửi báo cáo.</p><div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-3">{tasks.length ? tasks.map((task) => <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:bg-paper"><input type="checkbox" className="mt-1" checked={form.task_ids.includes(task.id)} onChange={(event) => setForm({ ...form, task_ids: event.target.checked ? [...form.task_ids, task.id] : form.task_ids.filter((id) => id !== task.id) })} /><span>#{task.id} {task.title}</span></label>) : <p className="text-sm text-slate">Chưa có công việc có thể chọn.</p>}</div></fieldset></section>
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
      </div> : <div className="space-y-4"><section><h3 className="mb-2 font-semibold">Phiên bản đã lưu</h3>{detail.versions?.length ? detail.versions.map((version) => <div key={version.version} className="mb-2 rounded-lg border border-line p-3 text-sm"><strong>Phiên bản {version.version}</strong><span className="ml-2 text-slate">{new Date(version.created_at).toLocaleString('vi-VN')}</span><p className="mt-1 whitespace-pre-wrap">{version.snapshot?.report?.content}</p></div>) : <p className="text-sm text-slate">Chưa có phiên bản.</p>}</section><section><h3 className="mb-2 font-semibold">Nhật ký thay đổi</h3>{detail.history?.length ? detail.history.map((entry) => <div key={entry.id} className="mb-2 rounded-lg border border-line p-3 text-sm"><strong>{entry.actor_name || 'Hệ thống'}</strong><span className="ml-2 text-slate">{entry.action} · {new Date(entry.created_at).toLocaleString('vi-VN')}</span>{entry.reason && <p className="mt-1">Lý do: {entry.reason}</p>}<pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-paper p-2 text-xs">{JSON.stringify(entry.changes, null, 2)}</pre></div>) : <p className="text-sm text-slate">Chưa có thay đổi.</p>}</section></div>}
      {error && <p role="alert" className="ui-notice mt-3">{error}</p>}
    </Modal>}
  </Layout>;
}

function canReportAction(user, action, report) {
  return scopeAllows(user, 'reports', action, { ownerId: report.employee_id, departmentId: report.effective_department_id ?? report.department_id });
}

export default function ReportsPage() { return <ProtectedRoute permission="reports"><ReportsContent /></ProtectedRoute>; }
