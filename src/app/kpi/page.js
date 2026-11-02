'use client';
import { confirmAction } from '@/lib/feedback';
import useFeedback from '@/lib/useFeedback';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import usePagedList from '@/lib/usePagedList';
import Pagination from '@/components/Pagination';

const RATING_COLOR = {
  'Hoàn thành tốt': { bg: '#DCE7DD', fg: '#2f6059' },
  'Hoàn thành': { bg: '#DBEAFE', fg: '#1D4F95' },
  'Không hoàn thành': { bg: '#F1DAD5', fg: '#9B3326' },
};

function KpiContent() {
  const { can } = useAuth();
  const canEvaluate = can('kpi','create')||can('kpi','edit');
  const { items: evaluations, pagination, loading, error: listError, refresh: load } = usePagedList('/kpi');
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,setEditing]=useState(null);
  const [form, setForm] = useState({ employee_id: '', period: '', rating: '', task_ids: [], comments: '' });
  const [evidenceOptions, setEvidenceOptions] = useState({ tasks: [] });
  const [evidenceLoading,setEvidenceLoading]=useState(false);
  const evidenceRequest=useRef(0);
  const [error,setError]=useFeedback('error');
  const [saving, setSaving] = useState(false);
  const [,setNotice]=useFeedback('success');

  useEffect(() => { if (canEvaluate) api.get('/employees', { params: { fields: 'options', status: 'active' } }).then(({ data }) => setEmployees(data)).catch(err=>setError(err.response?.data?.error||'Không tải được danh sách nhân viên.')); }, [canEvaluate,setError]);

  const openCreate = () => {
    setEditing(null);
    evidenceRequest.current+=1;setEvidenceLoading(false);
    setForm({ employee_id: '', period: '', rating: '', comments: '', task_ids: [] });
    setEvidenceOptions({ tasks: [] });
    setError('');
    setModalOpen(true);
  };

  const loadEvidence = async (employeeId, preserved=[]) => {
    const request=++evidenceRequest.current;
    setEvidenceOptions({ tasks: preserved });
    setEvidenceLoading(Boolean(employeeId));
    if (!employeeId) return;
    try { const { data } = await api.get('/kpi/evidence', { params: { employee_id: employeeId } }); if(request===evidenceRequest.current){const tasks=data.tasks||[];setEvidenceOptions({tasks:[...tasks,...preserved.filter(item=>!tasks.some(task=>Number(task.id)===Number(item.id)))]});} }
    catch (err) { if(request===evidenceRequest.current)setError(err.response?.data?.error || 'Không tải được căn cứ KPI'); }
    finally{if(request===evidenceRequest.current)setEvidenceLoading(false);}
  };
  const selectEmployee = employeeId => {
    setForm(current=>({...current,employee_id:employeeId,task_ids:[]}));
    void loadEvidence(employeeId);
  };
  const openEdit = evaluation => {
    const evidence=(evaluation.evidence||[]).filter(item=>item.task_id);
    setEditing(evaluation);
    setForm({employee_id:evaluation.employee_id,period:evaluation.period,rating:evaluation.rating,comments:evaluation.comments||'',task_ids:evidence.map(item=>Number(item.task_id))});
    setError('');setModalOpen(true);
    void loadEvidence(evaluation.employee_id,evidence.map(item=>({...item.snapshot,id:Number(item.task_id)})));
  };
  const toggleEvidence = (key, id) => setForm((current) => ({ ...current,
    [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id],
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      if(editing)await api.put(`/kpi/${editing.id}`,form);else await api.post('/kpi', form);
      setModalOpen(false);
      load();
      setNotice('Đã lưu đánh giá KPI.');
    } catch (err) {
      setError(err.response?.data?.error || 'Có lỗi xảy ra');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!await confirmAction('Xoá đánh giá này?')) return;
    try { await api.delete(`/kpi/${id}`); load(); setNotice('Đã xóa đánh giá KPI.'); }
    catch (err) { setError(err.response?.data?.error || 'Không xóa được đánh giá KPI'); }
  };

  return (
    <Layout
      title="Đánh giá KPI"
      actions={can('kpi','create') && (
        <button onClick={openCreate} className="ui-button ui-button-primary">
          <Plus size={16} /> Tạo đánh giá
        </button>
      )}
    >
      {(listError || error && !modalOpen) && <p role="alert" className="ui-notice mb-4">{listError || error}</p>}

      <section className="ui-card overflow-hidden" aria-label="Danh sách đánh giá KPI">
        <div className="flex items-center gap-2 border-b border-line px-4 py-4 sm:px-5"><ClipboardList size={18} className="text-teal" aria-hidden="true" /><h2 className="text-sm font-semibold">Danh sách đánh giá</h2></div>
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)_88px] gap-5 border-b border-line bg-slate-50 px-5 py-3 text-xs font-semibold text-slate lg:grid" aria-hidden="true"><span>Nhân viên</span><span>Kỳ đánh giá</span><span>Kết quả</span><span>Người đánh giá</span><span>Thao tác</span></div>
        {loading ? <p role="status" className="ui-card p-8 text-center text-sm text-slate">Đang tải đánh giá KPI...</p> : evaluations.length === 0 && <p className="ui-card ui-empty">Chưa có đánh giá KPI nào.</p>}
        {evaluations.map((ev) => {
          const colors = RATING_COLOR[ev.rating] || RATING_COLOR['Không hoàn thành'];
          const evidence=(ev.evidence||[]).filter(item=>item.task_id);
          return (
            <article key={ev.id} data-kpi-evaluation={ev.id} className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_88px] items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)_88px] lg:items-center lg:gap-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={ev.employee_name} color={ev.avatar_color} avatarPath={ev.avatar_path} size={36} />
                  <h3 className="min-w-0 break-words text-sm font-semibold text-ink">{ev.employee_name}</h3>
                </div>
                <div className="col-start-1 min-w-0 lg:col-start-auto"><span className="mb-1 block text-xs text-slate lg:hidden">Kỳ đánh giá</span><p className="break-words text-sm font-medium">{ev.period}</p></div>
                <div className="col-start-1 min-w-0 lg:col-start-auto"><span className="mb-1 block text-xs text-slate lg:hidden">Kết quả</span><span className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.fg }}><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{ev.rating}</span></div>
                <div className="col-start-1 min-w-0 lg:col-start-auto"><span className="mb-1 block text-xs text-slate lg:hidden">Người đánh giá</span><p className="break-words text-sm">{ev.evaluator_name || '—'}</p></div>
                <div className="col-start-2 row-start-1 flex justify-end gap-1 lg:col-start-auto lg:row-start-auto">
                  {can('kpi','edit')&&<button type="button" onClick={()=>openEdit(ev)} className="icon-button text-teal hover:bg-blue-50" aria-label={`Sửa đánh giá của ${ev.employee_name}, kỳ ${ev.period}`} title="Sửa đánh giá"><Pencil size={16} aria-hidden="true" /></button>}
                  {can('kpi','delete')&&<button type="button" onClick={()=>remove(ev.id)} className="icon-button text-clay hover:bg-red-50" aria-label={`Xóa đánh giá của ${ev.employee_name}, kỳ ${ev.period}`} title="Xóa đánh giá"><Trash2 size={16} aria-hidden="true" /></button>}
                </div>
              </div>
              {(ev.comments||evidence.length>0)&&<details className="group mt-3 rounded-lg border border-line bg-slate-50/60">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-teal focus-ring [&::-webkit-details-marker]:hidden"><ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" /><span>Chi tiết đánh giá</span>{evidence.length>0&&<span className="text-slate">· {evidence.length} công việc</span>}</summary>
                <div className="space-y-4 border-t border-line bg-white p-4">
                  {ev.comments&&<section><h4 className="mb-2 text-xs font-semibold text-slate">Nhận xét</h4><p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{ev.comments}</p></section>}
                  {evidence.length>0&&<section><h4 className="mb-2 text-xs font-semibold text-slate">Công việc làm căn cứ</h4><ol className="divide-y divide-line">{evidence.map((item,index)=><li key={item.task_id} className="flex min-w-0 items-start gap-3 py-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate">{index+1}</span><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.snapshot.title}</p>{item.snapshot.accepted_at&&<span className="text-xs text-emerald-700">Đã nghiệm thu</span>}</div></li>)}</ol></section>}
                </div>
              </details>}
            </article>
          );
        })}
      </section>

      <Pagination {...pagination} />

      {modalOpen && (
        <Modal title={editing?'Sửa đánh giá KPI':'Tạo đánh giá KPI'} onClose={() => { if(!saving)setModalOpen(false); }} width="max-w-3xl">
          <form onSubmit={submit} className="space-y-5"><fieldset disabled={saving} className="min-w-0 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Nhân viên</label>
                <select required disabled={Boolean(editing)} value={form.employee_id} onChange={(e) => selectEmployee(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none bg-white">
                  <option value="">— Chọn —</option>
                  {editing&&!employees.some(employee=>Number(employee.id)===Number(editing.employee_id))&&<option value={editing.employee_id}>{editing.employee_name}</option>}
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Kỳ đánh giá</label>
                <input required placeholder="VD: 2026-Q3" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-line text-sm focus-ring focus:border-teal outline-none" />
              </div>
            </div>

            <fieldset><legend className="text-sm font-semibold text-ink">Mức đánh giá<span className="required-mark">*</span></legend><div className="mt-3 grid gap-2 sm:grid-cols-3">{['Không hoàn thành','Hoàn thành','Hoàn thành tốt'].map(rating=><label key={rating} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm ${form.rating===rating?'border-teal bg-blue-50 font-semibold text-ink':'border-line bg-white text-slate hover:bg-slate-50'}`}><input type="radio" name="rating" required value={rating} checked={form.rating===rating} onChange={()=>setForm({...form,rating})} className="h-4 w-4 shrink-0" />{rating}</label>)}</div></fieldset>

            {form.employee_id && <details className="group rounded-lg border border-line text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-slate-50 p-3 font-medium focus-ring [&::-webkit-details-marker]:hidden"><ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" /><span>Công việc làm căn cứ</span><span className="ml-auto text-xs text-slate">Đã chọn {form.task_ids.length}</span></summary>
              <div className="max-h-60 divide-y divide-line overflow-y-auto border-t border-line px-3">
                {evidenceOptions.tasks.map((task) => <label key={task.id} className="flex cursor-pointer items-start gap-2 py-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={form.task_ids.includes(task.id)} onChange={() => toggleEvidence('task_ids', task.id)} /><span className="min-w-0 whitespace-pre-wrap break-words leading-6">{task.title}{task.accepted_at&&<span className="ml-2 text-xs text-emerald-700">Đã nghiệm thu</span>}</span></label>)}
                {evidenceLoading?<p role="status" className="py-4 text-sm text-slate">Đang tải công việc...</p>:!evidenceOptions.tasks.length&&<p className="py-4 text-sm text-slate">Chưa có công việc khả dụng.</p>}
              </div>
            </details>}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Nhận xét</label>
              <textarea rows={4} maxLength={10000} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })}
                className="ui-field resize-y leading-6" />
            </div>

            {error && <div className="text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

            </fieldset><div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white py-3">
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="ui-button ui-button-secondary">Huỷ</button>
              <button type="submit" disabled={saving||evidenceLoading} className="ui-button ui-button-primary">{saving ? 'Đang lưu...' : editing?'Lưu thay đổi':'Lưu đánh giá'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}

export default function KpiPage() {
  return (
    <ProtectedRoute>
      <KpiContent />
    </ProtectedRoute>
  );
}
