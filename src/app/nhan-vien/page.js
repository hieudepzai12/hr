'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Pencil, UserX, Camera, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABEL = { admin: 'Quản trị viên', manager: 'Quản lý', employee: 'Nhân viên' };

function EmployeesContent() {
  const { isManager } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarFileRef = useRef(null);

  const load = () => {
    api.get('/employees', { params: { search: search || undefined } }).then(({ data }) => setEmployees(data));
  };

  useEffect(() => { load(); }, [search]);
  useEffect(() => { api.get('/departments').then(({ data }) => setDepartments(data)); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', email: '', password: '', role: 'employee', position: '', department_id: '', phone: '', join_date: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ ...emp, department_id: emp.department_id || '' });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await api.put(`/employees/${editing.id}`, form);
      } else {
        await api.post('/employees', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Vô hiệu hoá nhân viên này?')) return;
    await api.delete(`/employees/${id}`);
    load();
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post(`/employees/${editing.id}/avatar`, formData);
      setForm((f) => ({ ...f, avatar_path: data.avatar_path }));
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Tải ảnh thất bại');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Layout
      title="Nhân viên"
      subtitle={`${employees.length} nhân viên`}
      actions={isManager && (
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Thêm nhân viên
        </button>
      )}
    >
      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc email..."
          className="w-full pl-9 pr-3 py-2 rounded-md border border-line bg-paper-raised text-sm focus-ring focus:border-teal outline-none"
        />
      </div>

      <div className="bg-paper-raised rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-slate">
              <th className="px-5 py-3 font-medium">Nhân viên</th>
              <th className="px-5 py-3 font-medium">Chức vụ</th>
              <th className="px-5 py-3 font-medium">Phòng ban</th>
              <th className="px-5 py-3 font-medium">Vai trò</th>
              <th className="px-5 py-3 font-medium">Trạng thái</th>
              {isManager && <th className="px-5 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-paper/50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={emp.full_name} color={emp.avatar_color} avatarPath={emp.avatar_path} size={32} />
                    <div>
                      <div className="font-medium text-ink">{emp.full_name}</div>
                      <div className="text-xs text-slate">{emp.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-ink">{emp.position || '—'}</td>
                <td className="px-5 py-3 text-ink">{emp.department_name || '—'}</td>
                <td className="px-5 py-3 text-ink">{ROLE_LABEL[emp.role]}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${emp.status === 'active' ? 'bg-[#DEE8D5] text-[#5C7A4F]' : 'bg-[#E4E2D9] text-slate'}`}>
                    {emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}
                  </span>
                </td>
                {isManager && (
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => deactivate(emp.id)} className="p-1.5 text-slate hover:text-clay transition-colors focus-ring rounded">
                        <UserX size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên'} onClose={() => setModalOpen(false)}>
          <form onSubmit={submit} className="space-y-3.5">
            {editing && (
              <div className="flex items-center gap-3 pb-1">
                <div className="relative">
                  <Avatar name={form.full_name} color={editing.avatar_color} avatarPath={form.avatar_path} size={56} />
                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-teal hover:bg-teal-dark text-white flex items-center justify-center border-2 border-paper-raised transition-colors focus-ring disabled:opacity-60"
                  >
                    {avatarUploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                  </button>
                  <input ref={avatarFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
                </div>
                <span className="text-xs text-slate">Nhấn biểu tượng máy ảnh để đổi ảnh đại diện</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Họ và tên</label>
              <input required value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
            </div>
            {!editing && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Email</label>
                  <input required type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Mật khẩu ban đầu</label>
                  <input required type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Chức vụ</label>
                <input value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Vai trò</label>
                <select value={form.role || 'employee'} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="employee">Nhân viên</option>
                  <option value="manager">Quản lý</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Phòng ban</label>
                <select value={form.department_id || ''} onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="">— Chọn —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Số điện thoại</label>
                <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Ngày vào làm</label>
                <input type="date" value={form.join_date || ''} onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
              {editing && (
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Trạng thái</label>
                  <select value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                    <option value="active">Đang làm việc</option>
                    <option value="inactive">Đã nghỉ</option>
                  </select>
                </div>
              )}
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring">
                Huỷ
              </button>
              <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring">
                {editing ? 'Lưu thay đổi' : 'Thêm nhân viên'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}

export default function EmployeesPage() {
  return (
    <ProtectedRoute managerOnly>
      <EmployeesContent />
    </ProtectedRoute>
  );
}
