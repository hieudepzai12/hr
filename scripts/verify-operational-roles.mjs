// Isolated local database only. No real email, Neon writes or production sessions.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawn,spawnSync } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import { operationalRolePermissions } from '../src/lib/operational-role-permissions.js';

const source=new URL(parseEnv(readFileSync('.env.local.before-neon-20261021162923','utf8')).DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(source.hostname),'Local PostgreSQL only');
const root=new pg.Client({connectionString:String(source),ssl:false});
await root.connect();
const name='otis_roles_verify_'+Date.now();
let db,server,storage;
try {
  await root.query('CREATE DATABASE '+name);
  const target=new URL(source);target.pathname='/'+name;
  process.env.DATABASE_URL=String(target);
  process.env.INITIAL_ADMIN_PASSWORD=randomBytes(24).toString('hex');
  process.env.JWT_SECRET=randomBytes(48).toString('hex');
  storage=await import('../src/lib/db.js');
  await storage.migrateSchema();
  db=new pg.Client({connectionString:String(target),ssl:false});await db.connect();
  const headRole='custom_operational_verify';
  for(const [role,level,label] of [[headRole,'department_head','Head verification'],['employee','employee','Employee'],['director','director','Director']]) {
    await db.query('INSERT INTO role_permissions(role,label,permissions) VALUES($1,$2,$3::jsonb) ON CONFLICT(role) DO UPDATE SET permissions=EXCLUDED.permissions',[role,label,JSON.stringify(operationalRolePermissions(level))]);
  }
  const deps=[];
  for(const label of ['Own department','Other department'])deps.push((await db.query('INSERT INTO departments(name) VALUES($1) RETURNING id',[label])).rows[0].id);
  const people=[];
  for(const [role,dept,label] of [['admin',null,'Admin verifier'],[headRole,deps[0],'Head verifier'],['employee',deps[0],'Own worker'],['employee',deps[1],'Other worker'],['director',deps[1],'Director verifier']]) {
    people.push((await db.query("INSERT INTO employees(full_name,email,password_hash,role,status,department_id) VALUES($1,$2,'unused',$3,'active',$4) RETURNING id,token_version",[label,label.replaceAll(' ','')+'@example.invalid',role,dept])).rows[0]);
  }
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const base='http://127.0.0.1:'+port;
  const env={...process.env,NODE_ENV:'production',OTIS_DIST_DIR:'.next-verify',VERIFY_BASE_URL:base};
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'ignore',windowsHide:true});
  for(let i=0;i<80;i++){try{await fetch(base+'/login');break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
  const cookies=people.map(person=>'hr_session='+jwt.sign({id:person.id,ver:person.token_version},process.env.JWT_SECRET,{expiresIn:'5m'}));
  const call=async(actor,path,method='GET',body)=>{
    const response=await fetch(base+'/api'+path,{method,headers:{cookie:cookies[actor],'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  const ok=async(actor,path,method,body,status=200)=>{
    const result=await call(actor,path,method,body);
    assert.equal(result.status,status,JSON.stringify({path,status:result.status,error:result.data.error}));return result.data;
  };
  const tasks=[];
  for(let i=0;i<2;i++)tasks.push((await db.query("INSERT INTO tasks(title,assignee_id,created_by,department_id,due_date) VALUES($1,$2,$3,$4,'2026-12-31') RETURNING id",['Scope task '+i,people[i+2].id,people[0].id,deps[i]])).rows[0].id);
  const headTasks=await ok(1,'/tasks');
  assert.ok(headTasks.some(task=>task.id===tasks[0]));assert.ok(!headTasks.some(task=>task.id===tasks[1]));
  await ok(1,'/permissions','GET',undefined,403);
  for(const actor of [1,4])await ok(actor,'/employees?accounts=1','GET',undefined,403);

  const budgetBody={name:'Own fund',budget_mode:'aggregate',department_ids:[deps[0]],total_amount:'100',month:'2099-01'};
  const budget=await ok(0,'/governance/budgets','POST',budgetBody,201);
  await ok(0,'/governance/budgets','POST',{...budgetBody,name:'Other fund',department_ids:[deps[1]],total_amount:'200'},201);
  const funds=await ok(1,'/governance/budgets?month=2099-01');assert.equal(funds.summary.total_amount,'100');
  await ok(1,'/governance/budgets','POST',{...budgetBody,month:'2099-02'},403);
  await ok(1,'/governance/budgets/'+budget.id,'PUT',{...budgetBody,version:budget.version},403);
  await ok(2,'/governance/budgets','GET',undefined,403);
  const project=await ok(0,'/governance/projects','POST',{code:'ROLE-VERIFY',name:'Role project',department_ids:deps},201);
  const awardBody={name:'Own award',project_id:project.id,department_id:deps[0],amount:'100'};
  await ok(0,'/governance/awards','POST',awardBody,201);
  await ok(0,'/governance/awards','POST',{...awardBody,name:'Other award',department_id:deps[1],amount:'200'},201);
  const awards=await ok(1,'/governance/awards');assert.ok(awards.items.every(award=>award.department_id===deps[0]));
  await ok(1,'/governance/awards','POST',awardBody,403);
  await ok(2,'/governance/awards','GET',undefined,403);

  const evaluations=[];
  for(const worker of [people[2],people[3]])evaluations.push(await ok(0,'/kpi','POST',{employee_id:worker.id,period:'Role check',rating:'Hoàn thành'},201));
  const kpis=await ok(1,'/kpi');
  assert.ok(kpis.some(kpi=>kpi.id===evaluations[0].id));assert.ok(!kpis.some(kpi=>kpi.id===evaluations[1].id));
  assert.equal((await ok(1,'/kpi?employee_id='+people[3].id)).length,0);
  const expanded=operationalRolePermissions('department_head');
  expanded.kpi={view:true,create:true,edit:true,delete:true,manage:true,scope:'department'};
  await ok(0,'/permissions','PUT',{role:headRole,permissions:expanded});
  const ownKpi={employee_id:people[2].id,period:'Own department',rating:'Hoàn thành tốt'};
  await ok(1,'/kpi','POST',ownKpi,201);
  await ok(1,'/kpi','POST',{...ownKpi,employee_id:people[3].id},403);
  await ok(1,'/kpi/'+evaluations[1].id,'PUT',{...ownKpi,employee_id:people[3].id},403);
  await ok(1,'/kpi/'+evaluations[1].id,'DELETE',undefined,403);
  await ok(1,'/kpi/evidence?employee_id='+people[3].id,'GET',undefined,403);
  const options=await ok(1,'/employees?fields=options');assert.ok(!options.some(employee=>employee.id===people[3].id));
  await ok(0,'/permissions','PUT',{role:headRole,permissions:operationalRolePermissions('department_head')});
  const counts=await ok(0,'/permissions');assert.equal(counts.find(role=>role.role===headRole).employee_count,1);
  console.log('PASS: operational roles, department tasks, financial read-only, scoped KPI read/write/evidence/options and role usage.');
  const matrix=spawnSync(process.execPath,['scripts/verify-permission-matrix.mjs'],{env,encoding:'utf8',windowsHide:true,timeout:120000});
  if(matrix.status!==0)throw new Error(matrix.stdout+'\n'+matrix.stderr);
  console.log(matrix.stdout.trim());
} finally {
  if(server){server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));}
  if(db)await db.end();if(storage)await storage.closeDb();
  await root.query('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end();
}
