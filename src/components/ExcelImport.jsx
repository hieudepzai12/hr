'use client';

import { useState } from 'react';
import api from '@/lib/api';
import Modal from './Modal';

const inputClass = 'w-full rounded border border-line bg-white px-2 py-1 text-xs';

export default function ExcelImport({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [allowMissingDue, setAllowMissingDue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setRow = (key, patch) => setOverrides((current) => ({ ...current,
    [key]: { ...current[key], ...patch },
  }));
  const send = async (action) => {
    if (!file) { setError('Chọn file Excel trước'); return; }
    setBusy(true); setError('');
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('action', action);
      data.append('overrides', JSON.stringify(overrides));
      data.append('allow_missing_due', String(allowMissingDue));
      const response = await api.post('/tasks/import', data);
      if (action === 'preview') setPreview(response.data);
      else { onImported(response.data); onClose(); }
    } catch (err) { setError(err.response?.data?.error || 'Không đọc được file Excel'); }
    finally { setBusy(false); }
  };
  return <Modal title="Nhập công việc từ Excel" onClose={onClose} width="max-w-6xl">
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-line bg-paper p-4">
        <p className="font-semibold text-ink">1. Tải mẫu và điền dữ liệu</p>
        <p className="mt-1 text-slate">Mỗi dòng là một công việc. Nhập đúng họ tên nhân viên và tên hoặc mã khách hàng. Người phối hợp ghi cùng ô Người thực hiện, ngăn cách bằng dấu +. Hạn chót dùng dd/mm/yyyy; tiến độ là số nguyên 0–100.</p>
        <a href="/mau-import-cong-viec.xlsx" download="mau-import-cong-viec.xlsx" className="ui-button ui-button-secondary mt-3">Tải mẫu Excel (.xlsx)</a>
      </div>
      <div className="space-y-2"><label htmlFor="task-import-file" className="block font-semibold text-ink">2. Chọn file đã điền</label><input id="task-import-file" type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setOverrides({}); }} className="ui-field h-auto file:mr-3 file:rounded file:border-0 file:bg-paper file:px-2 file:py-1 file:text-sm file:font-semibold" /><p className="text-xs text-slate">Tối đa 5 MB và 500 dòng. Xem trước để đối chiếu người, khách hàng, hạn chót trước khi nhập; dòng trùng được bỏ qua.</p></div>
      <button type="button" disabled={busy || !file} onClick={() => send('preview')} className="ui-button ui-button-primary">{busy ? 'Đang xử lý...' : preview ? 'Kiểm tra lại đối chiếu' : '3. Xem trước dữ liệu'}</button>
      {preview && <>
        <div className="text-slate">{preview.rows.length} dòng công việc. Dòng trùng được bỏ qua; dòng có lỗi cần sửa hoặc chọn Bỏ qua.</div>
        <div className="max-h-[55vh] overflow-auto border border-line rounded">
          <table className="w-full min-w-[1250px] text-xs"><thead className="sticky top-0 bg-paper"><tr>
            <th className="p-2 text-left">Nguồn</th><th className="p-2 text-left">Công việc</th><th className="p-2 text-left">Người phụ trách</th>
            <th className="p-2 text-left">Người phối hợp</th><th className="p-2 text-left">Phòng ban</th><th className="p-2 text-left">Khách hàng</th><th className="p-2 text-left">Hạn chót</th>
            <th className="p-2 text-left">Tiến độ</th><th className="p-2 text-left">Kiểm tra</th><th className="p-2">Bỏ qua</th>
          </tr></thead><tbody>{preview.rows.map((row) => <tr key={row.source_key} className="border-t border-line align-top">
            <td className="p-2">{row.sheet}!{row.row}</td><td className="p-2">{row.title}</td>
            <td className="p-2"><div className="mb-1 text-slate">{row.assignee_name || 'Thiếu tên'}</div><select className={inputClass} value={overrides[row.source_key]?.assignee_id || row.assignee_id || ''} onChange={(e) => setRow(row.source_key, { assignee_id: e.target.value })}><option value="">Chọn người</option>{preview.employees.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></td>
            <td className="p-2"><select multiple className={inputClass} value={(overrides[row.source_key]?.collaborator_ids || row.collaborator_ids || []).map(String)} onChange={(e) => setRow(row.source_key, { collaborator_ids: [...e.target.selectedOptions].map((option) => Number(option.value)) })}>{preview.employees.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><span className="text-[10px] text-slate">Giữ Ctrl để chọn nhiều người</span></td>
            <td className="p-2"><select className={inputClass} value={overrides[row.source_key]?.department_id || row.department_id || ''} onChange={(e) => setRow(row.source_key, { department_id: e.target.value })}><option value="">Chọn phòng</option>{preview.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></td>
            <td className="p-2"><div className="mb-1 text-slate">{row.customer_name || '—'}</div><select className={inputClass} value={overrides[row.source_key]?.customer_id || row.customer_id || ''} onChange={(e) => setRow(row.source_key, { customer_id: e.target.value })}><option value="">Không có</option>{preview.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}</select></td>
            <td className="p-2"><input className={inputClass} type="date" value={overrides[row.source_key]?.due_date ?? row.due_date ?? ''} onChange={(e) => setRow(row.source_key, { due_date: e.target.value })} /></td>
            <td className="p-2">{row.progress ?? 0}%{row.confirm_fraction && <label className="block whitespace-nowrap"><input type="checkbox" checked={Boolean(overrides[row.source_key]?.progress_confirmed)} onChange={(e) => setRow(row.source_key, { progress_confirmed: e.target.checked })} /> Xác nhận 0.x = %</label>}</td>
            <td className="p-2 text-clay">{row.issues.join('; ') || 'Sẵn sàng'}</td>
            <td className="p-2 text-center"><input type="checkbox" checked={Boolean(overrides[row.source_key]?.skip)} onChange={(e) => setRow(row.source_key, { skip: e.target.checked })} /></td>
          </tr>)}</tbody></table>
        </div>
        <label className="block text-xs"><input type="checkbox" checked={allowMissingDue} onChange={(e) => setAllowMissingDue(e.target.checked)} /> Cho phép nhập dòng chưa có hạn chót</label>
        <button type="button" disabled={busy} onClick={() => send('commit')} className="ui-button ui-button-primary">{busy ? 'Đang nhập...' : '4. Xác nhận nhập'}</button>
      </>}
      {error && <p role="alert" className="text-clay">{error}</p>}
    </div>
  </Modal>;
}
