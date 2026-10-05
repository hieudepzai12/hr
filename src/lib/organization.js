import { queryOne } from './db';

export async function validateManagerAssignment(employeeId, managerId) {
  if (managerId === null || managerId === undefined || managerId === '') return null;
  const id = Number(managerId);
  if (!Number.isSafeInteger(id) || id <= 0 || id === Number(employeeId)) return 'Người quản lý trực tiếp không hợp lệ';

  const manager = await queryOne("SELECT id FROM employees WHERE id = $1 AND status = 'active' AND role <> 'admin'", [id]);
  if (!manager) return 'Người quản lý trực tiếp không tồn tại hoặc đã nghỉ';

  if (employeeId) {
    const cycle = await queryOne(`WITH RECURSIVE managers AS (
      SELECT id, manager_id, ARRAY[id] AS visited FROM employees WHERE id = $1
      UNION ALL
      SELECT e.id, e.manager_id, m.visited || e.id
      FROM employees e JOIN managers m ON e.id = m.manager_id
      WHERE NOT e.id = ANY(m.visited)
    ) SELECT 1 FROM managers WHERE id = $2 LIMIT 1`, [id, Number(employeeId)]);
    if (cycle) return 'Không thể chọn cấp dưới làm người quản lý trực tiếp';
  }
  return null;
}
