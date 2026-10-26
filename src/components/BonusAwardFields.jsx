'use client';
import { awardBreakdown } from '@/lib/governance-validation';
import { vnd } from '@/lib/governance-config';

function MoneyInput({label,value,onChange}) {
  return <label className="min-w-0 text-sm font-medium">{label} <span className="required-mark">*</span><input type="text" inputMode="numeric" pattern="[0-9]{1,18}" maxLength={18} required value={value??''} onChange={event=>onChange(event.target.value.replace(/\D/g,''))} className="ui-field mt-1"/><span className="mt-1 block text-xs font-normal text-slate">{value!==''&&value!=null?vnd(value):'Nhập số nguyên VND'}</span></label>;
}
export default function BonusAwardFields({form,setForm,options,editing}) {
  const policy=options.policies?.find(item=>Number(item.id)===Number(form.policy_id));
  const legacy=editing?.award_scope==='legacy';
  const department=!legacy&&policy?.calculation==='manual';
  const fixed=policy&&policy.calculation!=='percentage';
  const percentage=policy&&policy.calculation!=='manual';
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  let breakdown=null;
  if(policy&&(!fixed||form.fixed_amount!==''&&form.fixed_amount!=null)&&(!percentage||form.basis_amount!==''&&form.basis_amount!=null)){
    try{breakdown=awardBreakdown(policy,form);}catch{/* Server validation provides the error on save. */}
  }
  const select=(key,label,choices,onChange=value=>update(key,value))=><label className="min-w-0 text-sm font-medium">{label} <span className="required-mark">*</span><select required value={form[key]||''} onChange={event=>onChange(event.target.value)} className="ui-field mt-1"><option value="">Chọn…</option>{choices?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  const policies=options.policies?.filter(item=>legacy||item.calculation!=='combined');
  const departments=options.departments?.filter(item=>!policy?.department_id||Number(item.id)===Number(policy.department_id));
  const employees=options.employees?.filter(item=>legacy||!policy?.department_id||Number(item.department_id)===Number(policy.department_id));
  return <div className="space-y-4">
    <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Thông tin thưởng</legend>
      <label className="text-sm font-medium sm:col-span-2">Nội dung thưởng <span className="required-mark">*</span><input className="ui-field mt-1" required value={form.name||''} onChange={event=>update('name',event.target.value)}/></label>
      {select('project_id','Dự án',options.projects)}
      {select('policy_id','Chính sách đã duyệt',policies,value=>{
        const next=policies?.find(item=>String(item.id)===value);
        setForm(current=>({...current,policy_id:value,department_id:next?.department_id||'',employee_id:'',fixed_amount:next?.calculation==='percentage'?'0':'',basis_amount:next?.calculation==='manual'?'0':''}));
      })}
      {policy&&(department?select('department_id','Phòng ban nhận tổng thưởng',departments):select('employee_id','Nhân sự nhận thưởng',employees))}
      {!policies?.length&&<p className="text-sm text-slate sm:col-span-2">Chưa có chính sách đã duyệt phù hợp. Tạo và duyệt chính sách ở phần bên dưới trước.</p>}
    </fieldset>
    {policy&&<fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Giá trị thưởng</legend>
      <p className="rounded-lg bg-paper p-3 text-sm leading-6 sm:col-span-2">{department?'Ghi tổng tiền thưởng của phòng ban, không chia hoặc cộng vào từng nhân sự.':legacy?'Khoản thưởng cũ được giữ nguyên cách tính.':'Thưởng riêng cho nhân sự theo phần trăm, không bao gồm tổng thưởng phòng ban.'}{percentage&&<><br/>Tỷ lệ đã duyệt: <strong>{Number(policy.rate).toLocaleString('vi-VN',{maximumFractionDigits:4})}%</strong></>}<span className="mt-1 block text-xs text-slate">{policy.conditions}</span></p>
      {fixed&&<MoneyInput label={department?'Tổng tiền thưởng phòng ban (VND)':'Tiền cố định cũ (VND)'} value={form.fixed_amount} onChange={value=>update('fixed_amount',value)}/>}
      {percentage&&<MoneyInput label="Giá trị làm căn cứ tính % (VND)" value={form.basis_amount} onChange={value=>update('basis_amount',value)}/>}
      {breakdown&&<div className="rounded-xl bg-[#edf3fb] p-4 sm:col-span-2"><span className="text-sm text-slate">{department?'Tổng thưởng phòng ban':'Thưởng nhân sự đề xuất'}</span><strong className="mt-1 block text-lg text-teal">{vnd(breakdown.amount)}</strong></div>}
    </fieldset>}
    <label className="block text-sm font-medium">Căn cứ đánh giá / ghi chú <span className="required-mark">*</span><textarea className="ui-field mt-1" required rows={3} value={form.notes||''} onChange={event=>update('notes',event.target.value)}/></label>
  </div>;
}
