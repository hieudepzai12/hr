'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock, CheckCheck, CircleAlert, ClipboardList, FileText } from 'lucide-react';
import api, { getTaskAlerts } from '@/lib/api';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { ReportStatusBadge, TaskStatusBadge } from '@/components/Badges';
import { deadlineAlert, vietnamToday } from '@/lib/deadline';
import { scopeFor } from '@/lib/access';
import ManagementInsights from '@/components/ManagementInsights';

const dateText = (value) => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const dateOnlyText = (value) => value ? value.split('-').reverse().join('/') : '—';

function StatCard({ label, value, icon: Icon, tone, href, caption }) {
  return <Link href={href} className="ui-card group flex min-h-[76px] w-full min-w-0 max-w-full items-center justify-between gap-3 p-3 transition-shadow hover:shadow-md focus-ring sm:min-h-[136px] sm:flex-col sm:items-stretch sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-2"><span className="text-sm font-medium text-slate">{label}</span><span className={`hidden shrink-0 rounded-lg p-2 sm:inline-flex ${tone}`}><Icon size={18} /></span></div>
    <div className="shrink-0 text-right sm:text-left"><div className="text-2xl font-bold leading-none tracking-tight text-ink sm:text-[28px]">{value}</div><div className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-teal sm:mt-2 sm:justify-start"><span className="sm:hidden">Xem</span><span className="hidden sm:inline">{caption || 'Xem danh sách'}</span><ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5" /></div></div>
  </Link>;
}

function DashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api.get('/dashboard/stats'), getTaskAlerts(user.id).catch(() => ({ data: { alerts: [] } }))])
      .then(([stats, alerts]) => { if (active) setData({ stats: stats.data, alerts: alerts.data.alerts || [] }); })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'Không tải được dữ liệu tổng quan'); });
    return () => { active = false; };
  }, [user.id]);
  const today = vietnamToday();
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const overdueTo = yesterday.toISOString().slice(0, 10);
  const firstName = user.full_name?.trim().split(' ').pop() || 'bạn';
  if (error) return <Layout title="Tổng quan" subtitle="Tình hình công việc theo phạm vi quyền của bạn"><div role="alert" className="ui-notice">{error}</div></Layout>;
  if (!data) return <Layout title="Tổng quan" subtitle="Tình hình công việc theo phạm vi quyền của bạn"><div role="status" className="ui-card p-6 text-sm text-slate">Đang tải dữ liệu tổng quan...</div></Layout>;
  const { stats, alerts } = data;
  const count = (key) => stats.tasksByStatus.find((item) => item.status === key)?.c || 0;
  const upcoming = alerts.filter((item) => ['upcoming', 'today'].includes(item.alert.kind));
  const actionable = alerts.filter((item) => ['overdue', 'today', 'review', 'behind'].includes(item.alert.kind));
  const canApproveReports = scopeFor(user, 'reports', 'approve') !== 'none';
  return <Layout title={`Xin chào, ${firstName}`} subtitle={`Tổng quan ngày ${dateOnlyText(today)} · dữ liệu theo quyền truy cập của bạn`}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
      <StatCard label="Đang thực hiện" value={count('in_progress')} icon={ClipboardList} tone="bg-[#dbeafe] text-[#1d4f95]" href="/timeline?status=in_progress" />
      <StatCard label="Sắp đến hạn" value={alerts.length === 300 ? `${upcoming.length}+` : upcoming.length} icon={CalendarClock} tone="bg-[#fff0cb] text-[#895600]" href={`/timeline?from=${today}`} caption="Xem hạn chót" />
      <StatCard label="Quá hạn" value={stats.overdueTasks} icon={CircleAlert} tone="bg-[#fee2e5] text-[#a32639]" href={`/timeline?to=${overdueTo}`} />
      {canApproveReports && <StatCard label="Báo cáo chờ duyệt" value={stats.pendingReports ?? 0} icon={FileText} tone="bg-[#e3edfc] text-[#244b80]" href="/bao-cao?status=submitted" />}
    </div>

    <ManagementInsights compact />
    <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="ui-card w-full min-w-0 max-w-full overflow-hidden"><div className="flex flex-col items-start gap-2 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"><div className="min-w-0"><h2 className="section-heading mb-0">Việc cần xử lý</h2><p className="mt-0.5 text-xs text-slate">Quá hạn, đến hạn, chờ nghiệm thu hoặc chậm mốc tiến độ</p></div><Link href="/timeline" className="shrink-0 text-xs font-semibold text-teal hover:underline">Xem tất cả</Link></div>
        {!actionable.length ? <div className="ui-empty"><CheckCheck size={25} className="mx-auto mb-2 text-sage" />Chưa có việc cần xử lý.</div> : <div className="divide-y divide-line">{actionable.slice(0, 6).map((task) => <Link href="/timeline" key={task.id} className="flex min-w-0 flex-col items-start gap-1 px-3 py-3 hover:bg-paper sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"><span className="min-w-0 max-w-full"><span className="block break-words text-sm font-semibold text-ink sm:truncate">#{task.id} {task.title}</span><span className="text-xs text-slate">Hạn: {dateOnlyText(task.due_date)}</span></span><span className={`max-w-full break-words text-xs font-semibold sm:shrink-0 ${task.alert.kind === 'overdue' ? 'text-clay' : task.alert.kind === 'review' ? 'text-teal' : 'text-amber-dark'}`}>{task.alert.label}</span></Link>)}</div>}
      </section>
      <section className="ui-card w-full min-w-0 max-w-full overflow-hidden"><div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3 sm:px-5 sm:py-4"><h2 className="section-heading mb-0">Hạn chót sắp tới</h2><Link href="/timeline" className="shrink-0 text-xs font-semibold text-teal hover:underline">Xem tất cả</Link></div>
        {!stats.upcomingDeadlines.length ? <div className="ui-empty">Không có hạn chót sắp tới.</div> : <div className="divide-y divide-line">{stats.upcomingDeadlines.map((task) => { const alert = deadlineAlert(task); return <Link href="/timeline" key={task.id} className="flex min-w-0 flex-col items-start gap-2 px-3 py-3 hover:bg-paper sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"><span className="min-w-0 max-w-full"><span className="block break-words text-sm font-semibold text-ink sm:truncate">{task.title}</span><span className="text-xs text-slate">{task.assignee_name || 'Chưa giao'} · {dateOnlyText(task.due_date)}</span></span><span className="text-left sm:text-right"><TaskStatusBadge status={task.status} />{alert && <span className="mt-1 block text-xs font-medium text-amber-dark">{alert.label}</span>}</span></Link>; })}</div>}
      </section>
    </div>
    <section className="ui-card mt-5 w-full min-w-0 max-w-full overflow-hidden"><div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3 sm:px-5 sm:py-4"><h2 className="section-heading mb-0">Báo cáo gần đây</h2><Link href="/bao-cao" className="shrink-0 text-xs font-semibold text-teal hover:underline">Xem báo cáo</Link></div>
      {!stats.recentReports.length ? <div className="ui-empty">Chưa có báo cáo trong phạm vi được xem.</div> : <div className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0">{stats.recentReports.map((report) => <Link href="/bao-cao" key={report.id} className="flex min-w-0 flex-col items-start gap-2 border-b border-line px-3 py-3 hover:bg-paper sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"><span className="min-w-0 max-w-full"><span className="block break-words text-sm font-semibold sm:truncate">{report.title}</span><span className="text-xs text-slate">{report.employee_name} · {dateText(report.created_at)}</span></span><ReportStatusBadge status={report.status} /></Link>)}</div>}
    </section>
  </Layout>;
}

export default function DashboardPage() { return <ProtectedRoute><DashboardContent /></ProtectedRoute>; }
