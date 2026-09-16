'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Building2, ClipboardList, AlertTriangle, ArrowUpRight } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { TaskStatusBadge, ReportStatusBadge } from '@/components/Badges';
import { format, differenceInCalendarDays } from 'date-fns';

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-paper-raised rounded-lg border border-line p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: accent + '22' }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      <div className="font-display text-2xl font-semibold text-ink">{value}</div>
      <div className="text-sm text-slate mt-0.5">{label}</div>
    </div>
  );
}

function DashboardContent() {
  const { user, isManager } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/dashboard/stats').then(({ data }) => setStats(data));
  }, []);

  if (!stats) return <Layout title="Tổng quan"><div className="text-slate text-sm">Đang tải...</div></Layout>;

  const statusCount = (arr, key) => arr.find(s => s.status === key)?.c || 0;

  return (
    <Layout title={`Chào ${user.full_name.split(' ').pop()}`} subtitle={format(new Date(), "'Hôm nay là' dd/MM/yyyy")}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isManager && <StatCard icon={Users} label="Nhân viên đang làm việc" value={stats.totalEmployees} accent="#3F7069" />}
        {isManager && <StatCard icon={Building2} label="Phòng ban" value={stats.totalDepartments} accent="#5B5F97" />}
        <StatCard icon={ClipboardList} label="Công việc đang thực hiện" value={statusCount(stats.tasksByStatus, 'in_progress')} accent="#D98E3F" />
        <StatCard icon={AlertTriangle} label="Công việc quá hạn" value={stats.overdueTasks} accent="#B85C4A" />
        {isManager && <StatCard icon={ClipboardList} label="Báo cáo chờ duyệt" value={stats.pendingReports ?? 0} accent="#8A9B6E" />}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-paper-raised rounded-lg border border-line">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="font-display font-semibold text-ink">Hạn chót sắp tới</h2>
            <Link href="/timeline" className="text-xs text-teal hover:underline flex items-center gap-1">
              Xem tất cả <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {stats.upcomingDeadlines.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate">Không có hạn chót nào sắp tới.</p>
            )}
            {stats.upcomingDeadlines.map((task) => {
              const days = differenceInCalendarDays(new Date(task.due_date), new Date());
              return (
                <div key={task.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{task.title}</div>
                    <div className="text-xs text-slate mt-0.5">{task.assignee_name || 'Chưa giao'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TaskStatusBadge status={task.status} />
                    <span className={`text-xs font-medium ${days <= 2 ? 'text-clay' : 'text-slate'}`}>
                      {days === 0 ? 'Hôm nay' : days < 0 ? 'Quá hạn' : `Còn ${days} ngày`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-paper-raised rounded-lg border border-line">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="font-display font-semibold text-ink">Báo cáo gần đây</h2>
            <Link href="/bao-cao" className="text-xs text-teal hover:underline flex items-center gap-1">
              Xem tất cả <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {stats.recentReports.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate">Chưa có báo cáo nào.</p>
            )}
            {stats.recentReports.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{r.title}</div>
                  <div className="text-xs text-slate mt-0.5">{r.employee_name} · {format(new Date(r.created_at), 'dd/MM/yyyy')}</div>
                </div>
                <ReportStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
