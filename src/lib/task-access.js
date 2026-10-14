import { queryOne } from './db';
import { scopeAllows, scopeFor } from './access';

export async function isTaskParticipant(task, userId) {
  if (Number(task.assignee_id) === Number(userId)) return true;
  return Boolean(await queryOne('SELECT 1 FROM task_collaborators WHERE task_id=$1 AND employee_id=$2', [task.id, userId]));
}

export async function canViewTask(task, user) {
  if (scopeFor(user, 'tasks', 'view') === 'none') return false;
  return scopeAllows(user, 'tasks', 'view', { ownerId: task.assignee_id, departmentId: task.department_id }) ||
    await isTaskParticipant(task, user.id);
}

export function canEditTask(task, user) {
  return scopeAllows(user, 'tasks', 'edit', { ownerId: task.assignee_id, departmentId: task.department_id });
}
