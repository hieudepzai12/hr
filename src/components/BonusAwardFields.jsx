'use client';
import { vnd } from '@/lib/governance-config';
export default function BonusAwardFields({form,setForm,options,editing}) {
  const update=(key,value)=>setForm(current=>({...current,[key]:value,employee_id:null,award_scope:'department',basis_amount:'0'}));
  return <div className="grid gap-4 sm:grid-cols-2">
    {editing?.award_scope && editing.award_scope!=='department'&&<p className="ui-notice sm:col-span-2">Khoản thưởng cũ: lưu thay đổi sẽ chuyển thành thưởng phòng ban với số tiền nhập bên dưới.</p>}
    <label className="text-sm font-medium sm:col-span-2">Nội dung thưởng <span className="required-mark">*</span><input required value={form.name||''} onChange={event=>update('name',event.target.value)} className="ui-field mt-1"/></label>
    {['project_id','department_id'].map(key=><label key={key} className="min-w-0 text-sm font-medium">{key==='project_id'?'Dự án':'Phòng ban nhận thưởng'} <span className="required-mark">*</span><select required value={form[key]||''} onChange={event=>update(key,event.target.value)} className="ui-field mt-1"><option value="">Chọn…</option>{options[key==='project_id'?'projects':'departments']?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
    <label className="text-sm font-medium sm:col-span-2">Số tiền thưởng (VND) <span className="required-mark">*</span><input required type="text" inputMode="numeric" pattern="[0-9]{1,18}" maxLength={18} value={form.amount??''} onChange={event=>update('amount',event.target.value.replace(/\D/g,''))} className="ui-field mt-1"/>{form.amount&&/^\d{1,18}$/.test(String(form.amount))&&<span className="mt-1 block text-sm font-semibold text-teal">{vnd(form.amount)}</span>}</label>
    <label className="text-sm font-medium sm:col-span-2">Ghi chú<textarea rows={3} value={form.notes||''} onChange={event=>update('notes',event.target.value)} className="ui-field mt-1"/></label>
  </div>;
}
