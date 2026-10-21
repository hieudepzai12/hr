'use client';
import {useId,useState} from 'react';

export default function MonthInput({label,value='',onChange,required=false}){
 const id=useId();
 const parts=value=>({value,month:value.slice(5,7),year:value.slice(0,4)||String(new Date().getFullYear())});
 const [draft,setDraft]=useState(()=>parts(value));
 if(draft.value!==value)setDraft(parts(value));
 const update=(month,year)=>{
  const next=month&&/^\d{1,4}$/.test(year)&&Number(year)>0?`${year.padStart(4,'0')}-${month}`:'';
  setDraft({value:next,month,year});onChange(next);
 };
 return <div className="min-w-0"><label htmlFor={`${id}-month`} className="text-sm font-medium">{label}{required&&<span className="required-mark">*</span>}</label>
  <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
   <select id={`${id}-month`} aria-label={`${label} — Tháng`} required={required} value={draft.month} onChange={e=>update(e.target.value,draft.year)} className="ui-field min-w-0"><option value="">Chọn tháng</option>{Array.from({length:12},(_,index)=><option key={index} value={String(index+1).padStart(2,'0')}>Tháng {index+1}</option>)}</select>
   <div className="ui-field flex min-w-0 items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500"><label htmlFor={`${id}-year`} className="shrink-0 text-sm text-slate">Năm</label><input id={`${id}-year`} aria-label={`${label} — Năm`} type="number" min="1" max="9999" required={required||Boolean(draft.month)} value={draft.year} onChange={e=>update(draft.month,e.target.value)} className="w-full min-w-0 bg-transparent text-sm outline-none" style={{padding:0,border:0}}/></div>
  </div>
 </div>;
}
