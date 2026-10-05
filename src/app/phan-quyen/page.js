'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { MODULES } from '@/lib/permissions';
import Modal from '@/components/Modal';
import { Plus, Pencil, Trash2 } from 'lucide-react';

function Content() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [role, setRole] = useState('manager');
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.get('/permissions').then(({ data }) => {
      setRoles(data);
      setDraft(structuredClone(data.find((item) => item.role === 'manager')?.permissions || {}));
    }).catch(() => setMessage('Không tải được bộ quyền.'));
  }, [user?.role]);
  const selected = roles.find((item) => item.role === role);
  const toggle = (key, action) => setDraft((current) => {
    const next = { ...current, [key]: { ...current[key], [action]: !current[key][action] } };
    if (action === 'view' && !next[key].view) next[key].manage = false;
    if (action === 'manage' && next[key].manage) next[key].view = true;
    return next;
  });
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const { data } = await api.put('/permissions', { role, permissions: draft });
      setRoles((current) => current.map((item) => item.role === role ? data : item));
      setMessage(`Đã lưu bộ quyền ${selected.label}.`);
    } catch (error) { setMessage(error.response?.data?.error || 'Không lưu được bộ quyền.'); }
    finally { setSaving(false); }
  };
  const create = async (event) => {
    event.preventDefault();
    setSaving(true); setCreateError('');
    try {
      const { data } = await api.post('/permissions', { label: newName });
      setRoles((current) => [...current, data]);
      setRole(data.role);
      setDraft(structuredClone(data.permissions));
      setCreateOpen(false);
      setNewName('');
      setMessage(`Đã tạo bộ quyền ${data.label}. Hãy chọn quyền và lưu.`);
    } catch (error) { setCreateError(error.response?.data?.error || 'Không tạo được bộ quyền.'); }
    finally { setSaving(false); }
  };
  const rename = async (event) => {
    event.preventDefault();
    setSaving(true); setEditError('');
    try {
      const { data } = await api.put('/permissions', { role, label: editName, permissions: selected.permissions });
      setRoles((current) => current.map((item) => item.role === role ? data : item));
      setEditOpen(false);
      setMessage(`Đã đổi tên bộ quyền thành ${data.label}.`);
    } catch (error) { setEditError(error.response?.data?.error || 'Không đổi được tên bộ quyền.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true); setDeleteError('');
    try {
      await api.delete('/permissions', { data: { role } });
      setRoles((current) => current.filter((item) => item.role !== role));
      const fallback = roles.find((item) => item.role === 'manager');
      setRole(fallback.role);
      setDraft(structuredClone(fallback.permissions));
      setDeleteOpen(false);
      setMessage(`Đã xóa bộ quyền ${selected.label}.`);
    } catch (error) { setDeleteError(error.response?.data?.error || 'Không xóa được bộ quyền.'); }
    finally { setSaving(false); }
  };
  return <Layout title="Phân quyền" subtitle="Quản lý quyền theo vai trò. Mọi người cùng vai trò dùng chung bộ quyền.">
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="bg-paper-raised rounded-lg border border-line p-3">
        <div className="flex items-center justify-between gap-2 px-3 py-2"><h2 className="text-sm font-semibold">Bộ phân quyền</h2><button onClick={() => { setCreateError(''); setCreateOpen(true); }} className="p-1.5 rounded text-teal hover:bg-paper focus-ring" aria-label="Thêm bộ phân quyền" title="Thêm bộ phân quyền"><Plus size={18} /></button></div>
        {roles.map((item) => <button key={item.role} onClick={() => { setRole(item.role); setDraft(structuredClone(item.permissions)); setMessage(''); }} className={`w-full text-left px-3 py-3 rounded-md text-sm ${role === item.role ? 'bg-teal text-white' : 'hover:bg-paper'}`}>
          <span className="font-medium">{item.label}</span>{item.role === 'admin' && <span className="block text-xs opacity-70">Tài khoản hệ thống · cố định</span>}
        </button>)}
      </div>
      <div className="bg-paper-raised rounded-lg border border-line p-5">
        {selected ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h2 className="font-semibold">{selected.label}</h2><p className="text-xs text-slate">Thay đổi áp dụng cho tất cả tài khoản mang vai trò này ngay sau khi lưu.</p></div>
            <div className="flex items-center gap-2">
              {role.startsWith('custom_') && <><button onClick={() => { setEditName(selected.label); setEditError(''); setEditOpen(true); }} className="p-2 text-slate hover:text-teal rounded-md focus-ring" aria-label={`Sửa tên ${selected.label}`} title="Sửa tên"><Pencil size={17} /></button><button onClick={() => { setDeleteError(''); setDeleteOpen(true); }} className="p-2 text-slate hover:text-clay rounded-md focus-ring" aria-label={`Xóa ${selected.label}`} title="Xóa bộ quyền"><Trash2 size={17} /></button></>}
              {role !== 'admin' && <button onClick={save} disabled={saving} className="bg-teal hover:bg-teal-dark disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">{saving ? 'Đang lưu...' : 'Lưu bộ quyền'}</button>}
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="py-3">Mục</th><th className="py-3 text-center">Được xem</th><th className="py-3 text-center">Được quản lý</th></tr></thead><tbody>{MODULES.map(([key, label]) => <tr key={key} className="border-b border-line last:border-0"><td className="py-3">{label}</td>{key === 'organization' ? <td colSpan={2} className="py-3 text-center"><select aria-label="Phạm vi xem sơ đồ tổ chức" value={draft.organization?.scope || 'none'} disabled={role === 'admin'} onChange={(event) => setDraft((current) => ({ ...current, organization: { ...current.organization, scope: event.target.value, view: event.target.value !== 'none', manage: false } }))} className="w-full max-w-xs rounded-md border border-line bg-white px-3 py-2 text-sm disabled:bg-paper"><option value="none">Không được xem</option><option value="department">Chỉ phòng ban của mình</option><option value="full">Toàn công ty</option></select></td> : ['view', 'manage'].map((action) => <td key={action} className="py-3 text-center"><input type="checkbox" checked={Boolean(draft[key]?.[action])} onChange={() => toggle(key, action)} disabled={role === 'admin' || (action === 'manage' && (role === 'employee' || key === 'dashboard'))} aria-label={`${action === 'view' ? 'Xem' : 'Quản lý'} ${label}`} className="accent-teal h-4 w-4" /></td>)}</tr>)}</tbody></table></div>
        </> : <p className="text-sm text-slate">Đang tải bộ quyền...</p>}
        {message && <p role="status" className="text-sm mt-4 text-teal">{message}</p>}
      </div>
    </div>
    {createOpen && <Modal title="Thêm bộ phân quyền" onClose={() => setCreateOpen(false)}>
      <form onSubmit={create} className="space-y-4">
        <div><label htmlFor="role-name" className="block text-sm font-medium mb-1">Tên bộ phân quyền</label><input id="role-name" autoFocus required minLength={2} maxLength={60} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ví dụ: Trưởng nhóm" className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm focus-ring" /></div>
        <p className="text-xs text-slate">Sau khi tạo, chọn quyền xem và quản lý cho vai trò mới.</p>
        {createError && <p role="alert" className="text-sm text-clay">{createError}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm rounded-md border border-line">Hủy</button><button disabled={saving} type="submit" className="px-4 py-2 text-sm rounded-md bg-teal text-white disabled:opacity-50">{saving ? 'Đang tạo...' : 'Tạo bộ quyền'}</button></div>
      </form>
    </Modal>}
    {editOpen && <Modal title="Sửa tên bộ phân quyền" onClose={() => setEditOpen(false)}>
      <form onSubmit={rename} className="space-y-4">
        <div><label htmlFor="edit-role-name" className="block text-sm font-medium mb-1">Tên bộ phân quyền</label><input id="edit-role-name" autoFocus required minLength={2} maxLength={60} value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm focus-ring" /></div>
        {editError && <p role="alert" className="text-sm text-clay">{editError}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm rounded-md border border-line">Hủy</button><button disabled={saving} type="submit" className="px-4 py-2 text-sm rounded-md bg-teal text-white disabled:opacity-50">Lưu tên</button></div>
      </form>
    </Modal>}
    {deleteOpen && <Modal title="Xóa bộ phân quyền" onClose={() => setDeleteOpen(false)}>
      <p className="text-sm text-ink">Xóa bộ quyền <strong>{selected?.label}</strong>? Thao tác này chỉ thực hiện được khi chưa có nhân viên sử dụng.</p>
      {deleteError && <p role="alert" className="text-sm text-clay mt-3">{deleteError}</p>}
      <div className="flex justify-end gap-2 mt-5"><button onClick={() => setDeleteOpen(false)} className="px-4 py-2 text-sm rounded-md border border-line">Hủy</button><button disabled={saving} onClick={remove} className="px-4 py-2 text-sm rounded-md bg-clay text-white disabled:opacity-50">Xóa bộ quyền</button></div>
    </Modal>}
  </Layout>;
}
export default function Page() {
  const { user } = useAuth();
  return <ProtectedRoute>{user?.role === 'admin' ? <Content /> : null}</ProtectedRoute>;
}
