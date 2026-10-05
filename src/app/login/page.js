'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await login(email, password);
    if (res.success) router.push('/');
    else setError(res.error);
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-paper-raised rounded-xl overflow-hidden shadow-2xl">
        <div className="hidden md:flex flex-col justify-between bg-ink-light p-10 text-white">
          <div>
            <div className="font-display italic text-3xl mb-2">NhanSu</div>
            <p className="text-white/60 text-sm leading-relaxed">Hệ thống quản lý nhân sự nội bộ</p>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <div className="flex gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 shrink-0" />
              Theo dõi công việc và hạn chót theo thời gian thực
            </div>
            <div className="flex gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 shrink-0" />
              Gửi và duyệt báo cáo định kỳ
            </div>
            <div className="flex gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 shrink-0" />
              Đánh giá hiệu suất KPI minh bạch
            </div>
          </div>
          <p className="text-xs text-white/30">© 2026 NhanSu</p>
        </div>

        <div className="p-10">
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Đăng nhập</h1>
          <p className="text-sm text-slate mb-6">Nhập thông tin tài khoản của bạn để tiếp tục</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@company.vn"
                className="w-full px-3.5 py-2.5 rounded-md border border-line bg-white text-sm focus-ring focus:border-teal outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Mật khẩu</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-md border border-line bg-white text-sm focus-ring focus:border-teal outline-none"
              />
            </div>

            {error && (
              <div className="text-sm text-clay bg-[#F1DAD5] px-3.5 py-2.5 rounded-md">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal hover:bg-teal-dark text-white text-sm font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2 focus-ring disabled:opacity-60"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
