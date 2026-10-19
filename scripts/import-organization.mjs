// Import private, extracted Word evidence. Dry run by default; local database only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { writeAudit } from '../src/lib/audit.js';

if (!process.env.DATABASE_URL) process.loadEnvFile('.env.local');
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('Only a local database is permitted.');
const evidence = JSON.parse(readFileSync('imports/organization-review.json','utf8'));
const normalize = value => value.normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
const client = new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
const apply = process.argv.includes('--apply');
let added = 0, skipped = 0;
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('otis-organization-source-import'))");
  const actor = (await client.query("SELECT id FROM employees WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];
  if (!actor) throw new Error('An active local administrator is required.');
  const departments = (await client.query('SELECT * FROM departments')).rows;
  const positions = (await client.query('SELECT * FROM positions')).rows;
  if (apply) {
    mkdirSync('imports/verification',{recursive:true});
    writeFileSync(`imports/verification/org-before-${Date.now()}.json`,JSON.stringify({departments,positions},null,2),{mode:0o600});
  }
  for (const source of evidence.sources) {
    const name = source.source.replace(/^SƠ ĐỒ TỔ CHỨC /u,'').replace(/\.docx$/i,'').toLocaleLowerCase('vi');
    const departmentName = name.replace(/^phòng /u,'');
    const matches = departments.filter(d=>normalize(d.name).replace(/^phòng /u,'')===normalize(departmentName));
    if (matches.length>1) throw new Error('Ambiguous department; review before import.');
    let department = matches[0];
    if (!department) {
      department = (await client.query('INSERT INTO departments(name) VALUES($1) RETURNING *',[`Phòng ${departmentName}`])).rows[0];
      departments.push(department);
      await writeAudit(client,{entityType:'department',entityId:department.id,actorId:actor.id,action:'create',after:department,reason:source.source});
    }
    const entries = new Map();
    for (const table of source.tables) for (const row of table.slice(1)) {
      if (!row[1]?.trim()) continue;
      entries.set(normalize(row[1]),{person:row[1].trim(),name:row[3]?.trim()||row[1].trim(),duties:row[2]?.trim()||'Tài liệu chưa mô tả nhiệm vụ; cần xác minh.',location:`Bảng nhiệm vụ, dòng ${row[0]}`});
    }
    for (const node of source.diagram_nodes) {
      const parts = node.text.split('|').map(value=>value.trim());
      if (parts.every(part=>/^[.\s]+$/.test(part))) continue;
      const person = parts.length>1 && !/^[.\s]+$/.test(parts.at(-1)) ? parts.at(-1) : parts.length===1 ? parts[0] : '';
      if (person && entries.has(normalize(person))) continue;
      const key = person ? normalize(person) : node.source_node;
      entries.set(key,{person,name:parts[0],duties:'Chỉ có thông tin trong sơ đồ; nhiệm vụ và tuyến quản lý cần xác minh.',location:`Sơ đồ, nút ${node.source_node}`});
    }
    for (const [key,entry] of entries) {
      const code='DOCX-'+createHash('sha256').update(source.source+'|'+key).digest('hex').slice(0,16).toUpperCase();
      const existing = (await client.query('SELECT id FROM positions WHERE code=$1 OR (department_id=$2 AND source_reference=$3)',[code,department.id,`${source.source} — ${entry.location}`])).rows;
      if(existing.length){skipped++;continue;}
      const record = (await client.query(`INSERT INTO positions(code,name,department_id,responsibilities,requirements,verification_status,source_reference,created_by)
        VALUES($1,$2,$3,$4,$5,'needs_verification',$6,$7) RETURNING *`,[code,entry.name,department.id,entry.duties,`Nhân sự theo tài liệu: ${entry.person||'Chưa xác định'}. Chưa xác nhận phân công hiện tại, ngày hiệu lực và quan hệ quản lý. Đối chiếu bảng nhiệm vụ với sơ đồ trước khi xác minh.`,`${source.source} — ${entry.location}`,actor.id])).rows[0];
      await writeAudit(client,{entityType:'positions',entityId:record.id,actorId:actor.id,action:'create',after:record,reason:'Nhập tài liệu tổ chức; cần xác minh',version:1});
      await client.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES($1,$2,1,$3::jsonb,$4)',['positions',record.id,JSON.stringify(record),actor.id]);
      added++;
    }
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode:apply?'applied-local':'dry-run',added,skipped,employeesCreated:0}));
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Import failed:',error.code||error.message);
  process.exitCode=1;
} finally { await client.end(); }
