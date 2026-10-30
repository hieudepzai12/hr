'use client';
import { confirmAction } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import usePagedList from '@/lib/usePagedList';
import Pagination from '@/components/Pagination';

const RATING_COLOR = {
  'Hoàn thành tốt': { bg: '#DCE7DD', fg: '#2f6059' },
  'Hoàn thành': { bg: '#DBEAFE', fg: '#1D4F95' },
  'Không hoàn thành': { bg: '#F1DAD5', fg: '#9B3326' },
};

function KpiContent() {
  const { can } = useAuth();
  const isManager = can('kpi', 'manage');
  const { items: evaluations, pagination, loading, error: listError, refresh: load } = usePagedList('/kpi');
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', period: '', rating: '', task_ids: [], report_ids: [], comments: '' });
  const [evidenceOptions, setEvidenceOptions] = useState({ tasks: [], reports: [] });
  const [error,setError]=useFeedback('error');
  const [saving, setSaving] = useState(false);
  const [,setNotice]=useFeedback('success');

  useEffect(() => { if (isManager) api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(err=>setError(err.response?.data?.error||'Không tải được danh sách nhân viên.')); }, [isManager,setError]);

  const openCreate = () => {
    setForm({ employee_id: '', period: '', rating: '', comments: '', task_ids: [], report_ids: [] });
    setEvidenceOptions({ tasks: [], reports: [] });
    setError('');
    setModalOpen(true);
  };

  const selectEmployee = async (employeeId) => {
    setForm((current) => ({ ...current, employee_id: employeeId, task_ids: [], report_ids: [] }));
    setEvidenceOptions({ tasks: [], reports: [] });
    if (!employeeId) return;
    try { const { data } = await api.get('/kpi/evidence', { params: { employee_id: employeeId } }); setEvidenceOptions(data); }
    catch (err) { setError(err.response?.data?.error || 'Không tải được căn cứ KPI'); }
  };
  const toggleEvidence = (key, id) => setForm((current) => ({ ...current,
    [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id],
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await api.post('/kpi', form);
      setModalOpen(false);
      load();
      setNotice('Đã lưu đánh giá KPI.');
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!await confirmAction('Xoá đánh giá này?')) return;
    try { await api.delete(`/kpi/${id}`); load(); setNotice('Đã xóa đánh giá KPI.'); }
    catch (err) { setError(err.response?.data?.error || 'Không xóa được đánh giá KPI'); }
  };

  return (
    <Layout
      title="Đánh giá KPI"
      actions={isManager && (
        <button onClick={openCreate} className="ui-button ui-button-primary">
          <Plus size={16} /> Tạo đánh giá
        </button>
      )}
    >
      {(listError || error && !modalOpen) && <p role="alert" className="ui-notice mb-4">{listError || error}</p>}

      <div className="grid gap-3">
        {loading ? <p role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải đánh giá KPI...</p> : evaluations.length === 0 && <p className="ui-card ui-empty">Chưa có đánh giá KPI nào.</p>}
        {evaluations.map((ev) => {
          const colors = RATING_COLOR[ev.rating] || RATING_COLOR['Không hoàn thành'];
          return (
            <div key={ev.id} className="ui-card px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <Avatar name={ev.employee_name} color={ev.avatar_color} avatarPath={ev.avatar_path} size={36} />
                  <div>
                    <div className="font-medium text-ink">{ev.employee_name}</div>
                    <div className="text-xs text-slate">Kỳ {ev.period} · Đánh giá bởi {ev.evaluator_name || '—'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: colors.bg, color: colors.fg }}>{ev.rating}</span>
                </div>
              </div>
              {ev.comments && <p className="text-sm text-slate italic mt-2">&ldquo;{ev.comments}&rdquo;</p>}
              {ev.evidence?.length > 0 && <div className="mt-2 border-t border-line pt-2 text-xs text-slate">
                <strong>Căn cứ đánh giá:</strong> {ev.evidence.map((item) =>
                  <span key={item.task_id ? `t${item.task_id}` : `r${item.report_id}`} className="mr-2 inline-block">
                    {item.task_id ? `Công việc #${item.task_id}` : `Báo cáo #${item.report_id}`} · {item.snapshot.title}
                    {item.task_id && item.snapshot.accepted_at ? ' · Đã nghiệm thu' : ''}
                  </span>)}
              </div>}
              {isManager && (
                <button onClick={() => remove(ev.id)} className="mt-2 text-xs text-clay flex items-center gap-1 hover:underline">
                  <Trash2 size={12} /> Xoá
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Pagination {...pagination} />

      {modalOpen && (
        <Modal title="Tạo đánh giá KPI" onClose={() => { if(!saving)setModalOpen(false); }} width="max-w-xl">
          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Nhân viên</label>
                <select required value={form.employee_id} onChange={(e) => selectEmployee(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="">— Chọn —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Kỳ đánh giá</label>
                <input required placeholder="VD: 2026-Q3" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
            </div>

            <label className="block text-sm font-medium text-ink">Mức đánh giá<span className="required-mark">*</span>
              <select required value={form.rating} onChange={event=>setForm({...form,rating:event.target.value})} className="ui-field mt-2">
                <option value="">Chọn mức đánh giá</option>
                {['Không hoàn thành','Hoàn thành','Hoàn thành tốt'].map(rating=><option key={rating} value={rating}>{rating}</option>)}
              </select>
            </label>

            {form.employee_id && <div className="rounded-md border border-line p-3 text-sm">
              <div className="font-medium mb-1">Công việc và báo cáo làm căn cứ</div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {evidenceOptions.tasks.map((task) => <label key={`t${task.id}`} className="block"><input type="checkbox" checked={form.task_ids?.includes(task.id) || false} onChange={() => toggleEvidence('task_ids', task.id)} /> Công việc #{task.id} · {task.title} · {task.status}{task.accepted_at ? ' · đã nghiệm thu' : ''}</label>)}
                {evidenceOptions.reports.map((report) => <label key={`r${report.id}`} className="block"><input type="checkbox" checked={form.report_ids?.includes(report.id) || false} onChange={() => toggleEvidence('report_ids', report.id)} /> Báo cáo #{report.id} · {report.title} · {report.status}</label>)}
                {!evidenceOptions.tasks.length && !evidenceOptions.reports.length && <p className="text-xs text-slate">Chưa có công việc hoặc báo cáo khả dụng.</p>}
              </div>
            </div>}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Nhận xét</label>
              <textarea rows={2} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none" />
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="ui-button ui-button-secondary">Huỷ</button>
              <button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu đánh giá'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}

export default function KpiPage() {
  return (
    <ProtectedRoute>
      <KpiContent />
    </ProtectedRoute>
  );
}
