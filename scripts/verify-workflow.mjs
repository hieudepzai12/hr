import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';

process.loadEnvFile('.env.local');
const dbUrl = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname)) throw new Error('Local database only');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const suffix = randomUUID().slice(0, 8);
const password = randomUUID() + randomUUID();
const ids = {};
const base = 'http://localhost:3000';
let taskId, reportId, importedTaskId, evaluationId;
const request = async (path, cookie, method = 'GET', body) => {
  const response = await fetch(base + path, { method, headers: {
    cookie, ...(body ? { 'content-type': 'application/json' } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
try {
  const { rows: departments } = await db.query('SELECT id FROM departments ORDER BY id LIMIT 1');
  assert.ok(departments[0], 'Need a local department');
  for (const role of ['admin', 'employee', 'other']) {
    const email = `verify-${role}-${suffix}@example.invalid`;
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(`INSERT INTO employees
      (full_name,email,password_hash,role,department_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [`Verify ${role} ${suffix}`, email, hash, role === 'other' ? 'employee' : role, departments[0].id]);
    ids[role] = { id: rows[0].id, email };
  }
  for (const role of Object.keys(ids)) {
    const login = await request('/api/auth/login', '', 'POST', { email: ids[role].email, password });
    assert.equal(login.status, 200, `${role} login: ${login.data.error}`);
    ids[role].cookie = login.cookie;
  }
  const admin = ids.admin.cookie;
  const employee = ids.employee.cookie;
  const other = ids.other.cookie;
  assert.equal((await request('/api/dashboard/stats', admin)).status, 200);
  assert.equal((await request('/api/dashboard/stats', employee)).status, 200);
  assert.equal((await request('/api/tasks/alerts', employee)).status, 200);
  const task = await request('/api/tasks', admin, 'POST', {
    title: `Verify task ${suffix}`, assignee_id: ids.employee.id,
    department_id: departments[0].id, due_date: '2026-10-18', status: 'todo', progress: 0,
  });
  assert.equal(task.status, 201, `task: ${task.data.error}`);
  taskId = task.data.id;
  assert.equal((await request(`/api/tasks/${taskId}`, other)).status, 403);
  const report = await request('/api/reports', employee, 'POST', {
    title: `Verify week ${suffix}`, content: 'Test snapshot', type: 'weekly',
    status: 'submitted', period_start: '2026-10-12', period_end: '2026-10-18', task_ids: [taskId],
  });
  assert.equal(report.status, 201, `report: ${report.data.error}`);
  reportId = report.data.id;
  assert.equal((await request(`/api/reports/${reportId}`, other)).status, 403);
  const review = await request(`/api/reports/${reportId}/review`, admin, 'PUT', { status: 'approved', feedback: 'OK' });
  assert.equal(review.status, 200, `review: ${review.data.error}`);
  const locked = await request(`/api/reports/${reportId}`, employee, 'PUT', { title: 'Changed', content: 'Changed' });
  assert.equal(locked.status, 409);
  const reopened = await request(`/api/reports/${reportId}/reopen`, admin, 'POST', { reason: 'Correction' });
  assert.equal(reopened.status, 200, `reopen: ${reopened.data.error}`);
  const edited = await request(`/api/reports/${reportId}`, employee, 'PUT', {
    title: `Verify week ${suffix}`, content: 'Revised snapshot', task_ids: [taskId],
  });
  assert.equal(edited.status, 200, `edit: ${edited.data.error}`);
  assert.ok(edited.data.version > review.data.version);
  const removed = await request(`/api/reports/${reportId}`, admin, 'DELETE', { reason: 'Test restore' });
  assert.equal(removed.status, 200, `delete: ${removed.data.error}`);
  const restored = await request(`/api/reports/${reportId}/restore`, admin, 'POST');
  assert.equal(restored.status, 200, `restore: ${restored.data.error}`);
  assert.equal(restored.data.deleted_at, null);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kế hoạch');
  sheet.addRow(['Công việc', 'Người thực hiện', 'Hạn chót', 'Tiến độ', 'KPI']);
  sheet.addRow([`Imported ${suffix}`, `Verify employee ${suffix}`, '18/10/2026', 0.9, 'Đã hoàn thành']);
  const excel = await workbook.xlsx.writeBuffer();
  const importRequest = async (action, overrides = {}) => {
    const form = new FormData();
    form.append('file', new Blob([excel]), 'plan.xlsx');
    form.append('action', action);
    form.append('overrides', JSON.stringify(overrides));
    const response = await fetch(base + '/api/tasks/import', { method: 'POST', headers: { cookie: admin }, body: form });
    return { status: response.status, data: await response.json() };
  };
  const preview = await importRequest('preview');
  assert.equal(preview.status, 200, `Excel preview: ${preview.data.error}`);
  assert.equal(preview.data.rows[0].progress, 90);
  assert.equal(preview.data.rows[0].status, 'review');
  const key = preview.data.rows[0].source_key;
  const imported = await importRequest('commit', { [key]: { progress_confirmed: true } });
  assert.equal(imported.status, 200, `Excel commit: ${imported.data.error}`);
  assert.equal(imported.data.imported, 1);
  importedTaskId = imported.data.task_ids[0];
  const repeated = await importRequest('preview');
  assert.equal(repeated.data.rows[0].duplicate, true);
  const evidence = await request(`/api/kpi/evidence?employee_id=${ids.employee.id}`, admin);
  assert.equal(evidence.status, 200, `KPI evidence: ${evidence.data.error}`);
  assert.ok(evidence.data.tasks.some((item) => item.id === taskId));
  const evaluation = await request('/api/kpi', admin, 'POST', {
    employee_id: ids.employee.id, period: `verify-${suffix}`,
    criteria: [{ name: 'Chất lượng công việc', weight: 100, score: 8 }],
    task_ids: [taskId], report_ids: [reportId], comments: 'Test evidence',
  });
  assert.equal(evaluation.status, 201, `KPI create: ${evaluation.data.error}`);
  evaluationId = evaluation.data.id;
  assert.equal(evaluation.data.evidence.length, 2);
  console.log('Workflow checks passed: permissions, report lock/version/restore, Excel preview/import/duplicate, KPI evidence');
} finally {
  if (evaluationId) await db.query('DELETE FROM kpi_evaluations WHERE id=$1', [evaluationId]);
  if (reportId) await db.query('DELETE FROM reports WHERE id=$1', [reportId]);
  if (taskId) await db.query('DELETE FROM tasks WHERE id=$1', [taskId]);
  if (importedTaskId) await db.query('DELETE FROM tasks WHERE id=$1', [importedTaskId]);
  for (const person of Object.values(ids)) {
    await db.query('DELETE FROM employees WHERE id=$1', [person.id]);
  }
  await db.query("DELETE FROM audit_logs WHERE entity_type='report' AND entity_id=$1", [String(reportId)]);
  await db.query("DELETE FROM audit_logs WHERE entity_type='task' AND entity_id=$1", [String(taskId)]);
  if (importedTaskId) await db.query("DELETE FROM audit_logs WHERE entity_type='task' AND entity_id=$1", [String(importedTaskId)]);
  await db.end();
}
