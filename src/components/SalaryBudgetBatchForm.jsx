'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import useFeedback from '@/lib/useFeedback';
import { vnd } from '@/lib/governance-config';
import MonthInput from './MonthInput';
import Modal from './Modal';

const emptyRow=(id,department)=>({id,name:department?.name||'',department_ids:department?[Number(department.id)]:[],headcount:'',total_amount:'',notes:''});

export default function SalaryBudgetBatchForm({ departments, initialMonth, onClose, onSaved }) {
  const [month,setMonth]=useState(initialMonth);
  const [rows,setRows]=useState(()=>departments.slice(0,100).map(item=>emptyRow(`department-${item.id}`,item)));
  const [saving,setSaving]=useState(false);
  const saveLock=useRef(false);
  const [error,setError]=useFeedback('error');
  const activeRows=rows.filter(row=>row.total_amount!=='');
  const total=activeRows.reduce((sum,row)=>sum+BigInt(row.total_amount||'0'),0n);
  const update=(id,key,value)=>{setError('');setRows(current=>current.map(row=>row.id===id?{...row,[key]:value}:row));};
  const toggle=(row,departmentId,checked)=>{
    const ids=checked?[...row.department_ids,departmentId]:row.department_ids.filter(id=>id!==departmentId);
    const oldName=departments.filter(item=>row.department_ids.includes(Number(item.id))).map(item=>item.name).join(' + ');
    const name=departments.filter(item=>ids.includes(Number(item.id))).map(item=>item.name).join(' + ');
    setError('');setRows(current=>current.map(item=>item.id===row.id?{...item,department_ids:ids,name:!item.name||item.name===oldName?name:item.name}:item));
  };
  const save=async event=>{
    event.preventDefault();if(saveLock.current)return;setError('');
    if(!activeRows.length){setError('Nhập quỹ lương cho ít nhất một dòng.');return;}
    const seen=new Set();
    for(const [index,row] of rows.entries()){
      if(row.total_amount===''){
        if(row.headcount!==''||row.notes.trim()){setError(`Dòng ${index+1}: đã nhập số lượng hoặc ghi chú nhưng chưa nhập quỹ lương.`);return;}
        continue;
      }
      if(!row.name.trim()||!row.department_ids.length){setError(`Dòng ${index+1}: nhập tên bộ phận và chọn ít nhất một phòng ban.`);return;}
      if(row.department_ids.some(id=>seen.has(id))){setError(`Dòng ${index+1}: phòng ban bị trùng với dòng đã nhập quỹ lương phía trên.`);return;}
      row.department_ids.forEach(id=>seen.add(id));
    }
    saveLock.current=true;setSaving(true);
    try{
      const {data}=await api.post('/governance/budgets/batch',{month,items:activeRows.map(({name,department_ids,headcount,total_amount,notes})=>({name,department_ids,headcount,total_amount,notes}))});
      onSaved(data);
    }catch(err){
      const message=err.response?.data?.error;
      setError(message?message.replace(/^Dòng (\d+):/,(_,number)=>`Dòng ${rows.findIndex(row=>row.id===activeRows[Number(number)-1]?.id)+1}:`):'Chưa xác nhận được kết quả lưu. Kiểm tra danh sách ngân sách trước khi thử lại.');
    }
    finally{saveLock.current=false;setSaving(false);}
  };
  return <Modal title="Nhập quỹ lương các phòng ban" width="max-w-7xl" onClose={()=>{if(!saveLock.current)onClose();}}>
    <form onSubmit={save} className="min-w-0 space-y-4">
      <fieldset disabled={saving} className="grid gap-4 rounded-xl bg-paper p-4 sm:grid-cols-2"><MonthInput label="Tháng ngân sách" required value={month} onChange={value=>{if(!saveLock.current)setMonth(value);}}/><div className="sm:text-right"><p className="text-xs text-slate">Tổng quỹ lương đang nhập</p><p className="mt-1 text-xl font-bold text-teal">{vnd(total.toString())}</p><p className="mt-1 text-xs text-slate">{activeRows.length} dòng có quỹ lương</p></div></fieldset>
      <p className="text-sm leading-6 text-slate">Nhập chung một tháng, lưu nhiều phòng ban một lần. Chỉ dòng có nhập quỹ lương được lưu; phòng chưa lập ngân sách có thể để trống. Muốn gộp phòng, chọn nhiều phòng trong một dòng và bỏ trống quỹ lương ở các dòng phòng đó còn lại.</p>
      <fieldset disabled={saving} className="min-w-0">
        <div className="max-w-full overflow-x-auto rounded-xl border border-line" role="region" aria-label="Nhập nhiều dòng quỹ lương" tabIndex={0}>
          <table className="ui-table min-w-[1000px]"><thead><tr><th className="w-14">STT</th><th className="min-w-72">Bộ phận / nhóm phòng</th><th className="w-28">Số lượng</th><th className="min-w-48">Quỹ lương (VND)</th><th className="min-w-48">Ghi chú</th><th className="w-14"><span className="sr-only">Bỏ dòng</span></th></tr></thead>
            <tbody>{rows.map((row,index)=><tr key={row.id} data-budget-row={row.id}><td>{index+1}</td><td><input aria-label={`Tên bộ phận dòng ${index+1}`} required={row.total_amount!==''} maxLength={300} value={row.name} onChange={e=>update(row.id,'name',e.target.value)} className="ui-field"/>
              <details className="mt-2 rounded-lg border border-line px-2 py-1.5"><summary className="cursor-pointer text-xs text-slate">{row.department_ids.length?`Đã chọn ${row.department_ids.length} phòng ban`:'Chọn phòng ban'}</summary><div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{departments.map(item=><label key={item.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs"><input type="checkbox" checked={row.department_ids.includes(Number(item.id))} onChange={e=>toggle(row,Number(item.id),e.target.checked)}/><span>{item.name}</span></label>)}</div></details>
            </td><td><input aria-label={`Số lượng dòng ${index+1}`} type="number" min="0" max="2147483647" step="1" value={row.headcount} onChange={e=>update(row.id,'headcount',e.target.value)} className="ui-field"/></td><td><input aria-label={`Quỹ lương dòng ${index+1}`} type="text" inputMode="numeric" pattern="[0-9]{1,18}" maxLength={18} value={row.total_amount} onChange={e=>update(row.id,'total_amount',e.target.value.replace(/\D/g,''))} className="ui-field" placeholder="Để trống nếu chưa nhập"/>{row.total_amount!==''&&<p className="mt-1 text-xs text-slate">{vnd(row.total_amount)}</p>}</td><td><textarea aria-label={`Ghi chú dòng ${index+1}`} rows={2} maxLength={20000} value={row.notes} onChange={e=>update(row.id,'notes',e.target.value)} className="ui-field"/></td><td><button type="button" aria-label={`Bỏ dòng ${index+1}`} title="Bỏ dòng khỏi lần nhập này" onClick={()=>setRows(current=>current.filter(item=>item.id!==row.id))} className="icon-button text-clay"><Trash2 size={16}/></button></td></tr>)}</tbody>
            <tfoot><tr className="bg-[#fff0b3] font-semibold"><td colSpan={3} className="px-4 py-3">TỔNG CỘNG</td><td className="whitespace-nowrap px-4 py-3">{vnd(total.toString())}</td><td colSpan={2} className="px-4 py-3 text-xs">{activeRows.length} dòng sẽ được lưu</td></tr></tfoot>
          </table>
        </div>
        <button type="button" disabled={rows.length>=100} onClick={()=>setRows(current=>[...current,emptyRow(crypto.randomUUID())])} className="ui-button ui-button-secondary mt-3"><Plus size={15}/>Thêm dòng</button>
      </fieldset>
      {error&&<p role="alert" className="ui-notice">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white py-3"><span className="text-xs text-slate">Lưu bản nháp. Có dòng lỗi thì không lưu dòng nào trong lần này.</span><div className="flex gap-2"><button type="button" disabled={saving} onClick={onClose} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving||!activeRows.length} className="ui-button ui-button-primary">{saving?'Đang lưu…':`Lưu ${activeRows.length} dòng ngân sách`}</button></div></div>
    </form>
  </Modal>;
}
