'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Search, Pencil, UserX, Loader2, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import EmployeeFormFields from '@/components/EmployeeFormFields';
import {jobTitles} from '@/lib/employee-job-titles';

const ROLE_LABEL = { admin: 'Quản trị viên', director: 'Giám đốc', manager: 'Quản lý', employee: 'Nhân viên' };

function EmployeesContent() {
  const { can, user } = useAuth();
  const isManager = can('employees', 'manage');
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [{page,pageSize},setPagination]=useState({page:1,pageSize:10});
  const [revision,setRevision]=useState(0);
  const [list,setList]=useState({key:'',items:[],total:0,error:''});
  const paramsKey=JSON.stringify({search:search||undefined,department_id:departmentFilter||undefined,limit:pageSize,offset:(page-1)*pageSize,include_total:'1'});
  const requestKey=`${paramsKey}:${revision}`;
  const loading=list.key!==requestKey;
  const employees=loading?[]:list.items;
  const listError=loading?'':list.error;
  const total=loading?0:list.total;
  const pageCount=Math.max(1,Math.ceil(total/pageSize));
  const load=()=>setRevision(value=>value+1);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const params=JSON.parse(paramsKey);
    api.get('/employees',{params,signal:controller.signal}).then(({data})=>{
      if(!active)return;
      const lastPage=Math.max(1,Math.ceil(data.total/params.limit));
      if(params.offset/params.limit+1>lastPage){setPagination(current=>({...current,page:lastPage}));return;}
      setList({key:requestKey,items:data.items,total:data.total,error:''});
    }).catch(error=>{
      if(active)setList({key:requestKey,items:[],total:0,error:error.response?.data?.error||'Không thể tải danh sách nhân viên.'});
    });
    return()=>{active=false;controller.abort();};
  },[paramsKey,requestKey]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const employeeFormId = useId();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const avatarFileRef = useRef(null);

  useEffect(() => { api.get('/departments').then(({ data }) => setDepartments(data)); }, []);
  useEffect(() => { api.get('/roles').then(({ data }) => setRoles(data)); }, []);
  useEffect(() => {
    api.get('/employees', { params: { status: 'active', fields: 'options' } }).then(({ data }) => setManagerOptions(data));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', email: '', password: '', role: 'employee', position_titles: [], department_id: '', manager_id: '', phone: '', join_date: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ ...emp, position_titles: jobTitles(emp.position), department_id: emp.department_id || '', manager_id: emp.manager_id || '' });
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
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const payload = {
        full_name: form.full_name?.trim(), position_titles: form.position_titles || [],
        department_id: form.department_id || null, manager_id: form.manager_id || null,
        phone: form.phone || null, role: form.role || editing?.role || 'employee',
        status: form.status || editing?.status || 'active', join_date: form.join_date || null,
      };
      if (editing) {
        await api.put(`/employees/${editing.id}`, payload, { timeout: 20000 });
      } else {
        await api.post('/employees', { ...payload, email: form.email?.trim(), password: form.password }, { timeout: 20000 });
      }
      setModalOpen(false);
      setNotice(editing ? 'Đã lưu thay đổi thông tin nhân viên.' : 'Đã thêm nhân viên.');
      load();
      api.get('/employees', { params: { status: 'active', fields: 'options' } }).then(({ data }) => setManagerOptions(data)).catch(() => setNotice('Đã lưu nhân viên. Vui lòng tải lại trang để cập nhật danh sách quản lý.'));
    } catch (err) {
      setError(err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'Chưa nhận được phản hồi lưu. Kiểm tra kết nối và tải lại danh sách trước khi thử lại.' : 'Không thể lưu nhân viên. Vui lòng thử lại.'));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Vô hiệu hoá nhân viên này?')) return;
    try {
      await api.delete(`/employees/${id}`);
      load();
      api.get('/employees', { params: { status: 'active', fields: 'options' } }).then(({ data }) => setManagerOptions(data));
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

  const employeeActions = (emp) => <div className="flex flex-wrap items-center justify-end gap-1">
    {isManager && (user?.role === 'admin' || emp.role !== 'admin') && <button onClick={() => openEdit(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label={`Sửa ${emp.full_name}`}><Pencil size={15} /></button>}
    {isManager && emp.role !== 'admin' && <button onClick={() => deactivate(emp.id)} className="p-1.5 text-slate hover:text-clay transition-colors focus-ring rounded" aria-label={`Vô hiệu hóa ${emp.full_name}`}><UserX size={15} /></button>}
    {user?.role === 'admin' && emp.id !== user.id && <button onClick={() => openPassword(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label={`Đặt lại mật khẩu cho ${emp.full_name}`} title="Đặt lại mật khẩu"><KeyRound size={15} /></button>}
    {emp.id === user.id && <button onClick={() => openPassword(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label="Đổi mật khẩu của tôi" title="Đổi mật khẩu"><KeyRound size={15} /></button>}
    {isManager && emp.role === 'admin' && <span className="px-2 text-xs text-slate">Tài khoản bảo vệ</span>}
  </div>;

  return (
    <Layout
      title="Nhân viên"
      subtitle={loading?'Đang tải danh sách...':`${total} nhân viên · Trang ${page}/${pageCount}`}
      actions={isManager && <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Thêm nhân viên
        </button>}
    >
      {!modalOpen && error && <div role="alert" className="mb-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}
      {listError && <div role="alert" className="mb-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{listError}</div>}
      {notice && <div role="status" className="mb-4 text-sm text-teal bg-[#DEE8D5] px-3 py-2 rounded-md">{notice}</div>}
      {isManager&&<div className="ui-notice mb-4 text-sm">Để cập nhật sơ đồ, sửa Chức vụ, Phòng ban và Quản lý trực tiếp của nhân viên. Vai trò chỉ dùng phân quyền phần mềm; sơ đồ không tự lấy vai trò làm chức vụ.</div>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
        <input
          value={search}
          onChange={(e) => {setSearch(e.target.value);setPagination(current=>({...current,page:1}));}}
          placeholder="Tìm theo tên hoặc email..."
          className="w-full pl-9 pr-3 py-2 rounded-md border border-line bg-paper-raised text-sm focus-ring focus:border-teal outline-none"
        />
      </div>
      <select aria-label="Lọc nhân viên theo phòng ban" value={departmentFilter} onChange={event=>{setDepartmentFilter(event.target.value);setPagination(current=>({...current,page:1}));}} className="ui-field min-w-0">
        <option value="">Tất cả phòng ban</option>
        {departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
      </div>

      {loading?<p role="status" className="ui-card ui-empty">Đang tải danh sách nhân viên...</p>:listError?<button type="button" onClick={load} className="ui-button">Thử lại</button>:!employees.length?<p className="ui-card ui-empty">Không có nhân viên phù hợp.</p>:<>
      <div className="space-y-3 md:hidden">
        {employees.map((emp) => <article key={emp.id} className="min-w-0 rounded-lg border border-line bg-paper-raised p-4 text-sm">
          <div className="flex min-w-0 items-center gap-3 border-b border-line pb-3">
            <Avatar name={emp.full_name} color={emp.avatar_color} avatarPath={emp.avatar_path} size={32} />
            <div className="min-w-0"><div className="break-words font-semibold text-ink">{emp.full_name}</div><div className="break-all text-xs text-slate">{emp.email}</div></div>
          </div>
          <dl className="space-y-2 py-3">
            <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate">Chức vụ</dt><dd className="min-w-0 break-words text-right text-ink">{emp.position || '—'}</dd></div>
            <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate">Phòng ban</dt><dd className="min-w-0 break-words text-right text-ink">{emp.department_name || '—'}</dd></div>
            <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate">Quản lý</dt><dd className="min-w-0 break-words text-right text-ink">{managerOptions.find((person) => person.id === emp.manager_id)?.full_name || '—'}</dd></div>
            <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate">Vai trò</dt><dd className="min-w-0 break-words text-right text-ink">{roles.find((item) => item.role === emp.role)?.label || ROLE_LABEL[emp.role] || emp.role}</dd></div>
            <div className="flex min-w-0 justify-between gap-3"><dt className="shrink-0 text-slate">Trạng thái</dt><dd className="text-right text-ink">{emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</dd></div>
          </dl>
          <div className="border-t border-line pt-2">{employeeActions(emp)}</div>
        </article>)}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-line bg-paper-raised md:block">
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
                <td className="px-5 py-3">{employeeActions(emp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">Số dòng<select aria-label="Số nhân viên mỗi trang" value={pageSize} onChange={e=>setPagination({page:1,pageSize:Number(e.target.value)})} className="rounded-md border border-line bg-white px-2 py-2">{[10,20,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>{!loading&&!listError&&<span className="text-slate">{total?(page-1)*pageSize+1:0}–{Math.min(page*pageSize,total)} / {total} nhân viên</span>}</div>
        <nav aria-label="Phân trang nhân viên" className="flex flex-wrap items-center gap-1">
          <button type="button" disabled={loading||page===1} onClick={()=>setPagination(current=>({...current,page:current.page-1}))} className="ui-button disabled:opacity-50">Trước</button>
          {Array.from({length:Math.min(5,pageCount)},(_,index)=>Math.max(1,Math.min(page-2,pageCount-4))+index).map(number=><button type="button" key={number} aria-label={`Trang ${number}`} aria-current={number===page?'page':undefined} disabled={loading} onClick={()=>setPagination(current=>({...current,page:number}))} className={`ui-button ${number===page?'ui-button-primary':'ui-button-secondary'}`}>{number}</button>)}
          <button type="button" disabled={loading||page>=pageCount||Boolean(listError)} onClick={()=>setPagination(current=>({...current,page:current.page+1}))} className="ui-button disabled:opacity-50">Sau</button>
        </nav>
      </div>


      {modalOpen && (
        <Modal width="max-w-5xl" title={editing ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên'} onClose={() => { if (!saveLock.current) setModalOpen(false); }}>
          <form id={employeeFormId} onSubmit={submit} onInvalidCapture={(event) => setError(event.target.validationMessage || 'Vui lòng kiểm tra thông tin chưa hợp lệ.')} aria-busy={saving} className="space-y-5">
            <EmployeeFormFields form={form} setForm={setForm} editing={editing} user={user} roles={roles} departments={departments} managerOptions={managerOptions} saving={saving} avatarUploading={avatarUploading} avatarFileRef={avatarFileRef} uploadAvatar={uploadAvatar}/>

            {error && <div role="alert" className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="sticky -bottom-4 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 pb-4 pt-3 sm:-bottom-5 sm:-mx-6 sm:px-6 sm:pb-5">
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring disabled:opacity-50">
                Huỷ
              </button>
              <button type="submit" form={employeeFormId} disabled={saving || avatarUploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring disabled:opacity-50">
                {saving && <Loader2 size={15} className="animate-spin" />}{saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Thêm nhân viên'}
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
