'use client';
import useFeedback from '@/lib/useFeedback';
import {useId,useRef,useState} from 'react';
import {Plus,X} from 'lucide-react';
export default function JobTitlePicker({value,onChange,options,departments=[]}){
 const [custom,setCustom]=useState(''),[error,setError]=useFeedback('error');
 const input=useRef(null);
 const prefix=useId();
 const [department,setDepartment]=useState('');
 const addCustom=()=>{if(!custom.trim())return;const selected=departments.find(d=>String(d.id)===department);add(selected?`${custom.trim()} — ${selected.name}`:custom);};
 const add=title=>{title=title.trim();if(!title)return;if(/[;\r\n]/.test(title)||title.length>300){setError('Tên chức vụ tối đa 300 ký tự, không chứa dấu chấm phẩy.');return;}if(value.length>=10){setError('Chỉ chọn tối đa 10 chức vụ.');return;}if(!value.some(item=>item.toLocaleLowerCase('vi')===title.toLocaleLowerCase('vi')))onChange([...value,title]);setCustom('');input.current?.setCustomValidity('');setError('');};
 return <div className="min-w-0 space-y-4">
  <div><div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Chức vụ đã chọn</p><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-900">{value.length}/10</span></div><div className="grid gap-2 sm:grid-cols-2" aria-label="Chức vụ đã chọn">{value.map(title=><div key={title} className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5"><span className="min-w-0 break-words text-sm font-medium text-blue-950">{title}</span><button type="button" onClick={()=>onChange(value.filter(item=>item!==title))} aria-label={`Bỏ chức vụ ${title}`} title="Bỏ chức vụ" className="shrink-0 rounded p-1 text-blue-800 hover:bg-blue-100 focus-ring"><X size={15}/></button></div>)}</div>{!value.length&&<p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-slate">Chưa chọn chức vụ.</p>}</div>
  <label className="block text-sm font-medium" htmlFor={`${prefix}-existing`}>Chọn chức vụ đã có<select id={`${prefix}-existing`} aria-label="Chọn thêm chức vụ" value="" onChange={e=>add(e.target.value)} className="ui-field mt-1.5"><option value="">Chọn để thêm vào hồ sơ...</option>{options.filter(title=>!value.some(item=>item.toLocaleLowerCase('vi')===title.toLocaleLowerCase('vi'))).map(title=><option key={title} value={title}>{title}</option>)}</select></label>
  <div className="min-w-0 rounded-xl border border-line bg-slate-50 p-4"><p className="mb-3 text-sm font-semibold text-ink">Thêm chức vụ mới</p><div className="grid min-w-0 items-end gap-3 sm:grid-cols-2">
   <label htmlFor={`${prefix}-custom`} className="min-w-0 text-xs font-medium text-slate">Tên chức vụ<input id={`${prefix}-custom`} ref={input} aria-label="Chức vụ mới" maxLength={300} value={custom} onChange={e=>{setCustom(e.target.value);e.target.setCustomValidity(e.target.value.trim()?'Bấm Thêm để chọn chức vụ vừa nhập.':'');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCustom();}}} placeholder="Nhập tên chức vụ" className="ui-field mt-1.5 bg-white"/></label>
   <label htmlFor={`${prefix}-department`} className="min-w-0 text-xs font-medium text-slate">Phòng kiêm nhiệm (nếu có)<select id={`${prefix}-department`} aria-label="Phòng của chức vụ mới" className="ui-field mt-1.5 bg-white" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Không chỉ định phòng</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  </div><div className="mt-3 flex justify-end"><button type="button" className="ui-button bg-white" disabled={!custom.trim()} onClick={addCustom}><Plus size={15}/>Thêm chức vụ</button></div></div>
  {error&&<p role="alert" className="text-xs text-clay">{error}</p>}
  <p className="text-xs text-slate">Chức vụ đã chọn được lưu khi bấm Lưu thay đổi.</p>
 </div>;
}
