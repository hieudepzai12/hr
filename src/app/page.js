'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock, CheckCheck, ChevronDown, CircleAlert, ClipboardList, FileText } from 'lucide-react';
import api, { getTaskAlerts } from '@/lib/api';
import useFeedback from '@/lib/useFeedback';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { WorkReportStatusBadge as ReportStatusBadge } from '@/components/Badges';
import { deadlineAlert, vietnamToday } from '@/lib/deadline';
import { scopeFor } from '@/lib/access';

const dateText = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

function StatCard({ label, value, icon: Icon, tone, href }) {
  return <Link href={href} className="ui-card group min-w-0 p-3 transition-shadow hover:shadow-md sm:p-4">
    <div className="mb-3 flex items-start justify-between gap-2"><span className="min-w-0 text-xs font-medium leading-5 text-slate sm:text-sm">{label}</span><Icon size={17} className={`shrink-0 ${tone}`} aria-hidden="true"/></div>
    <div className="flex items-end justify-between gap-2"><strong className="text-2xl leading-none tracking-tight sm:text-3xl">{value}</strong><ArrowUpRight size={16} className="shrink-0 text-slate group-hover:text-teal" aria-hidden="true"/></div>
  </Link>;
}

function PreviewSection({ title, href, empty, children }) {
  return <section className="ui-card min-w-0 overflow-hidden" aria-label={title}>
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Link href={href} className="shrink-0 text-xs font-semibold text-teal hover:underline">Xem tất cả</Link></header>
    {children || <div className="flex min-h-28 items-center justify-center gap-2 px-4 py-5 text-sm text-slate"><CheckCheck size={18} className="shrink-0 text-sage" aria-hidden="true"/>{empty}</div>}
  </section>;
}

function TaskPreview({ task, caption, warning }) {
  return <Link href="/timeline" className="block min-w-0 border-b border-line px-4 py-3 last:border-b-0 hover:bg-paper">
    <span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-ink" title={task.title}>{task.title}</span>
    <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"><span className="min-w-0 break-words text-slate">{caption}</span>{warning&&<span className={warning.kind==='overdue'?'font-medium text-clay':warning.kind==='review'?'font-medium text-teal':'font-medium text-amber-dark'}>{warning.label}</span>}</span>
  </Link>;
}

