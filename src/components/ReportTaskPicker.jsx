'use client';
import { useState } from 'react';

export default function ReportTaskPicker({ tasks, selected, onChange, loading, disabled }) {
  const [search,setSearch]=useState('');
  const visible=tasks.filter(task=>`${task.title} ${task.project_name||''}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  return <fieldset disabled={disabled} className="mt-4 min-w-0"><legend className="text-sm font-semibold">Chọn công việc cần báo cáo</legend>
    <div className="mt-3 flex flex-wrap items-center gap-3"><input aria-label="Tìm tên công việc báo cáo" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm công việc hoặc dự án..." className="ui-field min-w-0 flex-1" /><span className="text-xs text-slate">Đã chọn {selected.length} công việc</span></div>
    <div className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">{loading?<p role="status" className="p-3 text-sm text-slate">Đang tải công việc...</p>:!visible.length?<p className="p-3 text-sm text-slate">Không có công việc phù hợp.</p>:visible.map(task=><label key={task.id} className="flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm hover:bg-slate-50"><input type="checkbox" data-report-task={task.id} className="mt-1" checked={selected.includes(task.id)} onChange={event=>onChange(event.target.checked?[...selected,task.id]:selected.filter(id=>id!==task.id))} /><span className="min-w-0"><span className="block whitespace-pre-wrap break-words">{task.title}</span>{task.project_name&&<span className="mt-1 block break-words text-xs text-slate">Dự án: {task.project_name}</span>}</span></label>)}</div>
  </fieldset>;
}
