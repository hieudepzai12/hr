'use client';
import { confirmAction } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { scopeFor } from '@/lib/access';

const empty = { code: '', name: '', short_name: '', customer_group: '', owner_id: '', department_id: '', status: 'active', notes: '' };

function CustomersContent() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [error,setError]=useFeedback('error');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice,setNotice]=useFeedback('success');
  const load = () => { setLoading(true); return api.get('/customers').then(({ data }) => { setRows(data); setError(''); }).catch((err) => setError(err.response?.data?.error || 'Không tải được khách hàng')).finally(() => setLoading(false)); };
  useEffect(() => {
    api.get('/customers').then(({ data }) => { setRows(data); setError(''); }).catch((err) => setError(err.response?.data?.error || 'Không tải được khách hàng')).finally(() => setLoading(false));
    api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
  }, [setError]);
  const open = (item = null) => {
    setEditing(item || {});
    setForm(item ? { ...item, owner_id: item.owner_id || '', department_id: item.department_id || '' } : { ...empty, owner_id: user.id, department_id: user.department_id || '' });
    setError('');
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (editing.id) await api.put(`/customers/${editing.id}`, form);
      else await api.post('/customers', form);
      setEditing(null);
      load();
      setNotice(editing.id ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng');
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được khách hàng'); }
    finally { setSaving(false); }
  };
  const deactivate = async (item) => {
    if (!await confirmAction(`Ngừng sử dụng khách hàng ${item.name}?`)) return;
    try { await api.delete(`/customers/${item.id}`); load(); setNotice('Đã ngừng hoạt động khách hàng.'); }
    catch (err) { setError(err.response?.data?.error || 'Không thể ngừng sử dụng khách hàng'); }
  };
  const visible = rows.filter((item) => (!status || item.status === status) && `${item.code} ${item.name} ${item.customer_group || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <Layout title="Danh mục khách hàng" subtitle="Dùng chung cho công việc và báo cáo"
    actions={scopeFor(user, 'customers', 'create') !== 'none' && <button onClick={() => open()} className="ui-button ui-button-primary">Thêm khách hàng</button>}>
    <div className="ui-card mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_200px]"><input aria-label="Tìm khách hàng" placeholder="Tìm theo mã, tên hoặc nhóm" value={search} onChange={(event) => setSearch(event.target.value)} className="ui-field" /><select aria-label="Trạng thái khách hàng" value={status} onChange={(event) => setStatus(event.target.value)} className="ui-field"><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></div>
    {error && <p role="alert" className="ui-notice mb-3">{error}</p>}
    {loading ? <div role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải khách hàng...</div> : !visible.length ? <div className="ui-card ui-empty">Chưa có khách hàng phù hợp với bộ lọc.</div> : <div className="ui-card overflow-x-auto"><table className="ui-table min-w-[800px]"><thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Nhóm</th><th>Phụ trách</th><th>Phòng ban</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td className="font-semibold">{item.code}</td><td className="font-semibold text-ink">{item.name}</td><td>{item.customer_group || '—'}</td><td>{item.owner_name || '—'}</td><td>{item.department_name || '—'}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'active' ? 'bg-[#e8f5ed] text-[#17623a]' : 'bg-paper text-slate'}`}>{item.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span></td><td><div className="flex gap-3">{scopeFor(user, 'customers', 'edit') !== 'none' && <button onClick={() => open(item)} className="font-semibold text-teal hover:underline">Sửa</button>}{item.status === 'active' && scopeFor(user, 'customers', 'delete') !== 'none' && <button onClick={() => deactivate(item)} className="font-semibold text-clay hover:underline">Ngừng</button>}</div></td></tr>)}</tbody></table></div>}
    {editing && <Modal title={editing.id ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={() => setEditing(null)} width="max-w-3xl"><form onSubmit={save} className="space-y-5">
      <section><h3 className="mb-3 font-semibold">Thông tin chung</h3><div className="grid gap-3 sm:grid-cols-2">{[['code', 'Mã khách hàng'], ['name', 'Tên chính thức'], ['short_name', 'Tên viết tắt'], ['customer_group', 'Nhóm khách hàng']].map(([key, label]) => <label key={key} className="block text-sm font-medium">{label} {(key === 'code' || key === 'name') && <span className="text-clay">*</span>}<input required={key === 'code' || key === 'name'} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="ui-field mt-1" /></label>)}</div></section>
      <section><h3 className="mb-3 font-semibold">Phân công</h3><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Phòng phụ trách<select value={form.department_id || ''} onChange={(event) => setForm({ ...form, department_id: event.target.value })} className="ui-field mt-1"><option value="">Chưa chọn</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="block text-sm font-medium">Người phụ trách<select value={form.owner_id || ''} onChange={(event) => setForm({ ...form, owner_id: event.target.value })} className="ui-field mt-1"><option value="">Chưa chọn</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label></div></section>
      <section><h3 className="mb-3 font-semibold">Trạng thái và ghi chú</h3><label className="block text-sm font-medium">Trạng thái<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="ui-field mt-1"><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label><label className="mt-3 block text-sm font-medium">Ghi chú<textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="ui-field mt-1" /></label></section>
      {error && <p role="alert" className="ui-notice">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-3"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : 'Lưu khách hàng'}</button></div>
    </form></Modal>}
  </Layout>;
}

export default function CustomersPage() { return <ProtectedRoute permission="customers"><CustomersContent /></ProtectedRoute>; }
