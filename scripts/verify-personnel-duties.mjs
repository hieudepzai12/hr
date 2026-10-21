import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {defaultPermissions} from '../src/lib/permissions.js';

process.loadEnvFile('.env.local');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database only');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
const people=[],positions=[],assignments=[],projects=[],staffing=[];
const restrictedRole='duty_test_'+randomUUID();
await client.connect();
try{
 const admin=(await client.query("SELECT id,token_version FROM employees WHERE role='admin' AND status='active' LIMIT 1")).rows[0];
 const department=(await client.query('SELECT id FROM departments ORDER BY id LIMIT 1')).rows[0].id;
 const cookie=person=>'hr_session='+jwt.sign({id:person.id,ver:person.token_version},process.env.JWT_SECRET,{expiresIn:'5m'});
 const request=(path,method='GET',body,person=admin)=>fetch('http://localhost:3000/api'+path,{method,headers:{Cookie:cookie(person),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const title='Duty test '+randomUUID();
 for(let i=0;i<2;i++){
  const person=(await client.query("INSERT INTO employees(full_name,email,password_hash,role,position,department_id) VALUES($1,$2,'test-only','employee',$3,$4) RETURNING id,token_version",['Duty verification',randomUUID()+'@example.invalid',title,department])).rows[0];people.push(person);
 }
 const staffingOptions=await request('/governance/staffing?options=1');assert.equal(staffingOptions.status,200);
 const choice=(await staffingOptions.json()).departments.find(row=>row.id===department);
 assert.ok(choice,'Staffing selects departments without any job title catalog');
 const staffingBody={name:'Staffing fixture',department_id:choice.id,month:'2099-01',target_count:3,notes:'Verification'};
 assert.equal((await request('/governance/staffing','POST',staffingBody,people[0])).status,403);
 const planResponse=await request('/governance/staffing','POST',staffingBody);
 assert.equal(planResponse.status,201,await planResponse.clone().text());const plan=await planResponse.json();staffing.push(plan.id);assert.equal(plan.position_id,null);
 assert.equal((await request('/governance/staffing','POST',staffingBody)).status,409,'One department/month plan');
 const listResponse=await request('/governance/staffing?month=2099-01');assert.equal(listResponse.status,200);assert.ok((await listResponse.json()).items.some(row=>row.id===plan.id&&row.department_id===department));
 const submittedResponse=await request('/governance/staffing/'+plan.id,'PATCH',{action:'submit',version:plan.version});assert.equal(submittedResponse.status,200);
 const firstSubmittedPlan=await submittedResponse.json();
 assert.equal((await request('/governance/staffing/'+plan.id,'PUT',{...staffingBody,version:firstSubmittedPlan.version},people[0])).status,403);
 const pendingEdit=await request('/governance/staffing/'+plan.id,'PUT',{...staffingBody,version:firstSubmittedPlan.version,notes:'Edited while pending'});assert.equal(pendingEdit.status,200);
 const revised=await pendingEdit.json();assert.equal(revised.status,'draft');assert.equal(revised.reviewed_by,null);
 assert.equal((await request('/governance/staffing/'+plan.id,'PATCH',{action:'approve',version:firstSubmittedPlan.version})).status,409,'Stale approval cannot approve a revised plan');
 const resubmitted=await request('/governance/staffing/'+plan.id,'PATCH',{action:'submit',version:revised.version});assert.equal(resubmitted.status,200);
 const submittedPlan=await resubmitted.json();
 const approvalResponse=await request('/governance/staffing/'+plan.id,'PATCH',{action:'approve',version:submittedPlan.version});assert.equal(approvalResponse.status,200,await approvalResponse.clone().text());
 const approvedPlan=await approvalResponse.json();assert.equal(approvedPlan.status,'approved');assert.equal(approvedPlan.reviewed_by,admin.id);
 assert.equal((await request('/governance/staffing/'+plan.id,'PUT',{...staffingBody,version:approvedPlan.version})).status,409,'Approved content remains locked');
 const organization=await (await request('/organization?month=2099-01')).json();assert.equal(organization.staffing.find(row=>row.department_id===department).target_count,3);
 for(let i=0;i<2;i++)projects.push((await client.query('INSERT INTO projects(code,name,department_id,owner_id,created_by) VALUES($1,$2,$3,$4,$4) RETURNING id',['TEST-'+randomUUID(),'Duty project '+i,department,admin.id])).rows[0].id);
 const base={name:'Individual duties',employee_id:people[0].id,project_id:projects[0],position_title:'',start_date:'2026-01-01',notes:'Duties for first person'};
 assert.equal((await request('/governance/assignments','POST',{...base,position_title:'Not their title'})).status,400);
 assert.equal((await request('/governance/assignments','POST',base,people[0])).status,403);
 for(let i=0;i<2;i++){
  const response=await request('/governance/assignments','POST',{...base,employee_id:people[i].id,notes:'Duties for person '+i});
  assert.equal(response.status,201,await response.clone().text());
  const saved=await response.json();assignments.push(saved.id);positions.push(saved.position_id);
  const profile=await (await request('/profiles/'+people[i].id)).json();
  assert.equal(profile.assignments.find(row=>row.id===saved.id).responsibilities,'Duties for person '+i);
  assert.equal(profile.assignments.find(row=>row.id===saved.id).project_id,projects[0]);
 }
 assert.equal(positions[0],positions[1],'Reuse same department/title, no duplicate catalog');
 const options=await (await request('/governance/assignments?options=1')).json();
 assert.equal(options.employees.find(row=>row.id===people[0].id).position,title);
 assert.ok(options.projects.some(row=>row.id===projects[0]));
 const otherProject=await request('/governance/assignments','POST',{...base,project_id:projects[1]});
 assert.equal(otherProject.status,201,await otherProject.clone().text());assignments.push((await otherProject.json()).id);
 const filtered=await request('/governance/assignments?project_id='+projects[1]);assert.equal(filtered.status,200);
 assert.deepEqual((await filtered.json()).items.map(row=>row.id),[assignments.at(-1)]);
 assert.equal((await request('/governance/projects/'+projects[0],'DELETE',{version:1,reason:'Must be blocked'})).status,409);
 const permissions=defaultPermissions(restrictedRole);
 for(const action of ['view','create','edit'])permissions.positions.scopes[action]='all';
 permissions.positions.view=true;permissions.profiles.scopes.view='all';permissions.profiles.view=true;
 await client.query('INSERT INTO role_permissions(role,label,permissions) VALUES($1,$2,$3::jsonb)',[restrictedRole,'Duty test',JSON.stringify(permissions)]);
 const restricted=(await client.query("INSERT INTO employees(full_name,email,password_hash,role,department_id) VALUES('Restricted duty test',$1,'test-only',$2,$3) RETURNING id,token_version",[randomUUID()+'@example.invalid',restrictedRole,department])).rows[0];people.push(restricted);
 assert.equal((await request('/governance/assignments','POST',{...base,project_id:projects[1]},restricted)).status,403,'Project access enforced independently of duty write access');
 const restrictedOptions=await (await request('/governance/assignments?options=1','GET',null,restricted)).json();assert.deepEqual(restrictedOptions.projects,[]);
 const hiddenList=await request('/governance/assignments?project_id='+projects[0],'GET',null,restricted);assert.equal(hiddenList.status,200);
 assert.ok((await hiddenList.json()).items.every(row=>row.project_id_label===null));
 const hiddenProfile=await (await request('/profiles/'+people[0].id,'GET',null,restricted)).json();assert.ok(hiddenProfile.assignments.every(row=>row.project_id===null));
 permissions.projects.view=true;permissions.projects.scopes.view='department';
 await client.query('UPDATE role_permissions SET permissions=$1::jsonb WHERE role=$2',[JSON.stringify(permissions),restrictedRole]);
 const scopedList=await request('/governance/assignments?project_id='+projects[0],'GET',null,restricted);assert.equal(scopedList.status,200);
 assert.ok((await scopedList.json()).items.every(row=>row.project_id_label==='Duty project 0'),'Scoped project label parameters');
 const before=(await client.query('SELECT * FROM position_assignments WHERE id=$1',[assignments[0]])).rows[0];
 const update=await request('/governance/assignments/'+before.id,'PUT',{...before,start_date:base.start_date,position_title:title,notes:'Updated individual duties'});
 assert.equal(update.status,200,await update.clone().text());
 const updated=await update.json();
 const deleted=await request('/governance/assignments/'+before.id,'DELETE',{version:updated.version,reason:'Verification'});assert.equal(deleted.status,200);
 const removed=await deleted.json();
 assert.equal((await request('/governance/assignments/'+before.id,'PATCH',{action:'restore',version:removed.version})).status,200);
 await client.query('UPDATE employees SET position=NULL WHERE id=$1',[people[0].id]);
 const fallback=await request('/governance/assignments','POST',{...base,name:'No job title needed'});
 assert.equal(fallback.status,201,await fallback.clone().text());
 const untitled=await fallback.json();assignments.push(untitled.id);
 if(!positions.includes(untitled.position_id))positions.push(untitled.position_id);
 assert.equal((await client.query('SELECT name FROM positions WHERE id=$1',[untitled.position_id])).rows[0].name,'Nhân viên');
 console.log('PASS: project-linked duties, multi-project assignment, project filter and profile, denied project access and hidden names, protected project deletion, edit/delete/restore and untitled employees');
}finally{
 // Clean up only records created by this run, including their audit fixtures.
 for(const [resource,ids] of [['staffing',staffing],['assignments',assignments],['positions',[...new Set(positions)]]]){
  if(!ids.length)continue;
  await client.query('DELETE FROM governance_versions WHERE resource=$1 AND entity_id=ANY($2::int[])',[resource,ids]);
  await client.query('DELETE FROM audit_logs WHERE entity_type=$1 AND entity_id=ANY($2::text[])',['governance:'+resource,ids.map(String)]);
 }
 await client.query('DELETE FROM staffing_plans WHERE id=ANY($1::int[])',[staffing]);
 await client.query('DELETE FROM position_assignments WHERE employee_id=ANY($1::int[])',[people.map(person=>person.id)]);
 await client.query('DELETE FROM positions WHERE id=ANY($1::int[])',[[...new Set(positions)]]);
 await client.query('DELETE FROM projects WHERE id=ANY($1::int[])',[projects]);
 await client.query('DELETE FROM employees WHERE id=ANY($1::int[])',[people.map(person=>person.id)]);
 await client.query('DELETE FROM role_permissions WHERE role=$1',[restrictedRole]);
 await client.end();
}
