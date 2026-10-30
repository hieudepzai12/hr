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
const base = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local API only');
const batchTaskIds = [];
let batchCustomerId, batchProjectId, projectReportId;
let taskId, reportId, importedTaskId, evaluationId, sharedTaskId, adminTaskId;
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
  assert.equal((await request('/api/departments', employee)).status, 403, 'Department management access stays restricted');
  const ownDepartmentOptions = await request('/api/departments?options=1', employee);
  assert.equal(ownDepartmentOptions.status, 200, 'Employee directory can load department filter options');
  assert.deepEqual(ownDepartmentOptions.data.map(({ id }) => Number(id)), [Number(departments[0].id)]);
  assert.ok(ownDepartmentOptions.data.every((item) => Object.keys(item).sort().join(',') === 'id,name'));
  assert.equal((await request('/api/departments?options=1', admin)).status, 200);
  const missingEmployeeDepartment=await request('/api/employees',admin,'POST',{full_name:'Missing department',email:`missing-department-${suffix}@example.invalid`,password,role:'employee'});
  assert.equal(missingEmployeeDepartment.status,400,'Non-admin accounts require a department');
  const missingUpdateDepartment=await request(`/api/employees/${ids.employee.id}`,admin,'PUT',{full_name:'Employee',role:'employee',status:'active',department_id:''});
  assert.equal(missingUpdateDepartment.status,400,'Non-admin accounts cannot clear department');
  const adminWithoutDepartment=await request(`/api/employees/${ids.admin.id}`,admin,'PUT',{full_name:`Verify admin ${suffix}`,role:'admin',status:'active',department_id:''});
  assert.equal(adminWithoutDepartment.status,200,'Admin account may omit department');
  const other = ids.other.cookie;
  assert.equal((await request(`/api/profiles/${ids.employee.id}`, employee)).status, 200);
  assert.equal((await request(`/api/profiles/${ids.other.id}`, employee)).status, 404, 'Personal profile cannot expose another employee');
  assert.equal((await request(`/api/profiles/${ids.other.id}`, admin)).status, 200, 'Granted profile scope is preserved');
  assert.equal((await request('/api/dashboard/stats', admin)).status, 200);
  assert.equal((await request('/api/dashboard/stats', employee)).status, 200);
  assert.equal((await request('/api/tasks/alerts', employee)).status, 200);
  const deniedAssignment = await request('/api/tasks', employee, 'POST', {
    title: `Denied assignment ${suffix}`, assignee_id: ids.other.id,
  });
  assert.equal(deniedAssignment.status, 403, 'Employee cannot create work for another person');
  assert.equal((await request('/api/tasks',admin,'POST',{title:'Invalid department',department_id:'not-a-number'})).status,400);
  assert.equal((await request('/api/tasks',admin,'POST',{title:'Missing department',department_id:2147483647})).status,400);
  await db.query('UPDATE employees SET department_id=NULL WHERE id=$1',[ids.admin.id]);
  const adminWork=await request('/api/tasks',admin,'POST',{title:`Admin work ${suffix}`});
  assert.equal(adminWork.status,201,'Admin can create work without a department');
  adminTaskId=adminWork.data.id;
  assert.equal(adminWork.data.department_id,null);
  const editedAdminWork=await request(`/api/tasks/${adminTaskId}`,admin,'PUT',{title:`Admin work edited ${suffix}`,department_id:''});
  assert.equal(editedAdminWork.status,200);
  assert.equal(editedAdminWork.data.department_id,null);
  await db.query('UPDATE employees SET department_id=$1 WHERE id=$2',[departments[0].id,ids.admin.id]);
  const clearedAdminWork=await request(`/api/tasks/${adminTaskId}`,admin,'PUT',{department_id:''});
  assert.equal(clearedAdminWork.status,200);
  assert.equal(clearedAdminWork.data.department_id,null);
  await db.query('UPDATE employees SET department_id=$1 WHERE id=$2',[departments[0].id,ids.admin.id]);
  const task = await request('/api/tasks', employee, 'POST', {
    title: `Verify task ${suffix}`,
    due_date: '2026-10-18', status: 'todo', progress: 0,
  });
  assert.equal(task.status, 201, `task: ${task.data.error}`);
  taskId = task.data.id;
  assert.equal(Number(task.data.assignee_id), Number(ids.employee.id), 'Self-created work belongs to the employee');
  assert.equal(task.data.department_id,departments[0].id,'Employee department is inferred when omitted');
  const page = await request(`/api/tasks?limit=1&offset=0&include_total=1&search=${encodeURIComponent(suffix)}`, employee);
  assert.equal(page.data.total, 1, 'Pagination total respects search and employee scope');
  assert.equal(page.data.items.length, 1);
  const emptyPage = await request(`/api/tasks?limit=1&offset=1&include_total=1&search=${encodeURIComponent(suffix)}`, employee);
  assert.equal(emptyPage.data.total, 1);
  assert.equal(emptyPage.data.items.length, 0);
  assert.equal((await request(`/api/tasks/${taskId}`, other)).status, 403);
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,employee,'POST',{opinion:'Unauthorized'})).status,403);
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:' '})).status,400);
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Too early'})).status,409);
  assert.equal((await request('/api/tasks',admin)).data.find(task=>task.id===taskId).has_submitted_report,false);

  const ownDashboard = await request('/api/dashboard/stats', employee);
  const otherDashboard = await request('/api/dashboard/stats', other);
  assert.equal(ownDashboard.data.tasksByStatus.reduce((sum, item) => sum + item.c, 0), 1);
  assert.equal(otherDashboard.data.tasksByStatus.length, 0);
  assert.equal(otherDashboard.data.recentReports.length, 0);
  assert.equal(ownDashboard.data.totalEmployees, undefined);
  const deniedReport = await request('/api/reports', other, 'POST', {
    title: `Denied ${suffix}`, content: 'Must roll back', task_ids: [taskId],
  });
  assert.equal(deniedReport.status, 400);
  assert.equal((await db.query('SELECT count(*)::int AS c FROM reports WHERE title=$1', [`Denied ${suffix}`])).rows[0].c, 0);
  await db.query(`INSERT INTO task_updates(task_id,employee_id,progress,result,next_step,blockers,solution)
    VALUES ($1,$2,37,'Own result','Next action','Obstacle','Solution')`, [taskId, ids.employee.id]);
  const textUpdate = { progress_text: 'Đã đối chiếu chứng từ\n- Đang tổng hợp số liệu', result: 'Own result', next_step: 'Next action', blockers: 'Obstacle', solution: 'Solution' };
  assert.equal((await request(`/api/tasks/${taskId}/updates`, other, 'POST', textUpdate)).status, 403);
  assert.equal((await request(`/api/tasks/${taskId}/updates`, employee, 'POST', { ...textUpdate, progress_text: 42 })).status, 400);
  assert.equal((await request(`/api/tasks/${taskId}/updates`, employee, 'POST', { ...textUpdate, progress_text: 'x'.repeat(10001) })).status, 400);
  assert.equal((await request(`/api/tasks/${taskId}/updates`, employee, 'POST', { ...textUpdate, progress: 37 })).status, 201);
  assert.equal((await request(`/api/tasks/${taskId}`, employee)).data.progress_text, textUpdate.progress_text);
  sharedTaskId = (await db.query(`INSERT INTO tasks(title,assignee_id,created_by,department_id)
    VALUES ($1,$2,$3,$4) RETURNING id`, [`Shared ${suffix}`, ids.other.id, ids.admin.id, departments[0].id])).rows[0].id;
  await db.query('INSERT INTO task_collaborators(task_id,employee_id) VALUES ($1,$2)', [sharedTaskId, ids.employee.id]);
  await db.query(`INSERT INTO task_updates(task_id,employee_id,progress,result,next_step,blockers,solution)
    VALUES ($1,$2,63,'Collaborator result','','',''),($1,$3,91,'Other employee result','','','')`,
  [sharedTaskId, ids.employee.id, ids.other.id]);
  const report = await request('/api/reports', employee, 'POST', {
    title: `Verify week ${suffix}`, content: 'Test snapshot', type: 'weekly',
    status: 'submitted', period_start: '2026-10-12', period_end: '2026-10-18', task_ids: [taskId, sharedTaskId, taskId],
  });
  assert.equal(report.status, 201, `report: ${report.data.error}`);
  reportId = report.data.id;
  await db.query("UPDATE reports SET status='draft' WHERE id=$1",[reportId]);
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Draft only'})).status,409);
  assert.equal((await request('/api/tasks',admin)).data.find(task=>task.id===taskId).has_submitted_report,false);
  await db.query("UPDATE reports SET status='submitted',deleted_at=NOW() WHERE id=$1",[reportId]);
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Deleted report'})).status,409);
  await db.query('UPDATE reports SET deleted_at=NULL WHERE id=$1',[reportId]);
  const beforeOpinion=(await request(`/api/tasks/${taskId}`,admin)).data;
  assert.equal((await request('/api/tasks',admin)).data.find(task=>task.id===taskId).has_submitted_report,true);
  const opinionResult=await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Leadership feedback'});
  assert.equal(opinionResult.status,200);
  const afterOpinion=(await request(`/api/tasks/${taskId}`,admin)).data;
  assert.equal(afterOpinion.leader_opinion,'Leadership feedback');
  for(const field of ['status','progress','progress_text','blockers','solution','title'])assert.deepEqual(afterOpinion[field],beforeOpinion[field],`Opinion preserves ${field}`);
  const editedOpinion=await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Revised leadership feedback'});
  assert.equal(editedOpinion.status,200);
  assert.equal(editedOpinion.data.leader_opinion,'Revised leadership feedback');
  const editAudit=await db.query("SELECT actor_id,changes FROM audit_logs WHERE entity_type='task' AND entity_id=$1 AND action='leader_opinion' ORDER BY id DESC LIMIT 1",[taskId]);
  assert.deepEqual(editAudit.rows[0].changes.leader_opinion,{before:'Leadership feedback',after:'Revised leadership feedback'});
  assert.equal(Number(editAudit.rows[0].actor_id),Number(ids.admin.id));
  assert.equal((await request(`/api/tasks/${taskId}/opinion`,employee,'POST',{opinion:'Unauthorized edit'})).status,403);
  const unchangedOpinion=await request(`/api/tasks/${taskId}/opinion`,admin,'POST',{opinion:'Revised leadership feedback'});
  assert.equal(unchangedOpinion.status,200);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_type='task' AND entity_id=$1 AND action='leader_opinion'",[taskId])).rows[0].count,2,'Adding and editing opinions are logged; unchanged submissions do not duplicate logs');

  const linkedReports = await request(`/api/reports?task_id=${taskId}`, employee);
  assert.equal(linkedReports.status, 200);
  assert.ok(linkedReports.data.some(row=>row.id===reportId));
  const listSummary=linkedReports.data.find(row=>row.id===reportId).task_summaries.find(item=>item.task_id===taskId);
  assert.equal(listSummary.progress_text,textUpdate.progress_text);
  assert.equal(listSummary.due_date,'2026-10-18');
  assert.equal(listSummary.blockers,'Obstacle');
  assert.equal(listSummary.solution,'Solution');
  assert.deepEqual((await request(`/api/reports?task_id=${taskId}`, other)).data, [], 'Task filter cannot bypass report scope');
  assert.equal((await request('/api/reports?task_id=invalid', admin)).status, 400);
  const snapshot = (await db.query('SELECT snapshot FROM report_items WHERE report_id=$1', [reportId])).rows[0].snapshot;
  const taskReportUpdate=(await request('/api/tasks',employee)).data.find(task=>task.id===taskId).report_update;
  assert.equal(taskReportUpdate.progress_text,snapshot.progress_text);
  assert.equal(taskReportUpdate.blockers,snapshot.blockers);
  assert.equal(taskReportUpdate.solution,snapshot.solution);
  assert.equal(snapshot.progress, 37);
  assert.equal(snapshot.progress_text, textUpdate.progress_text);
  assert.equal(snapshot.result, 'Own result');
  const versionSnapshot = (await db.query('SELECT snapshot FROM report_versions WHERE report_id=$1 AND version=1', [reportId])).rows[0].snapshot;
  assert.equal(versionSnapshot.items[0].snapshot.progress, 37);
  assert.equal(versionSnapshot.items.length, 2);
  assert.equal(versionSnapshot.items[1].task_id, sharedTaskId);
  assert.equal(versionSnapshot.items[1].snapshot.progress, 63);
  assert.equal(versionSnapshot.items[1].snapshot.result, 'Collaborator result');
  await db.query('UPDATE tasks SET progress=99 WHERE id=$1', [taskId]);
  assert.equal((await request(`/api/tasks/${taskId}/updates`, employee, 'POST', { ...textUpdate, progress_text: 'Nội dung tuần sau' })).status, 201);
  assert.equal((await request(`/api/reports?task_id=${taskId}`, employee)).data.find(row=>row.id===reportId).task_summaries.find(item=>item.task_id===taskId).progress_text,textUpdate.progress_text,'Report list uses its saved snapshot, not current task progress');
  await db.query("UPDATE tasks SET status='done' WHERE id=$1", [taskId]);
  assert.equal((await request(`/api/tasks/${taskId}/updates`, employee, 'POST', textUpdate)).status, 409);
  assert.equal((await request(`/api/tasks/${taskId}`, employee, 'PUT', { progress_text: 'Cannot change locked work' })).status, 409);
  await db.query("UPDATE tasks SET status='in_progress' WHERE id=$1", [taskId]);
  assert.equal((await db.query('SELECT snapshot FROM report_versions WHERE report_id=$1 AND version=1', [reportId])).rows[0].snapshot.items[0].snapshot.progress_text, textUpdate.progress_text);
  assert.equal((await db.query('SELECT snapshot FROM report_versions WHERE report_id=$1 AND version=1', [reportId])).rows[0].snapshot.items[0].snapshot.progress, 37);
  assert.equal((await request(`/api/reports/${reportId}`, other)).status, 403);
  const review = await request(`/api/reports/${reportId}/review`, admin, 'PUT', { status: 'approved', feedback: 'OK' });
  assert.equal(review.status, 410, 'Report approval is disabled');
  const locked = await request(`/api/reports/${reportId}`, employee, 'PUT', { title: 'Changed', content: 'Changed' });
  assert.equal(locked.status, 200, 'Submitted reports may be edited with the existing edit permission');
  const reopened = await request(`/api/reports/${reportId}/reopen`, admin, 'POST', { reason: 'Correction' });
  assert.equal(reopened.status, 410, 'Approval reopening is no longer required');
  const edited = await request(`/api/reports/${reportId}`, employee, 'PUT', {
    title: `Verify week ${suffix}`, content: 'Revised snapshot', task_ids: [taskId],
  });
  assert.equal(edited.status, 200, `edit: ${edited.data.error}`);
  assert.ok(edited.data.version > locked.data.version);
  const removed = await request(`/api/reports/${reportId}`, admin, 'DELETE', { reason: 'Test restore' });
  assert.equal(removed.status, 200, `delete: ${removed.data.error}`);
  const restored = await request(`/api/reports/${reportId}/restore`, admin, 'POST');
  assert.equal(restored.status, 200, `restore: ${restored.data.error}`);
  assert.equal(restored.data.deleted_at, null);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kế hoạch');
  sheet.addRow(['Công việc', 'Người thực hiện', 'Hạn chót', 'Tiến độ', 'KPI']);
  sheet.addRow([`Imported ${suffix}`, `Verify employee ${suffix}`, '18/10/2026', 0.9, 'Đã hoàn thành']);
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
  assert.equal(preview.data.rows[1].duplicate,true,'Repeated rows within one file are skipped');
  const key = preview.data.rows[0].source_key;
  const invalidImport=await importRequest('commit');
  assert.equal(invalidImport.status,400,'Unconfirmed progress reports an error');
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM tasks WHERE title=$1',[`Imported ${suffix}`])).rows[0].count,0,'Invalid import creates no work');
  const secondBook=new ExcelJS.Workbook();const secondSheet=secondBook.addWorksheet('Copy');
  secondSheet.addRow(['Công việc','Người thực hiện','Hạn chót','Tiến độ']);
  secondSheet.addRow([`IMPORTED   ${suffix}`,`Verify employee ${suffix}`,'18/10/2026',90]);
  const secondExcel=await secondBook.xlsx.writeBuffer();
  const secondForm=new FormData();secondForm.append('file',new Blob([secondExcel]),'copy.xlsx');secondForm.append('action','commit');
  const commits=await Promise.all([
    importRequest('commit',{[key]:{progress_confirmed:true}}),
    fetch(base+'/api/tasks/import',{method:'POST',headers:{cookie:admin},body:secondForm}).then(async response=>({status:response.status,data:await response.json()})),
  ]);
  for(const result of commits)assert.equal(result.status,200,`Excel commit: ${result.data.error}`);
  assert.equal(commits.reduce((sum,result)=>sum+result.data.imported,0),1,'Concurrent files keep only one normalized work item');
  const imported=commits.find(result=>result.data.imported===1);
  importedTaskId = imported.data.task_ids[0];
  const repeated = await importRequest('preview');
  assert.equal(repeated.data.rows[0].duplicate, true);
  const repeatedCommit=await importRequest('commit',{[key]:{progress_confirmed:true}});
  assert.equal(repeatedCommit.status,200);assert.equal(repeatedCommit.data.imported,0);assert.equal(repeatedCommit.data.skipped,2);
  const evidence = await request(`/api/kpi/evidence?employee_id=${ids.employee.id}`, admin);
  assert.equal(evidence.status, 200, `KPI evidence: ${evidence.data.error}`);
  assert.ok(evidence.data.tasks.some((item) => item.id === taskId));
  const evaluation = await request('/api/kpi', admin, 'POST', {
    employee_id: ids.employee.id, period: `verify-${suffix}`,
    rating: 'Hoàn thành tốt',
    task_ids: [taskId], report_ids: [reportId], comments: 'Test evidence',
  });
  assert.equal(evaluation.status, 201, `KPI create: ${evaluation.data.error}`);
  evaluationId = evaluation.data.id;
  assert.equal(evaluation.data.rating,'Hoàn thành tốt');
  assert.equal(evaluation.data.total_score,undefined);
  assert.equal(evaluation.data.criteria,undefined);
  for(const rating of ['Không hoàn thành','Hoàn thành','Hoàn thành tốt']){
    const manual=await request('/api/kpi',admin,'POST',{employee_id:ids.employee.id,period:`manual-${suffix}`,rating});
    assert.equal(manual.status,201);
    assert.equal(manual.data.rating,rating);
    await db.query('UPDATE kpi_evaluations SET total_score=10 WHERE id=$1',[manual.data.id]);
    const listed=await request(`/api/kpi?period=manual-${suffix}`,employee);
    assert.equal(listed.data.find(item=>item.id===manual.data.id).rating,rating,'Manual rating is independent of legacy score');
    assert.ok(listed.data.every(item=>!Object.hasOwn(item,'total_score')&&!Object.hasOwn(item,'criteria')));
    assert.equal((await request(`/api/kpi/${manual.data.id}`,admin,'DELETE')).status,200);
  }
  assert.equal((await request('/api/kpi',admin,'POST',{employee_id:ids.employee.id,period:'invalid',rating:'Invalid'})).status,400);
  assert.equal((await request('/api/kpi',admin,'POST',{employee_id:ids.employee.id,period:'missing'})).status,400);
  assert.equal((await request('/api/kpi',employee,'POST',{employee_id:ids.other.id,period:'denied',rating:'Hoàn thành'})).status,403);
  for(const [legacy,rating] of [['Đạt','Hoàn thành'],['Tốt','Hoàn thành tốt'],['Xuất sắc','Hoàn thành tốt'],['Cần cải thiện','Không hoàn thành']]){
    await db.query('UPDATE kpi_evaluations SET rating=$1 WHERE id=$2',[legacy,evaluationId]);
    const rated=await request(`/api/kpi?employee_id=${ids.employee.id}&period=verify-${suffix}`,admin);
    assert.equal(rated.status,200);
    assert.equal(rated.data.find(item=>item.id===evaluationId).rating,rating);
  }
  await db.query('UPDATE kpi_evaluations SET rating=$1 WHERE id=$2',['Hoàn thành tốt',evaluationId]);
  assert.equal(evaluation.data.evidence.length, 2);
  const accountEmail = `verify-created-${suffix}@example.invalid`;
  const account = await request('/api/employees', admin, 'POST', { full_name: `Created account ${suffix}`, email: accountEmail, password, role: 'employee', department_id: departments[0].id });
  assert.equal(account.status, 201, `Account create: ${account.data.error}`);
  ids.created = { id: account.data.id, email: accountEmail };
  assert.equal(account.data.password_hash, undefined);
  assert.equal((await request('/api/employees', admin, 'POST', { full_name: 'Duplicate', email: accountEmail, password })).status, 400);
  const createdLogin = await request('/api/auth/login', '', 'POST', { email: accountEmail, password });
  assert.equal(createdLogin.status, 200);
  const resetPassword = randomUUID() + randomUUID();
  assert.equal((await request(`/api/employees/${account.data.id}/reset-password`, employee, 'POST', { new_password: resetPassword })).status, 403);
  assert.equal((await request(`/api/employees/${account.data.id}/reset-password`, admin, 'POST', { new_password: resetPassword })).status, 200);
  assert.equal((await request('/api/employees', createdLogin.cookie)).status, 401, 'Password reset revokes previous session');
  assert.equal((await request('/api/auth/login', '', 'POST', { email: accountEmail, password })).status, 401);
  const newLogin = await request('/api/auth/login', '', 'POST', { email: accountEmail, password: resetPassword });
  assert.equal(newLogin.status, 200);
  assert.equal((await request('/api/auth/change-password', newLogin.cookie, 'POST', { current_password: 'incorrect', new_password: password })).status, 400);
  assert.equal((await request('/api/auth/change-password', newLogin.cookie, 'POST', { current_password: resetPassword, new_password: password })).status, 200);
  const restoredLogin = await request('/api/auth/login', '', 'POST', { email: accountEmail, password });
  assert.equal(restoredLogin.status, 200);
  assert.equal((await request(`/api/employees/${account.data.id}`, employee, 'DELETE')).status, 403);
  assert.equal((await request(`/api/employees/${ids.admin.id}`, admin, 'DELETE')).status, 403);
  assert.equal((await request(`/api/employees/${account.data.id}`, admin, 'DELETE')).status, 200);
  assert.equal((await request('/api/auth/login', '', 'POST', { email: accountEmail, password })).status, 403);
  assert.equal((await request('/api/employees', restoredLogin.cookie)).status, 401, 'Inactive account session is denied');
  for (let index=0;index<2;index++) {
    const batchTask=await request('/api/tasks',employee,'POST',{title:`Batch delete ${suffix} ${index}`});
    assert.equal(batchTask.status,201);
    batchTaskIds.push(batchTask.data.id);
  }
  const groupedEdit={tasks:batchTaskIds.map((id,index)=>({id,title:`Edited grouped task ${index}`,description:'Shared project work'})),due_date:'2026-12-31'};
  assert.equal((await request('/api/tasks/batch',other,'PUT',{...groupedEdit,reason:'Forbidden edit'})).status,403);
  assert.equal((await request('/api/tasks/batch',admin,'PUT',groupedEdit)).status,400,'Shared deadline requires a reason');
  assert.equal((await request('/api/tasks/batch',admin,'PUT',{...groupedEdit,reason:'Shared deadline update'})).status,200);
  const editedGroup=(await db.query('SELECT title,due_date FROM tasks WHERE id=ANY($1::int[])',[batchTaskIds])).rows;
  assert.equal(editedGroup.length,2);assert.ok(editedGroup.every(task=>task.due_date==='2026-12-31'&&task.title.startsWith('Edited grouped task')));
  batchCustomerId=(await db.query("INSERT INTO customers(code,name) VALUES($1,$2) RETURNING id",[`BATCH-${suffix}`,'Batch customer'])).rows[0].id;
  const batchCreate={customer_id:batchCustomerId,tasks:[{title:'Customer work one',due_date:'2026-11-01'},{title:'Customer work two',due_date:'2026-12-15'}]};
  const noLinkBatch=await request('/api/tasks/batch',employee,'POST',{tasks:batchCreate.tasks});
  assert.equal(noLinkBatch.status,400,'Multiple work items require project or customer');
  const invalidBatch=await request('/api/tasks/batch',employee,'POST',{...batchCreate,tasks:[{title:'Must not insert'},{title:''}]});
  assert.equal(invalidBatch.status,400);
  const newBatch=await request('/api/tasks/batch',employee,'POST',batchCreate);
  assert.equal(newBatch.status,201,JSON.stringify(newBatch.data));assert.equal(newBatch.data.tasks.length,2);
  const newIds=newBatch.data.tasks.map(task=>task.id);batchTaskIds.push(...newIds);
  assert.deepEqual(newBatch.data.tasks.map(task=>task.due_date),['2026-11-01','2026-12-15'],'Every work item keeps its own deadline');
  const independentEdit={tasks:newBatch.data.tasks.map((task,index)=>({id:task.id,title:task.title,description:task.description,due_date:index===0?'2026-11-05':task.due_date}))};
  assert.equal((await request('/api/tasks/batch',employee,'PUT',independentEdit)).status,400,'Per-work deadline changes require a reason');
  assert.equal((await request('/api/tasks/batch',employee,'PUT',{...independentEdit,reason:'Change first work deadline only'})).status,200);
  const independentDates=(await db.query('SELECT due_date FROM tasks WHERE id=ANY($1::int[]) ORDER BY id',[newIds])).rows.map(task=>task.due_date);
  assert.deepEqual(independentDates,['2026-11-05','2026-12-15'],'Editing one deadline must preserve the other');

  assert.ok(newBatch.data.tasks.every(task=>task.assignee_id===ids.employee.id&&task.customer_id===batchCustomerId));
  const appendToBatch=await request('/api/tasks/batch',employee,'PUT',{tasks:[...newBatch.data.tasks.map(task=>({id:task.id,title:task.title,description:task.description})),{title:'Customer work three'}]});
  assert.equal(appendToBatch.status,200,JSON.stringify(appendToBatch.data));assert.equal(appendToBatch.data.created,1);
  const appended=(await db.query('SELECT id FROM tasks WHERE customer_id=$1 ORDER BY id',[batchCustomerId])).rows.map(row=>row.id);
  batchTaskIds.push(...appended.filter(id=>!batchTaskIds.includes(id)));
  batchProjectId=(await db.query('INSERT INTO projects(code,name,department_id,customer_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[`BATCH-${suffix}`,'Batch project',departments[0].id,batchCustomerId,ids.admin.id])).rows[0].id;
  const projectBatch=await request('/api/tasks/batch',admin,'POST',{project_id:batchProjectId,department_id:departments[0].id,tasks:[{title:'Project resolves customer'}]});
  assert.equal(projectBatch.status,201,JSON.stringify(projectBatch.data));
  batchTaskIds.push(projectBatch.data.tasks[0].id);
  assert.equal(projectBatch.data.tasks[0].customer_id,batchCustomerId,'Customer is inherited from selected project');
  const projectedReport=await request('/api/reports',admin,'POST',{title:'Project report snapshot',content:'Project report',type:'project',status:'draft',task_ids:[projectBatch.data.tasks[0].id]});
  assert.equal(projectedReport.status,201);projectReportId=projectedReport.data.id;
  const projectReportList=await request(`/api/reports?project_id=${batchProjectId}`,admin);
  assert.equal(projectReportList.status,200);assert.ok(projectReportList.data.some(report=>report.id===projectReportId));
  const savedProjectItem=projectReportList.data.find(report=>report.id===projectReportId).task_summaries[0];
  assert.equal(savedProjectItem.project_id,batchProjectId);assert.equal(savedProjectItem.project_name,'Batch project');assert.equal(savedProjectItem.title,'Project resolves customer');
  assert.equal((await request('/api/reports?project_id=invalid',admin)).status,400);

  const projectBook=new ExcelJS.Workbook();const projectSheet=projectBook.addWorksheet('Project work');
  projectSheet.addRow(['Công việc','Người thực hiện','Dự án','Hạn chót','Mô tả công việc']);
  for(const date of ['01/11/2026','02/11/2026','01/11/2026'])projectSheet.addRow([`Công việc Excel ${suffix}`,`Verify employee ${suffix}`,`BATCH-${suffix}`,date,'Imported description']);
  const projectExcel=await projectBook.xlsx.writeBuffer();
  const projectImport=async action=>{const form=new FormData();form.append('file',new Blob([projectExcel]),'project.xlsx');form.append('action',action);const response=await fetch(base+'/api/tasks/import',{method:'POST',headers:{cookie:admin},body:form});return {status:response.status,data:await response.json()};};
  const projectPreview=await projectImport('preview');assert.equal(projectPreview.status,200,JSON.stringify(projectPreview.data));
  assert.deepEqual(projectPreview.data.rows.map(row=>row.duplicate),[false,false,true],'Different deadlines are separate work; exact repeats are skipped');
  assert.ok(projectPreview.data.rows.every(row=>row.project_id===batchProjectId&&row.customer_id===batchCustomerId));
  const projectCommit=await projectImport('commit');assert.equal(projectCommit.status,200,JSON.stringify(projectCommit.data));assert.equal(projectCommit.data.imported,2);batchTaskIds.push(...projectCommit.data.task_ids);
  const importedProjectRows=(await db.query('SELECT project_id,customer_id,due_date,description FROM tasks WHERE id=ANY($1::int[]) ORDER BY due_date',[projectCommit.data.task_ids])).rows;
  assert.deepEqual(importedProjectRows.map(task=>task.due_date),['2026-11-01','2026-11-02']);
  assert.ok(importedProjectRows.every(task=>task.project_id===batchProjectId&&task.customer_id===batchCustomerId&&task.description==='Imported description'));
  const namedTasks=await request(`/api/tasks?project_id=${batchProjectId}`,employee);assert.equal(namedTasks.status,200);assert.ok(namedTasks.data.length>0&&namedTasks.data.every(task=>task.project_name==='Batch project'),'Authorized work includes the real project name');
  const batchBody={task_ids:batchTaskIds.slice(0,2),reason:'Verify grouped deletion'};
  const deniedBatch=await request('/api/tasks/batch',other,'DELETE',batchBody);
  assert.equal(deniedBatch.status,403,JSON.stringify({response:deniedBatch.data,ids:batchTaskIds}));

  assert.equal((await request('/api/tasks/batch',admin,'DELETE',{...batchBody,task_ids:[batchTaskIds[0],adminTaskId]})).status,400);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM tasks WHERE id=ANY($1::int[]) AND deleted_at IS NULL',[batchTaskIds.slice(0,2)])).rows[0].count,2,'Denied group deletion leaves every task unchanged');
  const deletedBatch=await request('/api/tasks/batch',admin,'DELETE',{task_ids:batchBody.task_ids});
  assert.equal(deletedBatch.status,200);assert.equal(deletedBatch.data.deleted,2);
  const deleteLog=(await db.query("SELECT actor_id,action,created_at,changes FROM audit_logs WHERE entity_type='task' AND entity_id=$1 AND action='delete' ORDER BY id DESC LIMIT 1",[String(batchBody.task_ids[0])])).rows[0];
  assert.equal(deleteLog.actor_id,ids.admin.id);assert.equal(deleteLog.action,'delete');assert.ok(deleteLog.created_at);assert.ok(deleteLog.changes._record.after.name,'Deletion records the work title without a reason');
  const activity=await request('/api/governance/activity?pageSize=100',admin);
  assert.equal(activity.status,200);assert.ok(activity.data.items.some(item=>item.entity_type==='task'&&item.entity_id===String(batchBody.task_ids[0])&&item.record_name&&item.actor_name));
  const logDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const logFilter=new URLSearchParams({entity_type:'task',action:'delete',search:deleteLog.changes._record.after.name,from:logDay,to:logDay});
  const filteredActivity=await request('/api/governance/activity?'+logFilter,admin);
  assert.equal(filteredActivity.status,200,JSON.stringify(filteredActivity.data));
  assert.ok(filteredActivity.data.items.length>0);
  assert.ok(filteredActivity.data.items.every(item=>item.entity_type==='task'&&item.action==='delete'&&item.record_name.includes(deleteLog.changes._record.after.name)));
  assert.equal((await request('/api/governance/activity?from=2026-02-31',admin)).status,400);
  assert.equal((await request('/api/governance/activity?from=2026-12-31&to=2026-01-01',admin)).status,400);
  assert.equal((await request('/api/governance/activity?entity_type=invalid',admin)).status,400);


  for(const id of batchTaskIds.slice(0,2)) assert.equal((await request(`/api/tasks/${id}/restore`,admin,'POST')).status,200);
  const adminPassword = randomUUID()+randomUUID();
  assert.equal((await request('/api/auth/change-password', admin, 'POST', {new_password:adminPassword})).status, 200, 'Admin can change own password without current password');
  assert.equal((await request('/api/auth/login', '', 'POST', {email:ids.admin.email,password:adminPassword})).status, 200);
  console.log('Workflow checks passed: permissions, report lock/version/restore, Excel preview/import/duplicate, KPI evidence');
} finally {
  if(projectReportId) await db.query('DELETE FROM reports WHERE id=$1',[projectReportId]);
  if(batchTaskIds.length) await db.query('DELETE FROM tasks WHERE id=ANY($1::int[])',[batchTaskIds]);
  if(batchProjectId) await db.query('DELETE FROM projects WHERE id=$1',[batchProjectId]);
  if(batchCustomerId) await db.query('DELETE FROM customers WHERE id=$1',[batchCustomerId]);
  if (evaluationId) await db.query('DELETE FROM kpi_evaluations WHERE id=$1', [evaluationId]);
  if (reportId) await db.query('DELETE FROM reports WHERE id=$1', [reportId]);
  if (taskId) await db.query('DELETE FROM tasks WHERE id=$1', [taskId]);
  if (adminTaskId) await db.query('DELETE FROM tasks WHERE id=$1', [adminTaskId]);
  if (sharedTaskId) await db.query('DELETE FROM tasks WHERE id=$1', [sharedTaskId]);
  if (importedTaskId) await db.query('DELETE FROM tasks WHERE id=$1', [importedTaskId]);
  for (const person of Object.values(ids)) {
    await db.query('DELETE FROM employees WHERE id=$1', [person.id]);
  }
  await db.query("DELETE FROM audit_logs WHERE entity_type='report' AND entity_id=$1", [String(reportId)]);
  await db.query("DELETE FROM audit_logs WHERE entity_type='task' AND entity_id=$1", [String(taskId)]);
  if (importedTaskId) await db.query("DELETE FROM audit_logs WHERE entity_type='task' AND entity_id=$1", [String(importedTaskId)]);
  await db.end();
}
