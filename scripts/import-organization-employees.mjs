// Local-only import. Names come from Word; generated emails require verification.
import { readFileSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { writeAudit } from '../src/lib/audit.js';

if(!process.env.DATABASE_URL)process.loadEnvFile('.env.local');
const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required.');
const evidence=JSON.parse(readFileSync('imports/organization-review.json','utf8'));
const key=value=>value.normalize('NFC').replace(/\s+/gu,'').toLocaleLowerCase('vi');
const apply=process.argv.includes('--apply');
const diagramOnly=!process.argv.includes('--include-tables');
const replaceExisting=process.argv.includes('--replace-existing');
if(replaceExisting&&!diagramOnly)throw new Error('Replacement requires --diagram-only.');
if(replaceExisting){
  const backup=process.argv.find(arg=>arg.startsWith('--backup='))?.slice('--backup='.length);
  if(!backup||statSync(backup).size===0)throw new Error('An existing database backup is required.');
  if(readFileSync(backup).subarray(0,5).toString()!=='PGDMP')throw new Error('PostgreSQL custom backup required.');
}
const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
let added=0,skipped=0,deleted=0;
try{
  await client.connect();await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('otis-organization-source-import'))");
  const actor=(await client.query("SELECT id FROM employees WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];
  if(!actor)throw new Error('Active local administrator required.');
  if(replaceExisting){
    await client.query('LOCK TABLE employees IN EXCLUSIVE MODE');
    const old=(await client.query("SELECT id,full_name,email,role,department_id FROM employees WHERE role<>'admin' ORDER BY id")).rows;
    // Refuse a broader deletion if local data changed after the reviewed inventory.
    if(old.length!==28)throw new Error('Employee inventory changed; review references before replacement.');
    for(const employee of old)await writeAudit(client,{entityType:'employee',entityId:employee.id,actorId:actor.id,action:'delete',before:employee,reason:'User approved permanent local replacement from Word diagrams, including dependent reports/KPI, after database backup.'});
    deleted=(await client.query("DELETE FROM employees WHERE role<>'admin'")).rowCount;
  }
  const departments=(await client.query('SELECT id,name FROM departments')).rows;
  const employees=(await client.query('SELECT id,full_name,department_id FROM employees')).rows;
  for(const source of evidence.sources){
    const departmentName=source.source.replace(/^SƠ ĐỒ TỔ CHỨC /u,'').replace(/\.docx$/iu,'');
    const matches=departments.filter(d=>key(d.name.replace(/^phòng\s+/iu,''))===key(departmentName.replace(/^phòng\s+/iu,'')));
    if(matches.length!==1)throw new Error('Import departments first; department must be unambiguous.');
    const department=matches[0],people=new Map();
    if(!diagramOnly)for(const table of source.tables)for(const row of table.slice(1))if(row[1]?.trim())people.set(key(row[1]),{name:row[1].trim(),position:row[3]?.trim()||null});
    for(const node of source.diagram_nodes){
      const parts=node.text.split('|').map(p=>p.trim());
      const name=parts.at(-1);
      // Only explicit personal names; exclude vacant boxes and titles.
      if(!/^(Nguyễn|Lê|Trần|Phạm|Hoàng|Đặng|Bùi|Cao|Lại)\s*\p{L}+/u.test(name)||name.split(/\s+/u).length<3)continue;
      if(!people.has(key(name)))people.set(key(name),{name,position:parts.length>1?parts[0]:null});
    }
    for(const [personKey,person] of people){
      const existing=employees.filter(e=>key(e.full_name)===personKey);
      if(existing.length){
        if(existing.length!==1||existing[0].department_id!==department.id)throw new Error('Ambiguous existing employee; no records were committed.');
        skipped++;continue;
      }
      const email=`docx-${createHash('sha256').update(source.source+'|'+personKey).digest('hex').slice(0,16)}@company.vn`;
      // Each password is random, immediately discarded, and never written to logs/files.
      const hash=await bcrypt.hash(randomBytes(48).toString('base64url'),10);
      const employee=(await client.query(`INSERT INTO employees(full_name,email,password_hash,role,position,department_id,status)
        VALUES($1,$2,$3,'employee',$4,$5,'active') RETURNING id,full_name,email,role,position,department_id,status`,[person.name,email,hash,person.position,department.id])).rows[0];
      await writeAudit(client,{entityType:'employee',entityId:employee.id,actorId:actor.id,action:'create',after:employee,reason:`${source.source}; email tạm; thông tin cần xác minh; chưa xác nhận chức danh, tuyến quản lý và ngày vào làm.`});
      employees.push(employee);added++;
    }
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode:apply?'applied-local':'dry-run',source:diagramOnly?'diagram-only':'tables-and-diagrams',deleted,added,skipped,temporaryEmailDomain:'company.vn',rolesAssigned:'employee'}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Import failed:',error.code||error.message);process.exitCode=1;}
finally{await client.end();}
