'use client';

import { CalendarDays, CheckCheck, Circle, Clock3, LoaderCircle, UserRound } from 'lucide-react';
import { PriorityBadge } from './Badges';

const stages = [
  { key: 'todo', label: 'Chưa bắt đầu', icon: Circle, color: '#64748b', tint: '#f1f5f9' },
  { key: 'in_progress', label: 'Đang thực hiện', icon: LoaderCircle, color: '#2563eb', tint: '#eff6ff' },
  { key: 'review', label: 'Chờ nghiệm thu', icon: Clock3, color: '#a16207', tint: '#fffbeb' },
  { key: 'done', label: 'Đã nghiệm thu', icon: CheckCheck, color: '#15803d', tint: '#f0fdf4' },
];
const dateText = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : 'Chưa đặt hạn';

export default function TaskProgressBoard({ tasks, onOpen }) {
  return <div className="min-w-0 space-y-3">
    <p className="text-xs text-slate">{tasks.length} công việc đã tải · Chọn thẻ để xem chi tiết</p>
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stages.map(stage => {
        const items = tasks.filter(task => task.status === stage.key);
        const Icon = stage.icon;
        return <section key={stage.key} aria-label={stage.label} className="min-w-0 overflow-hidden rounded-xl border border-line bg-[#f8fafc]">
          <header className="flex items-center gap-2 border-b border-line bg-white px-3 py-3" style={{ borderTop: `3px solid ${stage.color}` }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: stage.tint, color: stage.color }}><Icon size={16} aria-hidden="true" /></span>
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-ink">{stage.label}</h2>
            <span className="rounded-md px-2 py-1 text-xs font-semibold" style={{ backgroundColor: stage.tint, color: stage.color }}>{items.length}</span>
          </header>
          <div className="space-y-3 p-3">
            {!items.length && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-slate">Chưa có công việc</p>}
            {items.map(task => {
              const overdue = task.alert?.kind === 'overdue';
              const hasAlert = task.alert && task.alert.kind !== 'missing';
              return <button key={task.id} type="button" onClick={() => onOpen(task)} className="group block w-full min-w-0 rounded-xl border border-line bg-white p-3.5 text-left shadow-sm transition hover:border-[#93b4df] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-slate">CV-{task.id}</span><PriorityBadge priority={task.priority} /></div>
                <h3 className="break-words text-sm font-semibold leading-6 text-ink group-hover:text-[#1d4f95]">{task.title}</h3>
                {task.customer_name && <p className="mt-1 break-words text-xs leading-5 text-slate">{task.customer_name}</p>}
                <div className="my-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="text-slate">Tiến độ</span><strong style={{ color: stage.color }}>{task.progress || 0}%</strong></div>
                  <div role="progressbar" aria-label={`Tiến độ ${task.title}`} aria-valuenow={task.progress || 0} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-[#e8edf4]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(task.progress) || 0))}%`, backgroundColor: stage.color }} /></div>
                </div>
                <div className="space-y-2 border-t border-[#eef2f6] pt-3 text-xs text-slate">
                  <div className="flex items-start gap-2"><UserRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{task.assignee_name || 'Chưa có người thực hiện'}{task.collaborator_ids?.length > 0 && <span className="block pt-0.5">+{task.collaborator_ids.length} người phối hợp</span>}</span></div>
                  <div className="flex items-center gap-2"><CalendarDays size={14} className="shrink-0" aria-hidden="true" /><span>{dateText(task.due_date)}</span></div>
                </div>
                {hasAlert && <p className="mt-3 rounded-md px-2.5 py-2 text-xs font-medium leading-5" style={{ backgroundColor: overdue ? '#fff1f2' : stage.key === 'done' ? stage.tint : '#fffbeb', color: overdue ? '#b91c1c' : stage.key === 'done' ? stage.color : '#92400e' }}>{task.alert.label}</p>}
              </button>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
