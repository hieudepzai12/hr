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
  'Xuất sắc': { bg: '#DEE8D5', fg: '#5C7A4F' },
  'Tốt': { bg: '#DCE7DD', fg: '#3F7069' },
  'Đạt': { bg: '#F3E3CB', fg: '#B8752E' },
  'Cần cải thiện': { bg: '#F1DAD5', fg: '#B85C4A' },
};

const DEFAULT_CRITERIA = [
  { name: 'Chất lượng công việc', weight: 40, score: 8 },
  { name: 'Đúng deadline', weight: 30, score: 8 },
  { name: 'Thái độ làm việc', weight: 30, score: 8 },
];

function KpiContent() {
  const { can } = useAuth();
  const isManager = can('kpi', 'manage');
  const { items: evaluations, pagination, loading, error: listError, refresh: load } = usePagedList('/kpi');
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', period: '', criteria: DEFAULT_CRITERIA, comments: '' });
  const [evidenceOptions, setEvidenceOptions] = useState({ tasks: [], reports: [] });
  const [error,setError]=useFeedback('error');
  const [saving, setSaving] = useState(false);
  const [notice,setNotice]=useFeedback('success');

  useEffect(() => { if (isManager) api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)); }, [isManager]);

  const openCreate = () => {
    setForm({ employee_id: '', period: '', criteria: DEFAULT_CRITERIA.map(c => ({ ...c })), comments: '', task_ids: [], report_ids: [] });
    setEvidenceOptions({ tasks: [], reports: [] });
    setError('');
    setModalOpen(true);
  };

  const updateCriterion = (idx, field, value) => {
    const next = [...form.criteria];
    next[idx] = { ...next[idx], [field]: field === 'name' ? value : Number(value) };
    setForm({ ...form, criteria: next });
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

  const totalWeight = form.criteria?.reduce((s, c) => s + Number(c.weight || 0), 0) || 0;
  const previewScore = totalWeight > 0
    ? Math.round((form.criteria.reduce((s, c) => s + (Number(c.score || 0) * Number(c.weight || 0)) / 100, 0) * 100 / totalWeight) * 10) / 10
    : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (totalWeight !== 100) { setError('Tổng trọng số các tiêu chí phải bằng 100%'); return; }
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
      subtitle="Hiệu suất làm việc theo từng kỳ đánh giá"
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
          const colors = RATING_COLOR[ev.rating] || RATING_COLOR['Đạt'];
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
                  <div className="font-display text-2xl font-semibold text-ink">{ev.total_score}</div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: colors.bg, color: colors.fg }}>{ev.rating}</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 mb-2">
                {ev.criteria.map((c, i) => (
                  <div key={i} className="bg-paper rounded-md px-3 py-2 border border-line">
                    <div className="text-xs text-slate">{c.name} ({c.weight}%)</div>
                    <div className="text-sm font-medium text-ink">{c.score}/10</div>
                  </div>
                ))}
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
        <Modal title="Tạo đánh giá KPI" onClose={() => setModalOpen(false)} width="max-w-xl">
          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
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

            <div>
              <label className="block text-xs font-medium text-ink mb-2">Tiêu chí đánh giá (tổng trọng số: {totalWeight}%)</label>
              <div className="space-y-2">
                {form.criteria.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_70px_70px] gap-2 items-center">
                    <input value={c.name} onChange={(e) => updateCriterion(idx, 'name', e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-line text-sm focus-ring focus:border-teal outline-none" placeholder="Tên tiêu chí" />
                    <input type="number" min="0" max="100" value={c.weight} onChange={(e) => updateCriterion(idx, 'weight', e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-line text-sm focus-ring focus:border-teal outline-none" placeholder="Trọng số %" />
                    <input type="number" min="0" max="10" step="0.5" value={c.score} onChange={(e) => updateCriterion(idx, 'score', e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-line text-sm focus-ring focus:border-teal outline-none" placeholder="Điểm /10" />
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate mt-1.5 flex gap-4"><span>Tên tiêu chí</span><span className="ml-auto">Trọng số %</span><span>Điểm /10</span></div>
            </div>

            <div className="bg-paper rounded-md px-4 py-3 border border-line flex items-center justify-between">
              <span className="text-sm text-slate">Điểm tổng kết dự kiến</span>
              <span className="font-display text-xl font-semibold text-ink">{previewScore}</span>
            </div>

            {form.employee_id && <div className="rounded-md border border-line p-3 text-sm">
              <div className="font-medium mb-1">Công việc và báo cáo làm căn cứ</div>
              <p className="text-xs text-slate mb-2">Chọn dữ liệu liên quan; điểm các tiêu chí vẫn do người đánh giá nhập.</p>
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
