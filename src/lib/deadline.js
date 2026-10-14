const DAY = 86400000;

export function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function deadlineAlert(task, now = new Date()) {
  if (task.deleted_at || task.status === 'done' || task.status === 'cancelled') return null;
  if (!task.due_date) return { kind: 'missing', label: 'Chưa có hạn chót', days: null };
  const today = vietnamToday(now);
  const days = Math.round((Date.parse(`${task.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  if (task.status === 'review') return { kind: 'review', label: days < 0 ? `Chờ nghiệm thu ${-days} ngày sau hạn` : 'Chờ quản lý nghiệm thu', days };
  if (days < 0) return { kind: 'overdue', label: `Quá hạn ${-days} ngày`, days };
  if (days === 0) return { kind: 'today', label: 'Đến hạn hôm nay', days };
  if (days === 1 || days === 3) return { kind: 'upcoming', label: `Còn ${days} ngày`, days };
  if (task.planned_progress_date && task.planned_progress != null && task.planned_progress_date <= today && Number(task.progress) < Number(task.planned_progress)) {
    return { kind: 'behind', label: `Chậm mốc tiến độ ${task.planned_progress}%`, days };
  }
  return null;
}
