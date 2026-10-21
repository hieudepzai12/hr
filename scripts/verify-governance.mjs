import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { defaultPermissions, effectivePermissions } from '../src/lib/permissions.js';
import { budgetTotal, awardTotal, assertTransition, validDate, safeDocumentUrl } from '../src/lib/governance-validation.js';
import { deadlineAlert, vietnamToday } from '../src/lib/deadline.js';

// Deliberately do not load .env.local. This script is only for an explicitly chosen local database/server.
const connection=process.env.DATABASE_URL;
if(!connection||!['localhost','127.0.0.1'].includes(new URL(connection).hostname))throw new Error('Local database only; set DATABASE_URL explicitly');
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:3101';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local API only');
const db=new pg.Client({connectionString:connection});await db.connect();
const suffix=randomUUID().slice(0,8);const password=randomUUID()+randomUUID();const actors={};const departmentIds=[];
const call=async(path,cookie='',method='GET',body)=>{
  const response=await fetch(base+'/api'+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json().catch(()=>({})),cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
const ok=async(path,cookie,method='GET',body,expected=200)=>{const result=await call(path,cookie,method,body);assert.equal(result.status,expected,`${method} ${path}: ${result.data.error||JSON.stringify(result.data)}`);return result.data;};
const add=async(resource,body,actor='admin')=>ok(`/governance/${resource}`,actors[actor].cookie,'POST',body,201);
const change=async(resource,row,action,actor='reviewer',reason='Local verification')=>ok(`/governance/${resource}/${row.id}`,actors[actor].cookie,'PATCH',{version:row.version,action,reason});
try{
  assert.equal((await db.query('SELECT MAX(version)::int AS version FROM schema_migrations')).rows[0].version,8);
  const midnight=new Date('2026-10-18T17:01:00Z');assert.equal(vietnamToday(midnight),'2026-10-19');
  for(const [due,kind] of [['2026-10-22','upcoming'],['2026-10-20','upcoming'],['2026-10-19','today'],['2026-10-18','overdue']])assert.equal(deadlineAlert({due_date:due,status:'in_progress'},midnight).kind,kind);
  assert.equal(deadlineAlert({due_date:'2026-10-18',status:'review'},midnight).kind,'review');
  assert.equal(deadlineAlert({due_date:'2026-10-25',status:'in_progress',progress:0},midnight),null);
  assert.equal(defaultPermissions('manager').budgets.view,false);
  assert.equal(effectivePermissions('employee',{}).projects.scopes.view,'none');
  assert.equal(defaultPermissions('admin').budgets.scopes.view,'all');
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);
  assert.equal(safeDocumentUrl('javascript:alert(1)'),false);assert.equal(safeDocumentUrl('https://user:password@example.test/file'),false);
  assert.equal(budgetTotal({headcount:3,base_salary:10000001,allowance:2000000,employer_cost:1000000}),'39000003');
  assert.equal(awardTotal({calculation:'percentage',rate:'2.5000'},{basis_amount:100000020}),'2500001');
  assert.throws(()=>assertTransition({status:'submitted',created_by:5},'approve',5),/tự duyệt/);
  for(const label of ['A','B'])departmentIds.push((await db.query('INSERT INTO departments(name) VALUES($1) RETURNING id',[`Verify ${label} ${suffix}`])).rows[0].id);
  const managerPermissions=defaultPermissions('manager');
  for(const resource of ['positions','staffing','recruitment','projects','documents','insights','activity'])managerPermissions[resource]={view:true,manage:true,scopes:Object.fromEntries(['view','create','edit','approve','delete','restore','print'].map(action=>[action,'department']))};
  const role=`custom_verify_${suffix}`;
  await db.query('INSERT INTO role_permissions(role,label,permissions) VALUES($1,$2,$3)',[role,`Verify ${suffix}`,JSON.stringify(managerPermissions)]);
  for(const [key,roleKey,department] of [['admin','admin',0],['reviewer','admin',0],['manager',role,0],['employee','employee',0],['other','employee',1]]){
    const row=(await db.query('INSERT INTO employees(full_name,email,password_hash,role,department_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [`Verify ${key} ${suffix}`,`${key}-${suffix}@example.invalid`,await bcrypt.hash(password,10),roleKey,departmentIds[department]])).rows[0];
    const login=await call('/auth/login','','POST',{email:`${key}-${suffix}@example.invalid`,password});assert.equal(login.status,200,login.data.error);actors[key]={id:row.id,cookie:login.cookie};
  }
  const admin=actors.admin.cookie;const manager=actors.manager.cookie;const employee=actors.employee.cookie;
  assert.equal((await call('/governance/positions')).status,401);
  assert.equal((await call('/governance/budgets',employee)).status,403);
  assert.equal((await call('/governance/budgets?options=1',manager)).status,403);
  assert.equal((await call('/governance/unknown',admin)).status,404);
  const position=await add('positions',{code:`V-${suffix}`,name:`Verification position ${suffix}`,department_id:departmentIds[0],responsibilities:'Local test only',verification_status:'needs_verification'});
  const foreign=await add('positions',{code:`F-${suffix}`,name:`Foreign position ${suffix}`,department_id:departmentIds[1],responsibilities:'Foreign',verification_status:'needs_verification'});
  assert.equal((await call(`/governance/positions/${foreign.id}`,manager)).status,403);
  const list=await ok('/governance/positions?search='+encodeURIComponent(suffix),manager);assert.ok(list.items.some(row=>row.id===position.id));assert.ok(!list.items.some(row=>row.id===foreign.id));
  assert.equal((await call('/governance/positions?sort=name;DROP',admin)).status,200);
  const assignment=await add('assignments',{name:'Local assignment',position_id:position.id,employee_id:actors.employee.id,start_date:'2026-10-01',notes:'Confirmed test fixture'});
  assert.equal((await call('/governance/assignments',admin,'POST',{name:'Overlap',position_id:position.id,employee_id:actors.employee.id,start_date:'2026-10-19',notes:'Overlap'})).status,400);
  assert.equal((await call('/governance/assignments',manager,'POST',{name:'Cross scope',position_id:position.id,employee_id:actors.other.id,start_date:'2026-10-19',notes:'Out of scope'})).status,403);
  let staffing=await add('staffing',{name:'Local staffing',department_id:departmentIds[0],month:'2026-10',target_count:3,notes:'Test approved headcount'});
  const staffingList=await ok('/governance/staffing?month=2026-10',admin);assert.equal(staffingList.items.find(row=>row.id===staffing.id).actual_count,2);
  staffing=await change('staffing',staffing,'submit','admin');
  staffing=await change('staffing',staffing,'approve','admin');
  assert.equal((await call(`/governance/staffing/${staffing.id}`,admin,'PUT',{...staffing,target_count:5})).status,409);
  staffing=await change('staffing',staffing,'reopen');
  const stale=await call(`/governance/staffing/${staffing.id}`,admin,'PUT',{...staffing,version:staffing.version-1});assert.equal(stale.status,409);
  const recruitment=await add('recruitment',{name:'Local recruitment',position_id:position.id,quantity:2,hired_count:0,hiring_status:'pending',notes:'Test shortage'});
  const liveTitle=`Live title ${suffix}`;
  await db.query('UPDATE employees SET position=$1 WHERE id=$2',[liveTitle,actors.employee.id]);
  const liveOptions=await ok('/governance/recruitment?options=1',admin);
  const liveChoice=liveOptions.positions.find(row=>row.id===`employee:${actors.employee.id}:0`);assert.ok(liveChoice);
  const fromEmployee=await add('recruitment',{name:'From actual title',position_id:liveChoice.id,quantity:1,hiring_status:'pending',notes:'Shared title test'});
  const future=await add('recruitment',{name:'Future role',position_id:'new',position_name:`Future title ${suffix}`,position_department_id:departmentIds[0],quantity:1,hiring_status:'pending',notes:'No employee required'});
  assert.notEqual(fromEmployee.position_id,future.position_id);
  assert.equal((await call('/governance/recruitment',manager,'POST',{name:'Forbidden future role',position_id:'new',position_name:'Denied role',position_department_id:departmentIds[1],quantity:1,hiring_status:'pending',notes:'Cross department'})).status,403);
  const futureBudget=await add('budgets',{name:'Future role budget',position_id:'new',position_name:`Future title ${suffix}`,position_department_id:departmentIds[0],month:'2026-11',headcount:1,base_salary:10000000,notes:'Reuse planned title'});assert.equal(futureBudget.position_id,future.position_id);
  assert.equal((await call('/governance/recruitment',admin,'POST',{...recruitment,hired_count:3})).status,400);
  const project=await add('projects',{code:`P-${suffix}`,name:`Verification project ${suffix}`,department_id:departmentIds[0],owner_id:actors.admin.id,status:'active',verification_status:'needs_verification'});
  await add('members',{name:'Lead',project_id:project.id,employee_id:actors.employee.id,allocation:100});
  const projectOptions=await ok('/governance/projects?options=1',admin);assert.ok(projectOptions.projects.some(row=>row.id===project.id));
  const task=await ok('/tasks',admin,'POST',{title:`Verify task ${suffix}`,department_id:departmentIds[0],assignee_id:actors.employee.id,project_id:project.id,due_date:'2026-10-22'},201);
  await ok('/tasks',admin,'POST',{title:`Unrelated task ${suffix}`,department_id:departmentIds[0],assignee_id:actors.employee.id,due_date:'2026-10-23'},201);
  assert.equal((await call(`/tasks/${task.id}`,actors.other.cookie)).status,403);
  assert.equal((await ok(`/tasks?project_id=${project.id}&limit=20&offset=0`,admin)).items.length,1);
  const projectDetail=await ok(`/governance/projects/${project.id}`,admin);assert.equal(projectDetail.taskSummary[0].count,1);
  let policy=await add('policies',{code:`BP-${suffix}`,name:'Local percentage policy',calculation:'percentage',rate:2.5,conditions:'Approved test only'});
  policy=await change('policies',policy,'submit','admin');policy=await change('policies',policy,'approve');
  let award=await add('awards',{name:'Local bonus',project_id:project.id,policy_id:policy.id,employee_id:actors.employee.id,basis_amount:100000000,amount:1,notes:'Test award basis'});
  assert.equal(award.amount,'2500000');assert.equal(award.policy_snapshot.version,policy.version);
  award=await change('awards',award,'submit','admin');award=await change('awards',award,'approve');
  let budget=await add('budgets',{name:'Local budget',position_id:position.id,month:'2026-10',headcount:3,base_salary:10000001,allowance:2000000,employer_cost:1000000,notes:'Test budget basis'});
  assert.equal(budget.total_amount,'39000003');
  assert.equal((await call(`/governance/budgets/${budget.id}`,manager)).status,403);
  budget=await change('budgets',budget,'submit','admin');budget=await change('budgets',budget,'approve');
  const insights=await ok('/governance/insights?month=2026-10',manager);assert.ok(!insights.summaries.some(summary=>['budgets','awards'].includes(summary.resource)));
  const adminInsights=await ok('/governance/insights?month=2026-10',admin);assert.equal(adminInsights.summaries.find(summary=>summary.resource==='budgets').groups.find(group=>group.department_id===departmentIds[0]).approved_amount,'39000003');
  const activities=await ok('/governance/activity',manager);assert.ok(!activities.items.some(item=>item.entity_type.includes('budgets')||item.entity_type.includes('awards')));
  let folder=await add('folders',{name:'Verification folder',department_id:departmentIds[0],owner_id:actors.admin.id});
  const child=await add('folders',{name:'Child folder',department_id:departmentIds[0],owner_id:actors.admin.id,parent_id:folder.id});
  assert.equal((await call(`/governance/folders/${folder.id}`,admin,'PUT',{...folder,parent_id:child.id})).status,400);
  assert.ok((await ok('/governance/folders?tree=1',admin)).items.some(row=>row.id===child.id));
  const document=await add('documents',{name:'Local link',folder_id:folder.id,url:'https://example.invalid/internal',instructions:'Test only',verification_status:'needs_verification'});
  assert.equal((await call('/governance/documents',admin,'POST',{...document,url:'javascript:alert(1)'})).status,400);
  assert.equal((await call(`/governance/folders/${folder.id}`,admin,'PATCH',{action:'delete',version:folder.version,reason:'Cannot hide linked files'})).status,409);
  folder=await add('folders',{name:'Empty folder',department_id:departmentIds[0],owner_id:actors.admin.id});
  folder=await change('folders',folder,'delete','admin');
  assert.equal((await call(`/governance/documents/${document.id}`,manager)).status,200);
  folder=await change('folders',folder,'restore','admin');assert.equal(folder.deleted_at,null);
  const history=await ok(`/governance/folders/${folder.id}`,admin);assert.ok(history.versions.length>=3);assert.ok(history.history.some(row=>row.action==='restore'));
  const organization=await ok('/organization',admin);assert.ok(organization.positions.some(row=>row.id===position.id&&row.holders.includes('Verify employee')));
  // Previous workflows still work: employee updates own work, report approval locks content and reopen retains versions.
  await ok(`/tasks/${task.id}/updates`,employee,'POST',{progress:100,result:'Test complete',next_step:'',blockers:'',solution:'',submit_for_review:true},201);
  await ok(`/tasks/${task.id}/review`,actors.reviewer.cookie,'POST',{decision:'approved',opinion:'Test acceptance'});
  const report=await ok('/reports',employee,'POST',{title:`Verify report ${suffix}`,content:'Snapshot',type:'weekly',status:'submitted',period_start:'2026-10-01',period_end:'2026-10-31',task_ids:[task.id]},201);
  await ok(`/reports/${report.id}/review`,actors.reviewer.cookie,'PUT',{status:'approved',feedback:'Verified'});
  assert.equal((await call(`/reports/${report.id}`,employee,'PUT',{title:'Changed',content:'Changed'})).status,409);
  const print=await call(`/tasks/print?project_id=${project.id}`,admin);assert.equal(print.status,200);assert.equal(print.data.tasks.length,1);assert.equal(print.data.tasks[0].id,task.id);
  const oldPermissions=defaultPermissions('manager');for(const key of ['positions','staffing','recruitment','projects','bonuses','budgets','documents','insights','activity'])delete oldPermissions[key];
  await ok('/permissions',admin,'PUT',{role,permissions:oldPermissions});
  console.log('PASS: local migration schema, deny-by-default permissions, department isolation, validation, cycles, headcount, project/task links, approval locks, versions, recovery, exact VND calculations, scoped summaries, private document links and legacy task/report workflows.');
  if(process.argv.includes('--browser')){
    const {spawnSync}=await import('node:child_process');
    const result=spawnSync('python',['scripts/verify-governance-browser.py'],{input:JSON.stringify({base,cookie:actors.admin.cookie}),encoding:'utf8',timeout:120000});
    if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);assert.equal(result.status,0,'Browser verification failed');
  }
}finally{
  const ids=Object.values(actors).map(actor=>actor.id);
  if(ids.length){
    await db.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::int[])',[ids]);
    await db.query('DELETE FROM governance_versions WHERE actor_id=ANY($1::int[])',[ids]);
    await db.query('DELETE FROM reports WHERE employee_id=ANY($1::int[])',[ids]);
    await db.query('DELETE FROM tasks WHERE created_by=ANY($1::int[])',[ids]);
    for(const table of ['internal_documents','document_folders','salary_budgets','bonus_awards','bonus_policies','project_members','projects','recruitment_requests','staffing_plans','position_assignments','positions'])await db.query(`DELETE FROM ${table} WHERE created_by=ANY($1::int[])`,[ids]);
    await db.query('DELETE FROM employees WHERE id=ANY($1::int[])',[ids]);
  }
  await db.query('DELETE FROM role_permissions WHERE role=$1',[`custom_verify_${suffix}`]);
  await db.query('DELETE FROM departments WHERE id=ANY($1::int[])',[departmentIds]);
  await db.end();
}
