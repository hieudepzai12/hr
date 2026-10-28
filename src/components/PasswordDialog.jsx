'use client';

import { useRef, useState } from 'react';
import Modal from './Modal';
import api from '@/lib/api';
import useFeedback from '@/lib/useFeedback';
import { useAuth } from '@/context/AuthContext';

export default function PasswordDialog({ employee, onClose, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useFeedback('error');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const close = () => { if (!lock.current) onClose(); };
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    setError('');
    if (form.new_password !== form.confirm_password) {
      setError('Xác nhận mật khẩu mới không khớp.'); return;
    }
    lock.current = true; setSaving(true);
    try {
      if (employee) await api.post(`/employees/${employee.id}/reset-password`, { new_password: form.new_password });
      else await api.post('/auth/change-password', { current_password: form.current_password, new_password: form.new_password });
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      onClose(); onSaved();
    } catch (err) { setError(err.response?.data?.error || 'Không thể cập nhật mật khẩu.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Modal title={employee ? `Đặt lại mật khẩu: ${employee.full_name}` : 'Đổi mật khẩu cá nhân'} onClose={close}>
    <form onSubmit={submit} aria-busy={saving} className="space-y-4">
      <fieldset disabled={saving} className="space-y-4">
        {!employee && user.role !== 'admin' && <label className="block text-sm font-medium" htmlFor="current-password">Mật khẩu hiện tại<input id="current-password" type="password" autoComplete="current-password" required maxLength={1024} value={form.current_password} onChange={event=>setForm({...form,current_password:event.target.value})} className="ui-field mt-1" /></label>}
        <label className="block text-sm font-medium" htmlFor="new-password">Mật khẩu mới<input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} value={form.new_password} onChange={event=>setForm({...form,new_password:event.target.value})} className="ui-field mt-1" /><span className="mt-1 block text-xs font-normal text-slate">Ít nhất 8 ký tự.</span></label>
        <label className="block text-sm font-medium" htmlFor="confirm-password">Xác nhận mật khẩu mới<input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} value={form.confirm_password} onChange={event=>setForm({...form,confirm_password:event.target.value})} className="ui-field mt-1" /></label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-3"><button type="button" disabled={saving} onClick={close} className="ui-button ui-button-secondary">Hủy</button><button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving?'Đang lưu…':'Lưu mật khẩu'}</button></div>
    </form>
  </Modal>;
}
