'use client';

import { useEffect, useState } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import { PriorityBadge } from '@/components/Badges';
import Attachments from '@/components/Attachments';
import { useAuth } from '@/context/AuthContext';

const COLUMNS = [
  { key: 'todo', label: 'Chưa bắt đầu' },
  { key: 'in_progress', label: 'Đang thực hiện' },
  { key: 'review', label: 'Đang xem xét' },
  { key: 'done', label: 'Hoàn thành' },
];

function DueLabel({ date, status }) {
  const days = differenceInCalendarDays(new Date(date), new Date());
  if (status === 'done') return <span className="text-xs text-slate">{format(new Date(date), 'dd/MM')}</span>;
  const overdue = days < 0;
  const soon = days >= 0 && days <= 2;
  return (
    <span className={`text-xs font-medium ${overdue ? 'text-clay' : soon ? 'text-amber-dark' : 'text-slate'}`}>
      {overdue ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Hạn hôm nay' : `Còn ${days} ngày`}
    </span>
  );
}

function TimelineContent() {
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  const load = () => api.get('/tasks').then(({ data }) => setTasks(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isManager) api.get('/employees').then(({ data }) => setEmployees(data)); }, [isManager]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', assignee_id: '', status: 'todo', priority: 'medium', start_date: '', due_date: '', progress: 0 });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setEditing(task);
    setForm({ ...task, assignee_id: task.assignee_id || '' });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/tasks/${editing.id}`, form);
      else await api.post('/tasks', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const moveTask = async (task, newStatus) => {
    await api.put(`/tasks/${task.id}`, { status: newStatus, progress: newStatus === 'done' ? 100 : task.progress });
    load();
  };

  return (
    <Layout
      title="Timeline & Deadline"
      subtitle="Theo dõi tiến độ công việc theo bảng Kanban"
      actions={isManager && (
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Giao việc mới
        </button>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="bg-paper-raised rounded-lg border border-line flex flex-col">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{col.label}</span>
                <span className="text-xs text-slate bg-paper rounded-full px-2 py-0.5">{colTasks.length}</span>
              </div>
              <div className="p-3 flex flex-col gap-2.5 min-h-[120px]">
                {colTasks.map((task) => (
                  <div key={task.id} onClick={() => openEdit(task)} className="bg-paper border border-line rounded-md p-3.5 cursor-pointer hover:border-teal transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-ink leading-snug">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    {task.assignee_name && (
                      <div className="text-xs text-slate mb-2">{task.assignee_name}</div>
                    )}
                    <div className="w-full h-1.5 bg-line rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-teal rounded-full" style={{ width: `${task.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate">
                        <Calendar size={12} />
                        <span className="text-xs">{format(new Date(task.due_date), 'dd/MM')}</span>
                      </div>
                      <DueLabel date={task.due_date} status={task.status} />
                    </div>
                    <div className="flex gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
                      {COLUMNS.filter(c => c.key !== task.status).map((c) => (
                        <button key={c.key} onClick={() => moveTask(task, c.key)}
                          className="text-[11px] px-2 py-1 rounded border border-line text-slate hover:border-teal hover:text-teal transition-colors focus-ring">
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && <p className="text-xs text-slate px-1 py-2">Không có công việc</p>}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Chi tiết công việc' : 'Giao việc mới'} onClose={() => setModalOpen(false)}>
          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Tiêu đề</label>
              <input required disabled={!isManager} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none disabled:bg-paper disabled:text-slate" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Mô tả</label>
              <textarea disabled={!isManager} rows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none disabled:bg-paper disabled:text-slate" />
            </div>
            {isManager && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Giao cho</label>
                  <select value={form.assignee_id || ''} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                    <option value="">— Chưa giao —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Độ ưu tiên</label>
                  <select value={form.priority || 'medium'} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Ngày bắt đầu</label>
                <input type="date" disabled={!isManager} value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none disabled:bg-paper disabled:text-slate" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Hạn chót</label>
                <input type="date" required disabled={!isManager} value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none disabled:bg-paper disabled:text-slate" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Tiến độ ({form.progress || 0}%)</label>
              <input type="range" min="0" max="100" value={form.progress || 0} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
                className="w-full accent-teal" />
            </div>

            {editing && (
              <div className="border-t border-line pt-3.5">
                <Attachments kind="tasks" entityId={editing.id} canManage />
              </div>
            )}

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            {!editing && (
              <p className="text-xs text-slate">Bạn có thể đính kèm file sau khi giao việc, mở lại công việc để thêm.</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring">Huỷ</button>
              <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">
                {editing ? 'Lưu thay đổi' : 'Giao việc'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}

export default function TimelinePage() {
  return (
    <ProtectedRoute>
      <TimelineContent />
    </ProtectedRoute>
  );
}
