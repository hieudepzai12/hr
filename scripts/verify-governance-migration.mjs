import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';
import { migrateProjectDepartments } from '../src/lib/migrations/011-project-departments.js';
import { migrateSalaryBudgetGroups } from '../src/lib/migrations/012-salary-budget-groups.js';
import { migrateDepartmentBonuses } from '../src/lib/migrations/013-department-bonuses.js';

const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Local database only');
const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
const database='otis_migration_'+randomUUID().replaceAll('-','');
await admin.query(`CREATE DATABASE ${database}`);
let legacy,current,rollback;
try{
  url.pathname='/'+database;process.env.DATABASE_URL=url.toString();process.env.MIGRATION_MODE='1';
  process.env.INITIAL_ADMIN_EMAIL='migration-check@example.invalid';process.env.INITIAL_ADMIN_PASSWORD=randomUUID()+randomUUID();
  await mkdir('imports',{recursive:true});
  const source=execFileSync('git',['show','13d30db:src/lib/db.js'],{encoding:'utf8'});
  const oldPath=resolve('imports/legacy-db.mjs');await writeFile(oldPath,source);
  legacy=await import(pathToFileURL(oldPath));await legacy.migrateSchema();
  assert.equal((await legacy.query('SELECT MAX(version)::int AS version FROM schema_migrations')).rows[0].version,4);
  const department=(await legacy.query("INSERT INTO departments(name) VALUES('Migration fixture') RETURNING id")).rows[0].id;
  const owner=(await legacy.query('SELECT id FROM employees ORDER BY id LIMIT 1')).rows[0].id;
  await legacy.query("INSERT INTO tasks(title,assignee_id,department_id,due_date) VALUES('Preserve legacy task',$1,$2,'2026-10-31')",[owner,department]);
  await legacy.query("INSERT INTO reports(title,content,employee_id,department_id) VALUES('Preserve legacy report','Legacy snapshot',$1,$2)",[owner,department]);
  const originals={};
  for(const table of ['employees','departments','tasks','reports'])originals[table]=(await legacy.query(`SELECT row_to_json(r) AS data FROM ${table} r ORDER BY id`)).rows;
  await legacy.closeDb();legacy=null;
  current=await import('../src/lib/db.js');await current.migrateSchema();
  assert.equal((await current.query('SELECT MAX(version)::int AS version FROM schema_migrations')).rows[0].version,14);
  for(const table of ['employees','departments','tasks','reports']){
    const rows=(await current.query(`SELECT row_to_json(r) AS data FROM ${table} r ORDER BY id`)).rows;
    if(table==='tasks')for(const row of rows)delete row.data.project_id;
    assert.ok(JSON.stringify(rows)===JSON.stringify(originals[table]),`Legacy ${table} data changed unexpectedly`);
  }
  await current.transaction(async client=>{
    // Simulate a populated schema 10 inside this disposable database.
    await client.query('DROP TABLE project_departments');
    const second=(await client.query("INSERT INTO departments(name) VALUES('Migration participant') RETURNING id")).rows[0].id;
    const third=(await client.query("INSERT INTO departments(name) VALUES('Migration member department') RETURNING id")).rows[0].id;
    const member=(await client.query("INSERT INTO employees(full_name,email,password_hash,role,department_id) SELECT 'Migration participant','migration-participant@example.invalid',password_hash,'employee',$1 FROM employees WHERE id=$2 RETURNING id",[third,owner])).rows[0].id;
    const project=(await client.query("INSERT INTO projects(code,name,department_id,created_by) VALUES('MIGRATION-MULTI','Existing project',$1,$2) RETURNING id",[department,owner])).rows[0].id;
    await client.query("INSERT INTO tasks(title,project_id,department_id) VALUES('Existing cross-department task',$1,$2)",[project,second]);
    await client.query("INSERT INTO project_members(name,project_id,employee_id,department_id,created_by) VALUES('Existing member',$1,$2,$3,$4)",[project,member,department,owner]);
    await migrateProjectDepartments(client);
    const rows=await client.query('SELECT department_id FROM project_departments WHERE project_id=$1 ORDER BY department_id',[project]);
    assert.deepEqual(rows.rows.map(row=>row.department_id),[department,second,third].sort((a,b)=>a-b));
  });
  await current.transaction(async client=>{
    await client.query('DROP TABLE salary_budget_departments');
    await client.query('ALTER TABLE salary_budgets DROP COLUMN budget_mode');
    const position=(await client.query("INSERT INTO positions(code,name,department_id,responsibilities,created_by) VALUES('MIGRATION-BUDGET','Legacy budget position',$1,'Preserve data',$2) RETURNING id",[department,owner])).rows[0].id;
    const original=(await client.query("INSERT INTO salary_budgets(name,position_id,department_id,owner_id,month,headcount,base_salary,allowance,employer_cost,total_amount,created_by) VALUES('Existing position budget',$1,$2,$3,'2026-10',3,10000001,2000000,1000000,39000003,$3) RETURNING *",[position,department,owner])).rows[0];
    await migrateSalaryBudgetGroups(client);
    const upgraded=(await client.query('SELECT * FROM salary_budgets WHERE id=$1',[original.id])).rows[0];
    assert.equal(upgraded.budget_mode,'position');delete upgraded.budget_mode;
    assert.deepEqual(upgraded,original);
    assert.equal((await client.query('SELECT department_id FROM salary_budget_departments WHERE budget_id=$1',[original.id])).rows[0].department_id,department);
  });
  await current.transaction(async client=>{
    await client.query('ALTER TABLE bonus_awards DROP CONSTRAINT bonus_award_recipient_check, DROP COLUMN award_scope, ALTER COLUMN employee_id SET NOT NULL');
    const project=(await client.query('SELECT id FROM projects LIMIT 1')).rows[0].id;
    const policy=(await client.query("INSERT INTO bonus_policies(code,name,conditions,created_by) VALUES('MIGRATION-BONUS','Existing policy','Keep',$1) RETURNING id",[owner])).rows[0].id;
    const original=(await client.query("INSERT INTO bonus_awards(name,project_id,policy_id,policy_snapshot,employee_id,department_id,owner_id,amount,created_by) VALUES('Existing bonus',$1,$2,'{\"calculation\":\"manual\"}',$3,$4,$3,999999999999999999,$3) RETURNING *",[project,policy,owner,department])).rows[0];
    await migrateDepartmentBonuses(client);
    const upgraded=(await client.query('SELECT * FROM bonus_awards WHERE id=$1',[original.id])).rows[0];
    assert.equal(upgraded.award_scope,'legacy');delete upgraded.award_scope;assert.deepEqual(upgraded,original);
  });
  await current.migrateSchema();
  assert.equal((await current.query('SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version=5')).rows[0].count,1);
  process.env.NODE_ENV='production';
  rollback=await import(pathToFileURL(oldPath).toString()+'?rollback');
  await rollback.ensureSchema();
  await rollback.closeDb();rollback=null;
  console.log('PASS: schema 4 -> 13, legacy data retained including exact payroll amounts, project and budget departments backfilled, rerun and old-runtime compatibility.');
}finally{
  if(legacy)await legacy.closeDb();if(current)await current.closeDb();if(rollback)await rollback.closeDb();
  await unlink(resolve('imports/legacy-db.mjs')).catch(()=>{});
  await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
