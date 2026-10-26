'use client';

import MonthInput from './MonthInput';
import { vnd } from '@/lib/governance-config';

export default function SalaryBudgetFields({ form, setForm, departments=[] }) {
  const selected=Array.isArray(form.department_ids)?form.department_ids.map(Number):[];
  const update=(key,value)=>setForm(current=>({...current,[key]:value,budget_mode:'aggregate'}));
  const toggle=(id,checked)=>{
    const ids=checked?[...selected,id]:selected.filter(value=>value!==id);
    const oldName=departments.filter(item=>selected.includes(Number(item.id))).map(item=>item.name).join(' + ');
    const newName=departments.filter(item=>ids.includes(Number(item.id))).map(item=>item.name).join(' + ');
    setForm(current=>({...current,department_ids:ids,budget_mode:'aggregate',name:!current.name||current.name===oldName?newName:current.name}));
  };
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium">Bộ phận <span className="required-mark">*</span><input className="ui-field mt-1" required maxLength={300} value={form.name||''} onChange={e=>update('name',e.target.value)} placeholder="Ví dụ: Tài chính + Kinh doanh" /></label>
    <MonthInput label="Tháng ngân sách" required value={form.month||''} onChange={value=>update('month',value)}/>
    <fieldset className="rounded-xl border border-line p-4 sm:col-span-2"><legend className="px-1 text-sm font-semibold">Phòng ban thuộc dòng ngân sách</legend><p className="mb-3 text-xs text-slate">Chọn ít nhất một phòng ban. Có thể chọn nhiều phòng để gộp quỹ lương.</p>
      <div className="grid gap-2 sm:grid-cols-2">{departments.map((item,index)=><label key={item.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(Number(item.id))} required={selected.length===0&&index===0} onChange={e=>toggle(Number(item.id),e.target.checked)}/><span>{item.name}</span></label>)}</div>
    </fieldset>
    <label className="text-sm font-medium">Số lượng<input className="ui-field mt-1" type="number" min="0" max="2147483647" step="1" value={form.headcount??''} onChange={e=>update('headcount',e.target.value)} placeholder="Không bắt buộc"/></label>
    <label className="text-sm font-medium">Quỹ lương (VND) <span className="required-mark">*</span><input className="ui-field mt-1" type="text" inputMode="numeric" required pattern="[0-9]{1,18}" maxLength={18} value={form.total_amount??''} onChange={e=>update('total_amount',e.target.value.replace(/\D/g,''))} placeholder="Nhập tổng tiền, ví dụ 176000000"/><span className="mt-1 block text-xs font-normal text-slate">{form.total_amount!==''&&form.total_amount!=null?vnd(form.total_amount):'Nhập tổng quỹ lương của dòng này; không nhân thêm số lượng.'}</span></label>
    <label className="text-sm font-medium sm:col-span-2">Ghi chú<textarea className="ui-field mt-1" rows={3} maxLength={20000} value={form.notes||''} onChange={e=>update('notes',e.target.value)}/></label>
    <label className="text-sm font-medium sm:col-span-2">Nguồn / căn cứ (nếu có)<input className="ui-field mt-1" value={form.source_reference||''} onChange={e=>update('source_reference',e.target.value)}/></label>
  </div>;
}
