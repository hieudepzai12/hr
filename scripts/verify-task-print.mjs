import assert from 'node:assert/strict';
import { buildTaskPlanQuery } from '../src/lib/task-plan.js';

const base = { userId: 7, departmentId: 3, viewScope: 'all', printScope: 'all' };
const all = buildTaskPlanQuery(base);
assert.deepEqual(all.params, []);
assert.match(all.sql, /t\.deleted_at IS NULL/);
assert.match(all.sql, /t\.progress, t\.start_date, t\.due_date, t\.blockers, t\.proposed_solution, t\.leader_opinion/);
assert.doesNotMatch(all.sql, /LIMIT/);

const own = buildTaskPlanQuery({ ...base, printScope: 'self' });
assert.deepEqual(own.params, [7]);
assert.match(own.sql, /t\.assignee_id=\$1 OR EXISTS/);

const department = buildTaskPlanQuery({ ...base, viewScope: 'department', filters: { status: 'todo', from: '2026-10-01', to: '2026-10-31' } });
assert.deepEqual(department.params, [3, 7, 'todo', '2026-10-01', '2026-10-31']);
assert.match(department.sql, /t\.department_id=\$1/);
assert.match(department.sql, /t\.due_date <= \$5/);

assert.throws(() => buildTaskPlanQuery({ ...base, printScope: 'none' }), /FORBIDDEN/);
assert.throws(() => buildTaskPlanQuery({ ...base, filters: { from: '2026-02-30' } }), /Ngày lọc/);
assert.throws(() => buildTaskPlanQuery({ ...base, filters: { assignee_id: '1 OR 1=1' } }), /Bộ lọc/);
process.stdout.write('Đã kiểm tra phạm vi quyền và bộ lọc bản in công việc.\n');
