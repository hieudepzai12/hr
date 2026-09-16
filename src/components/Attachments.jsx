'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Loader2, Upload } from 'lucide-react';
import api from '@/lib/api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * kind: 'reports' | 'tasks'
 * entityId: id của báo cáo/công việc (bắt buộc phải đã tồn tại trên server)
 * canManage: có được phép tải lên / xoá không
 */
export default function Attachments({ kind, entityId, canManage = true }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.get(`/${kind}/${entityId}/attachments`)
      .then(({ data }) => setFiles(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (entityId) load(); }, [entityId, kind]);

  const handleUpload = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      selected.forEach((f) => formData.append('files', f));
      await api.post(`/${kind}/${entityId}/attachments`, formData);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Tải file thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const download = async (att) => {
    try {
      const res = await api.get(`/${kind}/${entityId}/attachments/${att.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Không thể tải file này');
    }
  };

  const remove = async (att) => {
    if (!confirm(`Xoá file "${att.original_name}"?`)) return;
    await api.delete(`/${kind}/${entityId}/attachments/${att.id}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-ink flex items-center gap-1.5">
          <Paperclip size={13} /> File đính kèm
        </label>
        {canManage && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-teal hover:underline flex items-center gap-1 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Tải file lên
          </button>
        )}
        <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>

      {error && <div className="text-xs text-clay bg-[#F1DAD5] px-2.5 py-1.5 rounded mb-2">{error}</div>}

      {loading ? (
        <p className="text-xs text-slate">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-slate">Chưa có file đính kèm.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((att) => (
            <div key={att.id} className="flex items-center justify-between gap-2 bg-paper border border-line rounded-md px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-ink truncate">{att.original_name}</div>
                <div className="text-[11px] text-slate">{formatSize(att.size)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => download(att)} className="p-1.5 text-slate hover:text-teal transition-colors focus-ring rounded" title="Tải xuống">
                  <Download size={14} />
                </button>
                {canManage && (
                  <button type="button" onClick={() => remove(att)} className="p-1.5 text-slate hover:text-clay transition-colors focus-ring rounded" title="Xoá">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
