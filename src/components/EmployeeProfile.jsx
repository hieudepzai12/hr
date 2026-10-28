'use client';
import useFeedback from '@/lib/useFeedback';
import {useEffect,useState} from 'react';
import api from '@/lib/api';
import Modal from './Modal';
import Avatar from './Avatar';

const dateText=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Chưa cập nhật';
export default function EmployeeProfile({id,onClose,roles=[],inline=false,showIdentity=!inline}){
 const [profile,setProfile]=useState(null),[error,setError]=useFeedback('error');
 useEffect(()=>{let active=true;api.get(`/profiles/${id}`).then(({data})=>{if(active)setProfile(data);}).catch(e=>{if(active)setError(e.response?.data?.error||'Không tải được hồ sơ nhân viên.');});return()=>{active=false;};},[id,setError]);
 const content = <>
  {error?<p role="alert" className="ui-notice">{error}</p>:!profile?<p role="status" className="py-8 text-center text-sm text-slate">Đang tải hồ sơ...</p>:<div className="space-y-5">
   {showIdentity&&<div className="flex min-w-0 items-center gap-3"><Avatar name={profile.full_name} color={profile.avatar_color} avatarPath={profile.avatar_path} size={56}/><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{profile.full_name}</h3><p className="break-all text-sm text-slate">{profile.email}</p></div></div>}
   <section><h3 className="mb-3 font-semibold">Thông tin chung</h3><dl className="grid gap-4 text-sm sm:grid-cols-2">{[
    ['Mã nhân viên',profile.id],['Chức vụ',profile.position],['Phòng ban',profile.department_name],['Quản lý trực tiếp',profile.manager_name||(!profile.manager_id?'Chưa gán':'Ngoài phạm vi được xem')],
    ['Vai trò phần mềm',profile.role_label||roles.find(r=>r.role===profile.role)?.label||profile.role],['Số điện thoại',profile.phone],['Ngày vào làm',dateText(profile.join_date)],['Trạng thái',profile.status==='active'?'Đang làm việc':'Đã nghỉ'],
   ].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate">{label}</dt><dd className="mt-1 break-words">{value||'Chưa cập nhật'}</dd></div>)}</dl></section>
   <section className="border-t border-line pt-4"><h3 className="mb-3 font-semibold">Nhiệm vụ được phân công</h3>
    {profile.assignments===null?<p className="text-sm text-slate">Bạn chưa được cấp quyền xem phân công nhiệm vụ.</p>:!profile.assignments?.length?<p className="text-sm text-slate">Chưa có nhiệm vụ đang hiệu lực trong phạm vi được xem.</p>:profile.assignments.map(a=><article key={a.id} className="mb-3 rounded-lg border border-line p-4 text-sm"><h4 className="font-semibold">{a.duty_name||a.name}</h4><p className="mt-1 text-xs text-slate">{a.name} · {dateText(a.start_date)} — {a.end_date?dateText(a.end_date):'Đang đảm nhiệm'}</p><p className="mt-2 text-xs text-slate">{a.project_name||'Chưa liên kết dự án'}</p><p className="mt-3 whitespace-pre-wrap break-words">{a.responsibilities||'Chưa cập nhật nhiệm vụ'}</p>{a.requirements&&<div className="mt-3"><h5 className="font-medium">Yêu cầu / quyền hạn</h5><p className="mt-1 whitespace-pre-wrap break-words">{a.requirements}</p></div>}</article>)}
   </section>
  </div>}
 </>;
 return inline ? <section aria-label="Hồ sơ cá nhân">{content}</section> : <Modal title="Hồ sơ nhân viên" onClose={onClose} width="max-w-2xl">{content}<div className="mt-5 flex justify-end border-t border-line pt-3"><button type="button" onClick={onClose} className="ui-button">Đóng</button></div></Modal>;
}
