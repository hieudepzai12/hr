'use client';
import { progressText } from '@/lib/task-progress';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Download, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import api from '@/lib/api';
import useFeedback from '@/lib/useFeedback';
import Modal from './Modal';

const inputClass = 'ui-field min-w-32';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ExcelImport({ onClose, onImported }) {
  const inputId = useId();
  const fileInput = useRef(null);
  const requestLock = useRef(false);
  const callbacks = useRef({onClose,onImported});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [allowMissingDue, setAllowMissingDue] = useState(false);
  const [busy, setBusy] = useState('');
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useFeedback('error');
  const close = () => { if (!requestLock.current) onClose(); };
  const chooseFile = selected => {
    if (requestLock.current) return;
    setPreview(null);setOverrides({});setError('');setDragging(false);
    if (!selected) { setFile(null);return; }
    if (!/\.xlsx$/i.test(selected.name)) { setFile(null);setError('Chỉ hỗ trợ file Excel .xlsx.');return; }
    if (!selected.size || selected.size > MAX_FILE_SIZE) { setFile(null);setError('File phải có dữ liệu và không vượt quá 5 MB.');return; }
    setFile(selected);
  };
  const setRow = (key, patch) => setOverrides(current => ({...current,[key]:{...current[key],...patch}}));
  useEffect(()=>{callbacks.current={onClose,onImported};},[onClose,onImported]);
  useEffect(()=>{
    if(!file)return;
    let active=true;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      if(requestLock.current)return;
      requestLock.current=true;setBusy('preview');setError('');
      const post=action=>{
        const data=new FormData();
        data.append('file',file);data.append('action',action);
        data.append('overrides',JSON.stringify(overrides));data.append('allow_missing_due',String(allowMissingDue));
        return api.post('/tasks/import',data,{signal:controller.signal});
      };
      try{
        const {data}=await post('preview');
        if(!active)return;
        setPreview(data);
        if(!data.rows.length){setError('File không có công việc để nhập.');return;}
        const selected=data.rows.filter(row=>!row.skip&&!row.duplicate);
        const invalid=selected.find(row=>row.issues.some(issue=>issue!=='Chưa có hạn chót'||!allowMissingDue));
        if(invalid){
          const issues=invalid.issues.filter(issue=>issue!=='Chưa có hạn chót'||!allowMissingDue);
          setError(`Dòng ${invalid.sheet}!${invalid.row}: ${issues.join('; ')}`);return;
        }
        setBusy('commit');
        const result=selected.length?(await post('commit')).data:{imported:0,skipped:data.rows.length};
        if(active){callbacks.current.onImported(result);callbacks.current.onClose();}
      }catch(err){if(active&&!controller.signal.aborted)setError(err.response?.data?.error||'Không nhập được file Excel.');}
      finally{requestLock.current=false;if(active)setBusy('');}
    },450);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[file,overrides,allowMissingDue,retry,setError]);
  const step = busy==='commit' ? 2 : preview||busy==='preview' ? 1 : 0;
  return <Modal title="Nhập công việc từ Excel" onClose={close} width={preview?'max-w-7xl':'max-w-2xl'}>
    <div className="min-w-0 space-y-5" data-excel-import>
      <ol aria-label="Các bước nhập Excel" className="grid grid-cols-3 gap-2 border-b border-line pb-4">
        {['Chọn file','Kiểm tra dữ liệu','Nhập công việc'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={`flex min-w-0 items-center gap-2 text-xs sm:text-sm ${index<=step?'font-medium text-ink':'text-slate'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${index<=step?'bg-teal text-white':'bg-paper text-slate'}`}>{index<step?<Check size={13} aria-hidden="true"/>:index+1}</span><span>{label}</span></li>)}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><FileSpreadsheet size={24} className="shrink-0 text-sage" aria-hidden="true"/><div><h3 className="text-sm font-semibold">Mẫu công việc</h3><p className="mt-0.5 text-xs text-slate">Excel .xlsx</p></div></div>
        <a href="/mau-import-cong-viec.xlsx" download="mau-import-cong-viec.xlsx" className="ui-button ui-button-secondary"><Download size={16} aria-hidden="true"/>Tải mẫu</a>
      </div>
      <div onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();if(busy)return;if(event.dataTransfer.files.length>1){setDragging(false);setError('Chọn một file Excel mỗi lần nhập.');return;}chooseFile(event.dataTransfer.files[0]);}}>
        <input ref={fileInput} id={inputId} type="file" accept=".xlsx" disabled={Boolean(busy)} aria-label="Chọn file Excel công việc" className="hidden" onChange={event=>{chooseFile(event.target.files?.[0]);event.target.value='';}}/>
        <button type="button" disabled={Boolean(busy)} onClick={()=>fileInput.current?.click()} aria-controls={inputId} className={`flex w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors disabled:opacity-60 ${dragging?'border-teal bg-blue-50':'border-[#bdcde1] bg-white hover:border-teal hover:bg-[#f7faff]'}`}>
          {file?<CheckCircle2 size={28} className="text-sage" aria-hidden="true"/>:<UploadCloud size={28} className="text-teal" aria-hidden="true"/>}
          <span className="max-w-full break-all text-sm font-semibold text-ink">{file?file.name:'Chọn hoặc kéo thả file Excel'}</span>
          <span className="text-xs text-slate">{file?`${Math.max(1,Math.ceil(file.size/1024)).toLocaleString('vi-VN')} KB · Bấm để đổi file`:'XLSX · Tối đa 5 MB · 500 dòng'}</span>
        </button>
      </div>
      {!preview&&<details className="group text-sm"><summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate">Cách điền mẫu<ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true"/></summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-6 text-slate"><li>Mỗi dòng là một công việc.</li><li>Nhập đúng tên nhân viên, tên hoặc mã dự án / khách hàng.</li><li>Nhiều người thực hiện: ngăn cách bằng dấu +.</li><li>Ngày: dd/mm/yyyy. Tiến độ: nhập nội dung thực hiện.</li></ul></details>}
      {preview&&<fieldset disabled={Boolean(busy)} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-semibold">Đối chiếu dữ liệu</legend>
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-paper px-3 py-1.5 font-medium">{preview.rows.length} công việc</span>{preview.rows.some(row=>row.issues.length>0)&&<span className="rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-dark">{preview.rows.filter(row=>row.issues.length>0).length} dòng cần kiểm tra</span>}</div>
        <div className="max-h-[45vh] max-w-full overflow-auto rounded-xl border border-line" role="region" aria-label="Dữ liệu Excel xem trước" tabIndex={0}>
          <table className="ui-table min-w-[1250px]"><thead className="sticky top-0 z-10"><tr><th>Nguồn</th><th>Công việc</th><th>Phụ trách</th><th>Phối hợp</th><th>Phòng ban</th><th>Dự án</th><th>Khách hàng</th><th>Hạn chót</th><th>Tiến độ</th><th>Kiểm tra</th><th>Bỏ qua</th></tr></thead><tbody>{preview.rows.map(row=><tr key={row.source_key} className={overrides[row.source_key]?.skip?'opacity-60':''}>
            <td className="whitespace-nowrap text-xs text-slate">{row.sheet}!{row.row}</td><td className="min-w-56 whitespace-pre-wrap break-words font-medium">{row.title}</td>
            <td><div className="mb-1 text-xs text-slate">{row.assignee_name||'Thiếu tên'}</div><select aria-label={`Phụ trách dòng ${row.row}`} className={inputClass} value={overrides[row.source_key]?.assignee_id||row.assignee_id||''} onChange={event=>setRow(row.source_key,{assignee_id:event.target.value})}><option value="">Chọn người</option>{preview.employees.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></td>
            <td><select multiple aria-label={`Phối hợp dòng ${row.row}`} className={inputClass} value={(overrides[row.source_key]?.collaborator_ids||row.collaborator_ids||[]).map(String)} onChange={event=>setRow(row.source_key,{collaborator_ids:[...event.target.selectedOptions].map(option=>Number(option.value))})}>{preview.employees.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></td>
            <td><select aria-label={`Phòng ban dòng ${row.row}`} className={inputClass} value={overrides[row.source_key]?.department_id||row.department_id||''} onChange={event=>setRow(row.source_key,{department_id:event.target.value})}><option value="">Chọn phòng</option>{preview.departments.map(dept=><option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></td>
            <td><div className="mb-1 text-xs text-slate">{row.project_name||'—'}</div><select aria-label={`Dự án dòng ${row.row}`} className={inputClass} value={overrides[row.source_key]?.project_id||row.project_id||''} onChange={event=>setRow(row.source_key,{project_id:event.target.value})}><option value="">Không có</option>{(preview.projects||[]).map(project=><option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></td>
            <td><div className="mb-1 text-xs text-slate">{row.customer_name||'—'}</div><select aria-label={`Khách hàng dòng ${row.row}`} disabled={Boolean(row.project_id)} className={inputClass} value={row.project_id?row.customer_id||'':overrides[row.source_key]?.customer_id||row.customer_id||''} onChange={event=>setRow(row.source_key,{customer_id:event.target.value})}><option value="">Không có</option>{preview.customers.map(customer=><option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}</select></td>
            <td><input aria-label={`Hạn chót dòng ${row.row}`} className={inputClass} type="date" value={overrides[row.source_key]?.due_date??row.due_date??''} onChange={event=>setRow(row.source_key,{due_date:event.target.value})}/></td>
            <td>{progressText(row)}{row.confirm_fraction&&<label className="mt-2 block text-xs"><input type="checkbox" checked={Boolean(overrides[row.source_key]?.progress_confirmed)} onChange={event=>setRow(row.source_key,{progress_confirmed:event.target.checked})}/> Xác nhận tỷ lệ %</label>}</td>
            <td className="min-w-48 text-xs"><span className={row.issues.length?'text-clay':'font-medium text-sage'}>{row.issues.join('; ')||'Sẵn sàng'}</span></td>
            <td className="text-center"><input aria-label={`Bỏ qua dòng ${row.row}`} type="checkbox" checked={Boolean(overrides[row.source_key]?.skip)} onChange={event=>setRow(row.source_key,{skip:event.target.checked})}/></td>
          </tr>)}</tbody></table>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowMissingDue} onChange={event=>setAllowMissingDue(event.target.checked)}/>Cho phép dòng chưa có hạn chót</label>
      </fieldset>}
      {error&&<p role="alert" className="ui-notice">{error}</p>}
      <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-white py-3">
        <button type="button" disabled={Boolean(busy)} onClick={close} className="ui-button ui-button-secondary">Hủy</button>
        {error&&file&&<button type="button" disabled={Boolean(busy)} onClick={()=>setRetry(value=>value+1)} className="ui-button ui-button-secondary">Thử lại</button>}
        <span role="status" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate">{busy&&<Loader2 size={16} className="animate-spin" aria-hidden="true"/>}{busy==='commit'?'Đang nhập công việc…':busy==='preview'?'Đang kiểm tra dữ liệu…':preview?'Sửa dữ liệu để tự động nhập':file?'Chờ tự kiểm tra…':'Chọn file để tự động nhập'}</span>
      </footer>
    </div>
  </Modal>;
}
