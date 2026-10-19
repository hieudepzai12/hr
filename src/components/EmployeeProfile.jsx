'use client';
import {useEffect,useState} from 'react';
import api from '@/lib/api';
import Modal from './Modal';
import Avatar from './Avatar';

const dateText=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Chưa cập nhật';
export default function EmployeeProfile({id,onClose,roles=[]}){
 const [profile,setProfile]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get(`/profiles/${id}`).then(({data})=>{if(active)setProfile(data);}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được hồ sơ nhân viên.');});return()=>{active=false;};},[id]);
 return <Modal title="Hồ sơ nhân viên" onClose={onClose} width="max-w-2xl">
  {error?<p role="alert" className="ui-notice">{error}</p>:!profile?<p role="status" className="py-8 text-center text-sm text-slate">Đang tải hồ sơ...</p>:<div className="space-y-5">
   <div className="flex min-w-0 items-center gap-3"><Avatar name={profile.full_name} color={profile.avatar_color} avatarPath={profile.avatar_path} size={56}/><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{profile.full_name}</h3><p className="break-all text-sm text-slate">{profile.email}</p></div></div>
   <section><h3 className="mb-3 font-semibold">Thông tin chung</h3><dl className="grid gap-4 text-sm sm:grid-cols-2">{[
    ['Chức vụ',profile.position],['Phòng ban',profile.department_name],['Quản lý trực tiếp',profile.manager_name||(!profile.manager_id?'Chưa gán':'Ngoài phạm vi được xem')],
    ['Vai trò phần mềm',profile.role_label||roles.find(r=>r.role===profile.role)?.label||profile.role],['Số điện thoại',profile.phone],['Ngày vào làm',dateText(profile.join_date)],['Trạng thái',profile.status==='active'?'Đang làm việc':'Đã nghỉ'],
   ].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate">{label}</dt><dd className="mt-1 break-words">{value||'Chưa cập nhật'}</dd></div>)}</dl></section>
   <section className="border-t border-line pt-4"><h3 className="mb-3 font-semibold">Chức danh &amp; Nhiệm vụ được phân công</h3>
    {profile.assignments===null?<p className="text-sm text-slate">Bạn chưa được cấp quyền xem chức danh và nhiệm vụ.</p>:!profile.assignments?.length?<p className="text-sm text-slate">Chưa có phân công vị trí đang hiệu lực trong phạm vi được xem. Chức vụ nhập trong hồ sơ chưa tự liên kết với danh mục Chức danh &amp; Nhiệm vụ.</p>:profile.assignments.map(a=><article key={a.id} className="mb-3 rounded-lg border border-line p-4 text-sm"><h4 className="font-semibold">{a.name}</h4><p className="mt-1 text-xs text-slate">{dateText(a.start_date)} — {a.end_date?dateText(a.end_date):'Đang đảm nhiệm'} · {a.verification_status==='verified'?'Đã xác minh':'Cần xác minh'}</p><p className="mt-3 whitespace-pre-wrap break-words">{a.responsibilities||'Chưa cập nhật nhiệm vụ'}</p>{a.requirements&&<div className="mt-3"><h5 className="font-medium">Yêu cầu / quyền hạn</h5><p className="mt-1 whitespace-pre-wrap break-words">{a.requirements}</p></div>}</article>)}
   </section>
  </div>}
  <div className="mt-5 flex justify-end border-t border-line pt-3"><button type="button" onClick={onClose} className="ui-button">Đóng</button></div>
 </Modal>;
}
