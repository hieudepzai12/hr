'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

function DepartmentsContent() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [departments, setDepartments] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/departments').then(({ data }) => setDepartments(data));
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (dept) => {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description || '' });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.put(`/departments/${editing.id}`, form);
      else await api.post('/departments', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const remove = async (dept) => {
    if (!confirm(`Xoá phòng ban "${dept.name}"? Nhân viên thuộc phòng ban này sẽ không còn thuộc phòng ban nào.`)) return;
    await api.delete(`/departments/${dept.id}`);
    load();
  };

  return (
    <Layout
      title="Phòng ban"
      subtitle={`${departments.length} phòng ban`}
      actions={
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Thêm phòng ban
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((d) => (
          <div key={d.id} className="bg-paper-raised rounded-lg border border-line p-5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="w-9 h-9 rounded-md bg-[#DCE7DD] flex items-center justify-center shrink-0">
                <Building2 size={17} className="text-teal" />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(d)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded">
                  <Pencil size={14} />
                </button>
                {isAdmin && (
                  <button onClick={() => remove(d)} className="p-1.5 text-slate hover:text-clay transition-colors focus-ring rounded">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="font-display font-semibold text-ink">{d.name}</div>
            {d.description && <p className="text-sm text-slate mt-1">{d.description}</p>}
            <div className="text-xs text-slate mt-3">{d.employee_count} nhân viên đang làm việc</div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Chỉnh sửa phòng ban' : 'Thêm phòng ban'} onClose={() => setModalOpen(false)}>
          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Tên phòng ban</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Mô tả</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none resize-none" />
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring">Huỷ</button>
              <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">
                {editing ? 'Lưu thay đổi' : 'Thêm phòng ban'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}

export default function DepartmentsPage() {
  return (
    <ProtectedRoute managerOnly>
      <DepartmentsContent />
    </ProtectedRoute>
  );
}
