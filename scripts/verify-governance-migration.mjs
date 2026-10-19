import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Local database only');
const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
const database='otis_migration_'+randomUUID().replaceAll('-','');
await admin.query(`CREATE DATABASE ${database}`);
let legacy,current;
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
  assert.equal((await current.query('SELECT MAX(version)::int AS version FROM schema_migrations')).rows[0].version,5);
  for(const table of ['employees','departments','tasks','reports']){
    const rows=(await current.query(`SELECT row_to_json(r) AS data FROM ${table} r ORDER BY id`)).rows;
    if(table==='tasks')for(const row of rows)delete row.data.project_id;
    assert.ok(JSON.stringify(rows)===JSON.stringify(originals[table]),`Legacy ${table} data changed unexpectedly`);
  }
  await current.migrateSchema();
  assert.equal((await current.query('SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version=5')).rows[0].count,1);
  process.env.NODE_ENV='production';
  const rollback=await import(pathToFileURL(oldPath).toString()+'?rollback');
  await rollback.ensureSchema();
  console.log('PASS: schema 4 -> 5, legacy rows/IDs retained, migration rerun, and original runtime schema check on upgraded database.');
}finally{
  if(legacy)await legacy.closeDb();if(current)await current.closeDb();
  await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
