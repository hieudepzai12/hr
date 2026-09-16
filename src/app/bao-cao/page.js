'use client';

import { useEffect, useState } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ReportStatusBadge } from '@/components/Badges';
import Attachments from '@/components/Attachments';
import { useAuth } from '@/context/AuthContext';

const TYPE_LABEL = { daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly: 'Hàng tháng', project: 'Dự án' };

function ReportsContent() {
  const { isManager } = useAuth();
  const [reports, setReports] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'weekly', period_start: '', period_end: '' });
  const [reviewForm, setReviewForm] = useState({ status: 'approved', feedback: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/reports').then(({ data }) => setReports(data));
  useEffect(() => { load(); }, []);

  const submitReport = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/reports', form);
      setCreateOpen(false);
      setForm({ title: '', content: '', type: 'weekly', period_start: '', period_end: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    await api.put(`/reports/${detail.id}/review`, reviewForm);
    setDetail(null);
    load();
  };

  const removeReport = async (id) => {
    if (!confirm('Xoá báo cáo này?')) return;
    await api.delete(`/reports/${id}`);
    load();
  };

  return (
    <Layout
      title="Báo cáo"
      subtitle={isManager ? 'Xem và duyệt báo cáo từ nhân viên' : 'Gửi báo cáo công việc của bạn'}
      actions={
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Gửi báo cáo
        </button>
      }
    >
      <div className="grid gap-3">
        {reports.length === 0 && <p className="text-sm text-slate">Chưa có báo cáo nào.</p>}
        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => { setDetail(r); setReviewForm({ status: 'approved', feedback: r.feedback || '' }); }}
            className="text-left bg-paper-raised rounded-lg border border-line px-5 py-4 hover:border-teal transition-colors focus-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-teal bg-[#DCE7DD] px-2 py-0.5 rounded">{TYPE_LABEL[r.type]}</span>
                  {isManager && <span className="text-xs text-slate">{r.employee_name}</span>}
                </div>
                <div className="font-medium text-ink">{r.title}</div>
                <p className="text-sm text-slate mt-1 line-clamp-2">{r.content}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ReportStatusBadge status={r.status} />
                <span className="text-xs text-slate">{format(new Date(r.created_at), 'dd/MM/yyyy')}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {createOpen && (
        <Modal title="Gửi báo cáo mới" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitReport} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Tiêu đề</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Báo cáo tuần 37"
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Loại báo cáo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Từ ngày</label>
                <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Đến ngày</label>
                <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Nội dung</label>
              <textarea required rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Mô tả công việc đã hoàn thành, khó khăn gặp phải, kế hoạch tiếp theo..."
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none" />
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <p className="text-xs text-slate">Bạn có thể đính kèm file (PDF, Word, Excel, ảnh...) sau khi gửi báo cáo, trong màn hình chi tiết.</p>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring">Huỷ</button>
              <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">Gửi báo cáo</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} width="max-w-xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium text-teal bg-[#DCE7DD] px-2 py-0.5 rounded">{TYPE_LABEL[detail.type]}</span>
            <ReportStatusBadge status={detail.status} />
            <span className="text-xs text-slate ml-auto">{format(new Date(detail.created_at), 'dd/MM/yyyy HH:mm')}</span>
          </div>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{detail.content}</p>

          <div className="mt-4 pt-4 border-t border-line">
            <Attachments kind="reports" entityId={detail.id} canManage />
          </div>

          {detail.feedback && (
            <div className="mt-4 bg-paper rounded-md px-4 py-3 border border-line">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate mb-1">
                <MessageSquare size={13} /> Phản hồi
              </div>
              <p className="text-sm text-ink">{detail.feedback}</p>
            </div>
          )}

          {isManager && (
            <form onSubmit={submitReview} className="mt-5 pt-5 border-t border-line space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Cập nhật trạng thái</label>
                <select value={reviewForm.status} onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="reviewed">Đã xem xét</option>
                  <option value="approved">Duyệt</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Phản hồi</label>
                <textarea rows={3} value={reviewForm.feedback} onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <button type="button" onClick={() => removeReport(detail.id)} className="text-clay text-xs flex items-center gap-1 hover:underline">
                  <Trash2 size={13} /> Xoá báo cáo
                </button>
                <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">
                  Cập nhật
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Layout>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <ReportsContent />
    </ProtectedRoute>
  );
}
