// Numeric progress is retained for old records and integrations.
export function progressText(task) {
  return task.progress_text?.trim() || (task.progress != null && Number(task.progress) > 0 ? `${task.progress}%` : '—');
}
