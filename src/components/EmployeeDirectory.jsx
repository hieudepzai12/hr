'use client';
import { confirmAction, notify } from '@/lib/feedback';
import { useRouter } from 'next/navigation';
import useFeedback, { useFeedbackEffect } from '@/lib/useFeedback';
import Pagination from '@/components/Pagination';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Search, Pencil, UserX, Loader2, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import PasswordDialog from '@/components/PasswordDialog';
import Link from 'next/link';
import { scopeFor } from '@/lib/access';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import EmployeeFormFields from '@/components/EmployeeFormFields';
import {jobTitles} from '@/lib/employee-job-titles';

const ROLE_LABEL = { admin: 'Quản trị viên', director: 'Giám đốc', manager: 'Quản lý', employee: 'Nhân viên' };

export default function EmployeeDirectory({ accountsOnly = false }) {
  const { can, user, logout } = useAuth();
  const router = useRouter();
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
  useFeedbackEffect(listError);
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
  const [error,setError]=useFeedback('error');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const employeeFormId = useId();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [,setNotice]=useFeedback('success');
  const avatarFileRef = useRef(null);

  useEffect(() => { api.get('/departments', { params: { options: 1 } }).then(({ data }) => setDepartments(data)).catch(() => setError('Không tải được danh sách phòng ban.')); }, [setError]);
  useEffect(() => { api.get('/roles').then(({ data }) => setRoles(data)).catch(() => setError('Không tải được danh sách vai trò.')); }, [setError]);
  useEffect(() => {
    api.get('/employees', { params: { status: 'active', fields: 'options' } }).then(({ data }) => setManagerOptions(data)).catch(() => setError('Không tải được danh sách quản lý.'));
  }, [setError]);

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
    if (!await confirmAction('Ngừng hoạt động tài khoản này?')) return;
    try {
      await api.delete(`/employees/${id}`);
      load();
      setNotice('Đã ngừng hoạt động tài khoản.');
      api.get('/employees', { params: { status: 'active', fields: 'options' } }).then(({ data }) => setManagerOptions(data)).catch(() => setError('Không tải được danh sách quản lý.'));
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

  const profileScope = scopeFor(user, 'profiles', 'view');
  const canViewProfile = emp => profileScope === 'all' || (profileScope === 'self' && Number(emp.id) === Number(user.id)) || (profileScope === 'department' && user.department_id != null && Number(emp.department_id) === Number(user.department_id));
  const employeeName = emp => canViewProfile(emp)
    ? <Link href={`/nhan-vien/${emp.id}`} aria-label={`Xem thông tin ${emp.full_name}`} className="inline-block rounded text-left text-teal hover:underline focus-ring"><strong className="break-words">{emp.full_name}</strong></Link>
    : <strong className="break-words text-ink">{emp.full_name}</strong>;
  const employeeActions = (emp) => accountsOnly ? <div className="flex flex-wrap items-center gap-2">
    {user?.role === 'admin' && emp.id === user.id && <button type="button" onClick={()=>setPasswordTarget(emp)} className="ui-button ui-button-secondary focus-ring" title="Đổi mật khẩu Admin"><KeyRound size={15} />Đổi mật khẩu Admin</button>}
    {user?.role === 'admin' && emp.id !== user.id && <button onClick={() => setPasswordTarget(emp)} className="ui-button ui-button-secondary focus-ring" aria-label={`Đặt lại mật khẩu cho ${emp.full_name}`} title="Đặt lại mật khẩu"><KeyRound size={15} /><span className="ml-1 text-sm">Đặt lại mật khẩu</span></button>}
    {isManager && emp.role !== 'admin' && emp.status === 'active' && <button onClick={() => deactivate(emp.id)} className="ui-button ui-button-secondary focus-ring" style={{color:'var(--color-clay)'}} aria-label={`Ngừng hoạt động ${emp.full_name}`}><UserX size={15} />Ngừng hoạt động</button>}
  </div> : <div className="flex flex-wrap items-center justify-end gap-1">
    {isManager && (user?.role === 'admin' || emp.role !== 'admin') && <button onClick={() => openEdit(emp)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" aria-label={`Sửa ${emp.full_name}`}><Pencil size={15} /></button>}
  </div>;

  return (
    <Layout
      title={accountsOnly ? 'Tài khoản' : 'Nhân viên'}
      subtitle={loading?'Đang tải danh sách...':`${total} ${accountsOnly ? 'tài khoản' : 'nhân viên'} · Trang ${page}/${pageCount}`}
      actions={accountsOnly && isManager && <button onClick={openCreate} className="flex items-center gap-1.5 bg-teal hover:bg-teal-dark text-white text-sm font-medium px-4 py-2 rounded-md transition-colors focus-ring">
          <Plus size={16} /> Tạo tài khoản
        </button>}
    >
      {!modalOpen && error && <div role="alert" className="mb-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}
      {listError && <div role="alert" className="mb-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{listError}</div>}

      {!accountsOnly&&isManager&&<div className="ui-notice mb-4 text-sm">Để cập nhật sơ đồ, sửa Chức vụ, Phòng ban và Quản lý trực tiếp của nhân viên. Vai trò chỉ dùng phân quyền phần mềm; sơ đồ không tự lấy vai trò làm chức vụ.</div>}
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

      {loading?<p role="status" className="ui-card ui-empty">Đang tải danh sách nhân viên...</p>:listError?<button type="button" onClick={load} className="ui-button">Thử lại</button>:!employees.length?<p className="ui-card ui-empty">Không có kết quả phù hợp.</p>:accountsOnly?<div className="ui-card max-w-full overflow-x-auto"><table className="ui-table min-w-[720px]"><thead><tr><th>Nhân viên</th><th>Email đăng nhập</th><th>Vai trò</th><th>Phòng ban</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{employees.map(emp=><tr key={emp.id}><td className="font-semibold">{employeeName(emp)}</td><td className="break-all">{emp.email}</td><td>{roles.find(role=>role.role===emp.role)?.label || ROLE_LABEL[emp.role] || emp.role}</td><td>{emp.department_name || '—'}</td><td><span className={emp.status === 'active' ? 'text-green-800' : 'text-slate'}>{emp.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span></td><td>{employeeActions(emp)}</td></tr>)}</tbody></table></div>:<>
      <div className="space-y-3 md:hidden">
        {employees.map((emp) => <article key={emp.id} className="min-w-0 rounded-lg border border-line bg-paper-raised p-4 text-sm">
          <div className="flex min-w-0 items-center gap-3 border-b border-line pb-3">
            <Avatar name={emp.full_name} color={emp.avatar_color} avatarPath={emp.avatar_path} size={32} />
            <div className="min-w-0"><div>{employeeName(emp)}</div><div className="break-all text-xs text-slate">{emp.email}</div></div>
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
                      <div>{employeeName(emp)}</div>
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
      <Pagination page={page} pageSize={pageSize} total={total} loading={loading} error={listError} onPageChange={page => setPagination(current => ({...current,page}))} onPageSizeChange={pageSize => setPagination({page:1,pageSize})} />

      {modalOpen && (
        <Modal width="max-w-5xl" title={editing ? 'Chỉnh sửa nhân viên' : 'Tạo tài khoản nhân viên'} onClose={() => { if (!saveLock.current) setModalOpen(false); }}>
          <form id={employeeFormId} onSubmit={submit} onInvalidCapture={(event) => setError(event.target.validationMessage || 'Vui lòng kiểm tra thông tin chưa hợp lệ.')} aria-busy={saving} className="space-y-5">
            <EmployeeFormFields form={form} setForm={setForm} editing={editing} user={user} roles={roles} departments={departments} managerOptions={managerOptions} saving={saving} avatarUploading={avatarUploading} avatarFileRef={avatarFileRef} uploadAvatar={uploadAvatar}/>

            {error && <div role="alert" className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            <div className="sticky -bottom-4 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 pb-4 pt-3 sm:-bottom-5 sm:-mx-6 sm:px-6 sm:pb-5">
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md text-sm text-slate hover:text-ink transition-colors focus-ring disabled:opacity-50">
                Huỷ
              </button>
              <button type="submit" form={employeeFormId} disabled={saving || avatarUploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-teal hover:bg-teal-dark text-white transition-colors focus-ring disabled:opacity-50">
                {saving && <Loader2 size={15} className="animate-spin" />}{saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {passwordTarget && <PasswordDialog employee={passwordTarget.id===user.id?undefined:passwordTarget} onClose={()=>setPasswordTarget(null)} onSaved={()=>{
        if(passwordTarget.id===user.id){void notify('Đã đổi mật khẩu Admin. Vui lòng đăng nhập lại.');logout();router.replace('/login');}
        else setNotice(`Đã đặt lại mật khẩu cho ${passwordTarget.full_name}.`);
      }} />}
    </Layout>
  );
}