function DashboardContent() {
  const { user } = useAuth();
  const canViewTasks = scopeFor(user, 'tasks', 'view') !== 'none';
  const canViewReports = scopeFor(user, 'reports', 'view') !== 'none';
  const [data, setData] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useFeedback('error');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const alerts = canViewTasks ? getTaskAlerts(user.id).then(({data})=>({alerts:data.alerts||[],alertsUnavailable:false})).catch(()=>({alerts:[],alertsUnavailable:true})) : Promise.resolve({alerts:[],alertsUnavailable:false});
    Promise.all([api.get('/dashboard/stats',{signal:controller.signal}), alerts])
      .then(([stats, alerts])=>{if(active)setData({stats:stats.data,...alerts});})
      .catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được dữ liệu tổng quan');});
    return ()=>{active=false;controller.abort();};
  },[user.id,canViewTasks,setError,revision]);
  const retry = ()=>{setError('');setData(null);setRevision(value=>value+1);};
  const today = vietnamToday();
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const subtitle = `Ngày ${dateText(today)}`;
  if(error)return <Layout title="Tổng quan" subtitle={subtitle}><div role="alert" className="ui-notice">{error}<button type="button" onClick={retry} className="ml-3 font-semibold underline">Thử lại</button></div></Layout>;
  if(!data)return <Layout title="Tổng quan" subtitle={subtitle}><div role="status" className="ui-card p-6 text-sm text-slate">Đang tải dữ liệu tổng quan…</div></Layout>;
  const {stats,alerts,alertsUnavailable}=data;
  const upcoming=alerts.filter(task=>['upcoming','today'].includes(task.alert.kind));
  const actionable=alerts.filter(task=>['overdue','today','review','behind'].includes(task.alert.kind));
  const inProgress=stats.tasksByStatus.find(item=>item.status==='in_progress')?.c||0;
  const canViewInsights=scopeFor(user,'insights','view')!=='none';
  return <Layout title="Tổng quan" subtitle={subtitle}>
    <div className="dashboard-overview space-y-4">
      {(canViewTasks||canViewReports)&&<div aria-label="Chỉ số công việc" className={`grid min-w-0 grid-cols-2 gap-3 ${canViewTasks?(canViewReports?'lg:grid-cols-4':'lg:grid-cols-3'):''}`}>
        {canViewTasks&&<><StatCard label="Đang thực hiện" value={inProgress} icon={ClipboardList} tone="text-blue-700" href="/timeline?status=in_progress"/>
          <StatCard label="Sắp đến hạn" value={alertsUnavailable?'—':`${upcoming.length}${alerts.length===300?'+':''}`} icon={CalendarClock} tone="text-amber-dark" href={`/timeline?from=${today}`}/>
          <StatCard label="Quá hạn" value={stats.overdueTasks} icon={CircleAlert} tone="text-clay" href={`/timeline?to=${yesterday.toISOString().slice(0,10)}`}/></>}
        {canViewReports&&<StatCard label="Báo cáo đã gửi" value={stats.submittedReports??0} icon={FileText} tone="text-teal" href="/bao-cao?status=submitted"/>}
      </div>}
      {canViewTasks&&<div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <PreviewSection title="Việc cần xử lý" href="/timeline" empty="Chưa có việc cần xử lý.">
          {alertsUnavailable?<div role="alert" className="p-4 text-sm text-slate">Chưa tải được cảnh báo. <button type="button" onClick={retry} className="font-semibold text-teal underline">Thử lại</button></div>:actionable.length>0&&actionable.slice(0,3).map(task=><TaskPreview key={task.id} task={task} caption={`Hạn: ${dateText(task.due_date)}`} warning={task.alert}/>) }
        </PreviewSection>
        <PreviewSection title="Hạn chót sắp tới" href={`/timeline?from=${today}`} empty="Chưa có hạn chót sắp tới.">
          {stats.upcomingDeadlines.length>0&&stats.upcomingDeadlines.slice(0,3).map(task=><TaskPreview key={task.id} task={task} caption={`${dateText(task.due_date)} · ${task.assignee_name||'Chưa có người phụ trách'}`} warning={deadlineAlert(task)}/>)}
        </PreviewSection>
      </div>}
      {canViewReports&&<details className="ui-card group" data-dashboard-reports>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold"><span className="flex items-center gap-2"><FileText size={17} className="text-slate" aria-hidden="true"/>Báo cáo gần đây</span><ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true"/></summary>
        <div className="border-t border-line">
          {stats.recentReports.length?stats.recentReports.slice(0,3).map(report=><Link key={report.id} href="/bao-cao" className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 hover:bg-paper"><span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-medium">{report.title}</span><span className="mt-1 block break-words text-xs text-slate">{report.employee_name} · {new Date(report.created_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</span></span><ReportStatusBadge status={report.status}/></Link>):<p className="p-4 text-sm text-slate">Chưa có báo cáo trong phạm vi được xem.</p>}
          <Link href="/bao-cao" className="block px-4 py-3 text-sm font-semibold text-teal hover:underline">Xem tất cả báo cáo</Link>
        </div>
      </details>}
      {canViewInsights&&<div className="flex min-w-0 justify-end px-1 text-xs"><Link href="/bao-cao-quan-tri" className="inline-flex items-center gap-1 font-semibold text-teal hover:underline">Báo cáo quản trị<ArrowUpRight size={14} aria-hidden="true"/></Link></div>}
      {!canViewTasks&&!canViewReports&&!canViewInsights&&<p className="ui-card p-5 text-sm text-slate">Chưa có phân hệ được cấp quyền để hiển thị tổng quan.</p>}
    </div>
  </Layout>;
}

export default function DashboardPage(){return <ProtectedRoute><DashboardContent/></ProtectedRoute>;}
