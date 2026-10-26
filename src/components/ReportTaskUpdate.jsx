'use client';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { notify } from '@/lib/feedback';

const fields = [['result', 'Kết quả đã làm'], ['next_step', 'Bước tiếp theo'], ['blockers', 'Vướng mắc'], ['solution', 'Giải pháp']];

export default function ReportTaskUpdate({ task, employeeId, canUpdate, disabled, onStateChange }) {
  const [form, setForm] = useState(null);
  const [locked, setLocked] = useState(false);
  const [primary, setPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,setError]=useFeedback('error');
  useEffect(() => {
    let active = true;
    onStateChange(task.id, true);
    api.get(`/tasks/${task.id}`).then(({ data }) => {
      if (!active) return;
      const own = data.updates?.find((item) => Number(item.employee_id) === Number(employeeId));
      const primary = Number(data.assignee_id) === Number(employeeId);
      setPrimary(primary);
      setForm({ progress: own?.progress ?? (primary ? data.progress : 0) ?? 0,
        result: own?.result ?? (primary ? data.completed_result : '') ?? '',
        next_step: own?.next_step ?? (primary ? data.next_step : '') ?? '',
        blockers: own?.blockers ?? (primary ? data.blockers : '') ?? '',
        solution: own?.solution ?? (primary ? data.proposed_solution : '') ?? '', submit_for_review: false });
      setLocked(data.status === 'done');
      onStateChange(task.id, false);
    }).catch(() => { if (active) setError('Không tải được phần việc. Bỏ chọn rồi chọn lại để thử lại.'); });
    return () => { active = false; };
  }, [task.id, employeeId, onStateChange, setError]);
  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    onStateChange(task.id, true);
  };
  const save = async () => {
    if (saving || disabled || !canUpdate) return;
    setSaving(true); setError('');
    try {
      await api.post(`/tasks/${task.id}/updates`, form);
      void notify('Đã lưu tiến độ và kết quả.'); onStateChange(task.id, false);
    } catch (err) { setError(err.response?.data?.error || 'Không lưu được cập nhật'); }
    finally { setSaving(false); }
  };
  return <section className="mt-3 rounded-lg border border-line p-3">
    <h4 className="font-semibold">#{task.id} {task.title}</h4>
    {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
    {!form ? <p role="status" className="text-sm">Đang tải phần việc…</p> : <>
      {locked && <p className="mt-2 text-sm text-slate">Đã nghiệm thu — nội dung công việc đang khóa.</p>}
      <fieldset disabled={locked || saving || disabled || !canUpdate} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Tiến độ (%)<input type="number" min="0" max="100" step="1" required value={form.progress} onChange={(e) => change('progress', Number(e.target.value))} className="ui-field mt-1" /></label>
        {fields.map(([key, label]) => <label key={key} className="text-sm">{label}<textarea rows={3} maxLength={10000} value={form[key]} onChange={(e) => change(key, e.target.value)} className="ui-field mt-1" /></label>)}
        {primary && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.submit_for_review} onChange={(e) => change('submit_for_review', e.target.checked)} /> Báo hoàn tất và gửi quản lý nghiệm thu</label>}
      </fieldset>
      {!locked && canUpdate && <button type="button" disabled={saving || disabled} onClick={save} className="ui-button ui-button-secondary mt-3">{saving ? 'Đang lưu…' : 'Lưu cập nhật công việc'}</button>}
    </>}
  </section>;
}
