import { vietnamToday } from './deadline.js';

const DAY = 86400000;

// Display state only: do not overwrite the stored project lifecycle or infer completion from dates.
export function projectStatus(project, now = new Date()) {
  if (project.auto_completed === true) return { kind: 'completed', label: 'Hoàn thành', tone: 'bg-green-50 text-green-800' };
  const today = vietnamToday(now);
  const end = project.end_date ? String(project.end_date).slice(0, 10) : '';
  if (end && end < today) {
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / DAY);
    return { kind: 'late', label: `Chậm ${days} ngày`, tone: 'bg-red-50 text-red-800' };
  }
  if (project.status === 'on_hold') return { kind: 'on_hold', label: 'Tạm dừng', tone: 'bg-amber-50 text-amber-900' };
  if (end === today) return { kind: 'today', label: 'Đến hạn hôm nay', tone: 'bg-amber-50 text-amber-900' };
  if (project.status === 'active' || (project.start_date && String(project.start_date).slice(0, 10) <= today)) {
    return { kind: 'active', label: 'Đang thực hiện', tone: 'bg-blue-50 text-blue-800' };
  }
  return { kind: 'planned', label: 'Chưa bắt đầu', tone: 'bg-paper text-slate' };
}
