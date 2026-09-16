'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';

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
  const { isManager } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', period: '', criteria: DEFAULT_CRITERIA, comments: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/kpi').then(({ data }) => setEvaluations(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isManager) api.get('/employees').then(({ data }) => setEmployees(data)); }, [isManager]);

  const openCreate = () => {
    setForm({ employee_id: '', period: '', criteria: DEFAULT_CRITERIA.map(c => ({ ...c })), comments: '' });
    setError('');
    setModalOpen(true);
  };

  const updateCriterion = (idx, field, value) => {
    const next = [...form.criteria];
    next[idx] = { ...next[idx], [field]: field === 'name' ? value : Number(value) };
    setForm({ ...form, criteria: next });
  };

  const totalWeight = form.criteria?.reduce((s, c) => s + Number(c.weight || 0), 0) || 0;
  const previewScore = totalWeight > 0
    ? Math.round((form.criteria.reduce((s, c) => s + (Number(c.score || 0) * Number(c.weight || 0)) / 100, 0) * 100 / totalWeight) * 10) / 10
    : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (totalWeight !== 100) { setError('Tổng trọng số các tiêu chí phải bằng 100%'); return; }
    try {
      await api.post('/kpi', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const remove = async (id) => {
    if (!confirm('Xoá đánh giá này?')) return;
    await api.delete(`/kpi/${id}`);
    load();
  };

  return (
    <Layout
      title="Đánh giá KPI"
      subtitle="Hiệu suất làm việc theo từng kỳ đánh giá"
      actions={isManager && (
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Tạo đánh giá
        </button>
      )}
    >
      <div className="grid gap-3">
        {evaluations.length === 0 && <p className="text-sm text-slate">Chưa có đánh giá KPI nào.</p>}
        {evaluations.map((ev) => {
          const colors = RATING_COLOR[ev.rating] || RATING_COLOR['Đạt'];
          return (
            <div key={ev.id} className="bg-paper-raised rounded-lg border border-line px-5 py-4">
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
              {isManager && (
                <button onClick={() => remove(ev.id)} className="mt-2 text-xs text-clay flex items-center gap-1 hover:underline">
                  <Trash2 size={12} /> Xoá
                </button>
              )}
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <Modal title="Tạo đánh giá KPI" onClose={() => setModalOpen(false)} width="max-w-xl">
          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Nhân viên</label>
                <select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
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

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Nhận xét</label>
              <textarea rows={2} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none" />
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring">Huỷ</button>
              <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">Lưu đánh giá</button>
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
