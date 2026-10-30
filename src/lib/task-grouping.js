export function taskGroupKey(task) {
  return task.project_id ? `project-${task.project_id}` : task.customer_id ? `customer-${task.customer_id}` : 'unlinked';
}
