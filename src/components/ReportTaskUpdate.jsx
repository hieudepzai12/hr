'use client';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useImperativeHandle, useState } from 'react';
import api from '@/lib/api';

const fields = [['blockers', 'Vướng mắc'], ['solution', 'Giải pháp']];

export default function ReportTaskUpdate({ task, employeeId, canUpdate, disabled, ref }) {
  const [form, setForm] = useState(null);
  const [locked, setLocked] = useState(false);
  const [primary, setPrimary] = useState(false);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useFeedback('error');
  useEffect(() => {
    let active = true;
    api.get(`/tasks/${task.id}`).then(({ data }) => {
      if (!active) return;
      const own = data.updates?.find((item) => Number(item.employee_id) === Number(employeeId));
      const primary = Number(data.assignee_id) === Number(employeeId);
      setPrimary(primary);
      setForm({ progress_text: own?.progress_text ?? (primary ? data.progress_text : '') ?? '',
        result: own?.result ?? (primary ? data.completed_result : '') ?? '',
        next_step: own?.next_step ?? (primary ? data.next_step : '') ?? '',
        blockers: own?.blockers ?? (primary ? data.blockers : '') ?? '',
        solution: own?.solution ?? (primary ? data.proposed_solution : '') ?? '', submit_for_review: false });
      setLocked(data.status === 'done');
    }).catch(() => { if (active) setError('Không tải được phần việc. Bỏ chọn rồi chọn lại để thử lại.'); });
    return () => { active = false; };
  }, [task.id, employeeId, setError]);
  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  useImperativeHandle(ref,()=>({save:async()=>{
    if(!form)throw new Error('Chưa tải xong công việc. Vui lòng thử lại.');
    if(locked||!canUpdate||!dirty)return;
    await api.post(`/tasks/${task.id}/updates`,form);
    setDirty(false);
  }}),[form,locked,canUpdate,dirty,task.id]);
  return <section className="mt-4 rounded-xl border border-line bg-white p-4">
    <h4 className="whitespace-pre-wrap break-words text-sm font-semibold text-ink">{task.title}</h4>{task.project_name&&<p className="mt-1 break-words text-xs font-medium text-teal">Dự án: {task.project_name}</p>}{task.due_date&&<p className="mt-1 text-xs font-medium text-slate">Hạn chót: {String(task.due_date).slice(0,10).split('-').reverse().join('/')}</p>}{task.description&&<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate">{task.description}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
    {!form ? <p role="status" className="text-sm">Đang tải phần việc…</p> : <>
      {locked && <p className="mt-2 text-sm text-slate">Đã nghiệm thu — nội dung công việc đang khóa.</p>}
      <fieldset disabled={locked || disabled || !canUpdate} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Tiến độ<textarea rows={3} maxLength={10000} value={form.progress_text} onChange={(e) => change('progress_text', e.target.value)} placeholder="Nhập nội dung tiến độ thực hiện…" className="ui-field mt-1" /></label>
        {fields.map(([key, label]) => <label key={key} className="text-sm">{label}<textarea rows={3} maxLength={10000} value={form[key]} onChange={(e) => change(key, e.target.value)} className="ui-field mt-1" /></label>)}
        {primary && <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><input type="checkbox" checked={form.submit_for_review} onChange={(e) => change('submit_for_review', e.target.checked)} /> Báo hoàn tất và gửi quản lý nghiệm thu</label>}
      </fieldset>

    </>}
  </section>;
}
