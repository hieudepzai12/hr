'use client';

import { useId, useState } from 'react';
import { ChevronDown, RotateCcw, Search, X } from 'lucide-react';
import MonthInput from './MonthInput';
import { REVIEW_STATES } from '@/lib/governance-config';

export default function SalaryBudgetFilters({ value, departments=[], canRestore, onChange, onReset }) {
  const id=useId();
  const [query,setQuery]=useState('');
  const normalize=text=>text.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu,'').replaceAll('\u0111','d');
  const choices=departments.filter(item=>normalize(item.name).includes(normalize(query.trim())));
  const selected=value.department?value.department.split(',').map(Number):[];
  const change=(key,next)=>onChange({...value,search:'',[key]:next});
  const toggle=(departmentId,checked)=>change('department',(checked?[...selected,departmentId]:selected.filter(item=>item!==departmentId)).join(','));
  return <section aria-label="Bộ lọc ngân sách" className="ui-card mb-4 p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Bộ lọc ngân sách</h2><button type="button" onClick={()=>{setQuery('');onReset();}} className="ui-button ui-button-secondary"><RotateCcw size={14} aria-hidden="true"/>Đặt lại bộ lọc</button></div>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <div className="min-w-0 xl:col-span-2"><MonthInput label="Tháng ngân sách" value={value.month} onChange={next=>change('month',next)}/><label className="mt-2 flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={!value.month} onChange={event=>change('month',event.target.checked?'':value.currentMonth)}/>Xem tất cả tháng</label></div>
      <div className="min-w-0 xl:col-span-2"><span id={id} className="mb-1 block text-sm font-medium">Phòng ban</span><details className="relative"><summary aria-labelledby={id} className="ui-field flex cursor-pointer list-none items-center justify-between gap-2"><span className="min-w-0 truncate text-sm">{selected.length?`Đã chọn ${selected.length} phòng ban`:'Tất cả phòng ban được xem'}</span><ChevronDown size={16} className="shrink-0" aria-hidden="true"/></summary>
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lg"><label className="relative mb-2 block"><span className="sr-only">Tìm phòng ban trong danh sách</span><Search size={15} aria-hidden="true" className="absolute left-3 top-3 text-slate"/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm phòng ban..." className="ui-field pl-9"/></label><div className="max-h-52 overflow-y-auto"><button type="button" onClick={()=>change('department','')} className="mb-1 w-full rounded px-3 py-2 text-left text-sm font-medium text-teal hover:bg-paper">Bỏ chọn phòng ban</button>{choices.map(item=><label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-paper"><input type="checkbox" checked={selected.includes(Number(item.id))} onChange={event=>toggle(Number(item.id),event.target.checked)}/><span>{item.name}</span></label>)}{!choices.length&&<p className="px-3 py-4 text-sm text-slate">Không tìm thấy phòng ban.</p>}</div></div>
      </details></div>
      <label className="min-w-0 text-sm font-medium">Trạng thái duyệt<select value={value.status} onChange={event=>change('status',event.target.value)} className="ui-field mt-1"><option value="">Tất cả trạng thái</option>{Object.entries(REVIEW_STATES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Sắp xếp<select value={`${value.sort}:${value.direction}`} onChange={event=>{const [sort,direction]=event.target.value.split(':');onChange({...value,search:'',sort,direction});}} className="ui-field mt-1"><option value="updated_at:desc">Cập nhật mới nhất</option><option value="name:asc">Tên bộ phận A–Z</option><option value="total_amount:desc">Quỹ lương cao → thấp</option><option value="total_amount:asc">Quỹ lương thấp → cao</option><option value="headcount:desc">Số lượng nhiều → ít</option></select></label>
    </div>
    {selected.length>0&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Phòng ban đang lọc">{departments.filter(item=>selected.includes(Number(item.id))).map(item=><button type="button" key={item.id} onClick={()=>toggle(Number(item.id),false)} aria-label={`Bỏ lọc phòng ${item.name}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-[#244b80]"><span className="break-words">{item.name}</span><X size={12} className="shrink-0" aria-hidden="true"/></button>)}</div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className="text-xs leading-5 text-slate">{selected.length?'Hiển thị các dòng có ít nhất một phòng đã chọn. Quỹ lương gộp được giữ nguyên, không chia theo phòng.':'Tổng cộng tính trên toàn bộ kết quả theo bộ lọc, bao gồm mọi trang.'}</p>{canRestore&&<label className="flex shrink-0 items-center gap-2 text-xs text-slate"><input type="checkbox" checked={value.deleted} onChange={event=>change('deleted',event.target.checked)}/>Hiện dòng đã xóa</label>}</div>
  </section>;
}
