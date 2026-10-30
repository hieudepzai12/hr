'use client';

import { useLayoutEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import DateInput from './DateInput';

function WorkLine({ task, index, onChange, onRemove, onDescriptionChange, onDeadlineChange, canRemove, canDelete }) {
  const input = useRef(null);
  useLayoutEffect(() => {
    const element = input.current;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [task.title]);
  return <li className="min-w-0 rounded-xl border border-line bg-white p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-ink"><span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-900">{index+1}</span>Công việc {index+1}</h4>
      {onRemove && (typeof task.id==='string'||canDelete) && <button type="button" onClick={()=>onRemove(task.id)} aria-label={`Xóa công việc ${index+1}`} title={typeof task.id==='number'?'Xóa công việc đã lưu':canRemove?'Xóa dòng công việc chưa lưu':'Xóa nội dung để nhập lại'} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 focus-ring"><Trash2 size={15} aria-hidden="true" />Xóa</button>}
    </div>
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
      <label className="block min-w-0"><span className="form-label">Tên công việc<span className="required-mark">*</span></span><textarea ref={input} aria-label={`Công việc ${index+1}`} required maxLength={500} rows={1} value={task.title} placeholder="Nhập tên công việc" onChange={event=>onChange(task.id,event.target.value)} className="ui-field block min-h-10 resize-y font-normal leading-5" /></label>
      {onDeadlineChange&&<div className="min-w-0"><DateInput label={`Hạn chót công việc ${index+1}`} value={task.due_date||''} onChange={value=>onDeadlineChange(task.id,value)} /></div>}
      {onDescriptionChange&&<label className="block min-w-0 text-sm font-medium text-ink md:col-span-2">Mô tả công việc<textarea aria-label={`Mô tả công việc ${index+1}`} rows={7} maxLength={10000} value={task.description||''} placeholder="Nội dung cần thực hiện" onChange={event=>onDescriptionChange(task.id,event.target.value)} className="ui-field mt-2 min-h-48 resize-y font-normal leading-6" /></label>}
    </div>
  </li>;

}

export default function TaskGroupEditor({ tasks, onChange, onAdd, onRemove, onDescriptionChange, onDeadlineChange, canDeleteTask }) {
  return <section aria-label="Nội dung công việc chung" className="min-w-0 overflow-hidden rounded-xl border border-line bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold">Nội dung công việc</h3><span className="text-xs text-slate">{tasks.length} công việc</span></div>
    <ol className="m-0 list-none space-y-3 bg-slate-50/60 p-3 sm:p-4">{tasks.map((task, index) => <WorkLine key={task.id} task={task} index={index} onChange={onChange} onRemove={onRemove} canRemove={tasks.length>1} canDelete={Boolean(canDeleteTask?.(task))} onDescriptionChange={onDescriptionChange} onDeadlineChange={onDeadlineChange} />)}</ol>
    {onAdd&&<div className="border-t border-line bg-white px-4 py-3"><button type="button" onClick={onAdd} className="ui-button ui-button-secondary">+ Thêm công việc</button></div>}
  </section>;
}
