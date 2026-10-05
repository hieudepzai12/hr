'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, Pencil, UserX, Camera, Loader2, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABEL = { admin: 'Quản trị viên', director: 'Giám đốc', manager: 'Quản lý', employee: 'Nhân viên' };

function EmployeesContent() {
  const { can, user } = useAuth();
  const isManager = can('employees', 'manage');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const avatarFileRef = useRef(null);

  const load = useCallback(() => {
    api.get('/employees', { params: { search: search || undefined } }).then(({ data }) => setEmployees(data));
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/departments').then(({ data }) => setDepartments(data)); }, []);
  useEffect(() => { api.get('/roles').then(({ data }) => setRoles(data)); }, []);
  useEffect(() => {
    api.get('/employees', { params: { status: 'active' } }).then(({ data }) => setManagerOptions(data));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', email: '', password: '', role: 'employee', position: '', department_id: '', manager_id: '', phone: '', join_date: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ ...emp, department_id: emp.department_id || '', manager_id: emp.manager_id || '' });
    setError('');
    setModalOpen(true);
  };

  const openPassword = (target) => {
    setPasswordTarget(target);
    setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    setPasswordError('');
    setNotice('');
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('Xác nhận mật khẩu mới không khớp.');
      return;
    }
    setPasswordSaving(true);
    try {
      if (passwordTarget.id === user.id) {
        await api.post('/auth/change-password', {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        });
        setNotice('Đã đổi mật khẩu của bạn.');
      } else {
        await api.post(`/employees/${passwordTarget.id}/reset-password`, { new_password: passwordForm.new_password });
        setNotice(`Đã đặt lại mật khẩu cho ${passwordTarget.full_name}.`);
      }
      setPasswordTarget(null);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Không thể cập nhật mật khẩu.');
    } finally {
      setPasswordSaving(false);
    }
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
      api.get('/employees', { params: { status: 'active' } }).then(({ data }) => setManagerOptions(data));
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Vô hiệu hoá nhân viên này?')) return;
    try {
      await api.delete(`/employees/${id}`);
      load();
      api.get('/employees', { params: { status: 'active' } }).then(({ data }) => setManagerOptions(data));
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể vô hiệu hóa tài khoản.');
    }
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
      actions={isManager && <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Thêm nhân viên
        </button>}
    >
      {!modalOpen && error && <div role="alert" className="mb-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}
      {notice && <div role="status" className="mb-4 text-sm text-teal bg-[#DEE8D5] px-3 py-2 rounded-md">{notice}</div>}
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
              <th className="px-5 py-3 font-medium">Quản lý trực tiếp</th>
              <th className="px-5 py-3 font-medium">Vai trò</th>
              <th className="px-5 py-3 font-medium">Trạng thái</th>
              <th className="px-5 py-3 font-medium"></th>
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
                <td className="px-5 py-3 text-ink">{managerOptions.find((person) => person.id === emp.manager_id)?.full_name || '—'}</td>
                <td className="px-5 py-3 text-ink">{roles.find((item) => item.role === emp.role)?.label || ROLE_LABEL[emp.role] || emp.role}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${emp.status === 'active' ? 'bg-[#DEE8D5] text-[#5C7A4F]' : 'bg-[#E4E2D9] text-slate'}`}>
                    {emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}
                  </span>
                </td>
                <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {isManager && (user?.role === 'admin' || emp.role !== 'admin') && <button onClick={() => openEdit(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label={`Sửa ${emp.full_name}`}>
                        <Pencil size={15} />
                      </button>}
                      {user?.role === 'admin' && emp.role !== 'admin' && <button onClick={() => deactivate(emp.id)} className="p-1.5 text-slate hover:text-clay transition-colors focus-ring rounded" aria-label={`Vô hiệu hóa ${emp.full_name}`}>
                        <UserX size={15} />
                      </button>}
                      {user?.role === 'admin' && emp.id !== user.id && <button onClick={() => openPassword(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label={`Đặt lại mật khẩu cho ${emp.full_name}`} title="Đặt lại mật khẩu"><KeyRound size={15} /></button>}
                      {emp.id === user.id && <button onClick={() => openPassword(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label="Đổi mật khẩu của tôi" title="Đổi mật khẩu"><KeyRound size={15} /></button>}
                      {isManager && emp.role === 'admin' && <span className="text-xs text-slate px-2">Tài khoản bảo vệ</span>}
                    </div>
                  </td>
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
                <select value={form.role || 'employee'} disabled={user?.role !== 'admin' || editing?.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.value, manager_id: e.target.value === 'admin' ? '' : form.manager_id })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  {roles.map((item) => <option key={item.role} value={item.role}>{item.label}</option>)}
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
              {form.role !== 'admin' && <div>
                <label htmlFor="manager-id" className="block text-xs font-medium text-ink mb-1">Quản lý trực tiếp</label>
                <select id="manager-id" value={form.manager_id || ''} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="">— Không có —</option>
                  {managerOptions.filter((person) => person.id !== editing?.id && person.role !== 'admin').map((person) =>
                    <option key={person.id} value={person.id}>{person.full_name} ({person.position || roles.find((item) => item.role === person.role)?.label || 'Nhân viên'})</option>
                  )}
                </select>
              </div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              {editing && editing.role !== 'admin' && (
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
      {passwordTarget && <Modal title={passwordTarget.id === user.id ? 'Đổi mật khẩu của tôi' : `Đặt lại mật khẩu: ${passwordTarget.full_name}`} onClose={() => setPasswordTarget(null)}>
        <form onSubmit={submitPassword} className="space-y-4">
          {passwordTarget.id === user.id && user.role !== 'admin' ? <div><label htmlFor="current-password" className="block text-sm font-medium mb-1">Mật khẩu hiện tại</label><input id="current-password" type="password" autoComplete="current-password" required value={passwordForm.current_password} onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm focus-ring" /><p className="text-xs text-slate mt-1">Nếu quên mật khẩu cũ, hãy liên hệ admin để được đặt lại.</p></div> : passwordTarget.id !== user.id ? <p className="text-sm text-slate">Admin có thể đặt mật khẩu mới khi nhân viên quên mật khẩu cũ.</p> : null}
          <div><label htmlFor="new-password" className="block text-sm font-medium mb-1">Mật khẩu mới</label><input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm focus-ring" /><p className="text-xs text-slate mt-1">Ít nhất 8 ký tự.</p></div>
          <div><label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Xác nhận mật khẩu mới</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={passwordForm.confirm_password} onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm focus-ring" /></div>
          {passwordError && <p role="alert" className="text-sm text-clay">{passwordError}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setPasswordTarget(null)} className="px-4 py-2 text-sm rounded-md border border-line">Hủy</button><button type="submit" disabled={passwordSaving} className="px-4 py-2 text-sm rounded-md bg-teal text-white disabled:opacity-50">{passwordSaving ? 'Đang lưu...' : 'Lưu mật khẩu'}</button></div>
        </form>
      </Modal>}
    </Layout>
  );
}

export default function EmployeesPage() {
  return (
    <ProtectedRoute>
      <EmployeesContent />
    </ProtectedRoute>
  );
}
