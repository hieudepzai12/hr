'use client';

import { useRef, useState } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Avatar from '@/components/Avatar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABEL = { admin: 'Quản trị viên', manager: 'Quản lý', employee: 'Nhân viên' };

function ProfileContent() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post(`/employees/${user.id}/avatar`, formData);
      updateUser({ avatar_path: data.avatar_path });
    } catch (err) {
      setError(err.response?.data?.error || 'Tải ảnh thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!confirm('Xoá ảnh đại diện hiện tại?')) return;
    setError('');
    try {
      await api.delete(`/employees/${user.id}/avatar`);
      updateUser({ avatar_path: null });
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể xoá ảnh');
    }
  };

  return (
    <Layout title="Hồ sơ của tôi" subtitle="Thông tin tài khoản và ảnh đại diện">
      <div className="max-w-lg bg-paper-raised rounded-lg border border-line p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar name={user.full_name} color={user.avatar_color} avatarPath={user.avatar_path} size={72} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-teal hover:bg-teal-dark text-white flex items-center justify-center border-2 border-paper-raised transition-colors focus-ring disabled:opacity-60"
              title="Đổi ảnh đại diện"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-ink">{user.full_name}</div>
            <div className="text-sm text-slate">{user.email}</div>
            <div className="text-xs text-slate mt-1">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>

        {error && <div className="mt-4 text-sm text-clay bg-[#F1DAD5] px-3 py-2 rounded-md">{error}</div>}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm px-3.5 py-2 rounded-md border border-line hover:border-teal hover:text-teal transition-colors focus-ring disabled:opacity-60"
          >
            Tải ảnh mới
          </button>
          {user.avatar_path && (
            <button onClick={removeAvatar} className="text-sm text-clay flex items-center gap-1.5 hover:underline">
              <Trash2 size={14} /> Xoá ảnh
            </button>
          )}
        </div>
        <p className="text-xs text-slate mt-3">Định dạng PNG, JPG, WEBP hoặc GIF — tối đa 3MB.</p>
      </div>
    </Layout>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
