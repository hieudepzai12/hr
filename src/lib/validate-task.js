const STATUSES = new Set(['todo', 'in_progress', 'review', 'done']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const validDate = value => value == null || value === '' ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

export function validateTaskInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Dữ liệu công việc không hợp lệ';
  if (!partial && (typeof body.title !== 'string' || !body.title.trim())) return 'Thiếu tiêu đề công việc';
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500)) return 'Tiêu đề không hợp lệ';
  if (body.description !== undefined && body.description !== null && (typeof body.description !== 'string' || body.description.length > 10000)) return 'Mô tả không hợp lệ';
  if (body.status !== undefined && !STATUSES.has(body.status)) return 'Trạng thái không hợp lệ';
  if (body.priority !== undefined && !PRIORITIES.has(body.priority)) return 'Độ ưu tiên không hợp lệ';
  if (body.progress !== undefined && (!Number.isInteger(Number(body.progress)) || Number(body.progress) < 0 || Number(body.progress) > 100)) return 'Tiến độ không hợp lệ';
  if (body.assignee_id !== undefined && body.assignee_id !== null && body.assignee_id !== '' && (!Number.isSafeInteger(Number(body.assignee_id)) || Number(body.assignee_id) <= 0)) return 'Nhân viên được giao không hợp lệ';
  if (!validDate(body.start_date) || !validDate(body.due_date) || !validDate(body.expected_response_date) || !validDate(body.planned_progress_date)) return 'Ngày công việc không hợp lệ';
  for (const key of ['business_group', 'data_period', 'expected_outcome', 'completed_result', 'next_step', 'blockers', 'proposed_solution', 'leader_opinion', 'waiting_on']) {
    if (body[key] !== undefined && body[key] !== null && (typeof body[key] !== 'string' || body[key].length > 10000)) return `${key} không hợp lệ`;
  }
  if (body.planned_progress !== undefined && body.planned_progress !== null && body.planned_progress !== '' &&
      (!Number.isInteger(Number(body.planned_progress)) || Number(body.planned_progress) < 0 || Number(body.planned_progress) > 100)) return 'Mốc tiến độ không hợp lệ';
  if (body.collaborator_ids !== undefined && (!Array.isArray(body.collaborator_ids) || body.collaborator_ids.length > 100 ||
      body.collaborator_ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0))) return 'Người phối hợp không hợp lệ';
  return null;
}
