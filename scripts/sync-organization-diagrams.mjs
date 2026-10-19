import {readFileSync} from 'node:fs';
import pg from 'pg';
import {writeAudit} from '../src/lib/audit.js';
if(!process.env.DATABASE_URL)process.loadEnvFile('.env.local');
const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
const sources=JSON.parse(readFileSync('imports/organization-review.json','utf8')).sources;
const key=s=>s.normalize('NFC').replace(/\s+/gu,'').toLocaleLowerCase('vi');
const client=new pg.Client({connectionString:url});
let updated=0;
try{
 await client.connect();await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('otis-organization-source-import'))");
 const actor=(await client.query("SELECT id FROM employees WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];
 if(!actor)throw new Error('Administrator required');
 for(const source of sources){
  const records=(await client.query("SELECT * FROM positions WHERE deleted_at IS NULL AND source_reference LIKE $1",[source.source+' — %'])).rows;
  const nodes=new Map(source.diagram_nodes.filter(n=>!/^[.\s]+$/.test(n.text)).map(n=>[n.source_node,n]));
  const parents=new Map((source.diagram_connections||[]).filter(e=>(e.type||'parOf')==='parOf').map(e=>[e.destId,e.srcId]));
  const mapped=new Map();
  for(const [id,node] of nodes){
   const parts=node.text.split('|').map(p=>p.trim()),person=parts.at(-1);
   const record=records.find(r=>r.source_reference.endsWith(id))||records.find(r=>key(r.requirements?.match(/^Nhân sự theo tài liệu: (.*?)\. Chưa xác nhận/u)?.[1]||'')===key(person));
   if(!record)throw new Error('A diagram node has no matching imported position');
   mapped.set(id,record);
  }
  for(const [id,node] of nodes){
   const record=mapped.get(id),parts=node.text.split('|').map(p=>p.trim());
   const named=/^(Nguyễn|Lê|Trần|Phạm|Hoàng|Đặng|Bùi|Cao|Lại)\s*\p{L}+/u.test(parts.at(-1));
   let parent=parents.get(id);const visited=new Set([id]);
   while(parent&&!nodes.has(parent)&&!visited.has(parent)){visited.add(parent);parent=parents.get(parent);}
   if(parent&&visited.has(parent))throw new Error('Cyclic diagram');
   const after={...record,name:parts.length>1||!named?parts[0]:'Nhân sự (chưa ghi chức danh)',parent_id:mapped.get(parent)?.id||null,
    source_reference:`${source.source} — Sơ đồ, nút ${id}`,
    requirements:`Nhân sự theo tài liệu: ${named?parts.at(-1):'Chưa xác định'}. Chưa xác nhận phân công hiện tại, ngày hiệu lực và quan hệ quản lý. Liên kết sơ đồ được đọc từ SmartArt trong tài liệu; cần xác minh với thực tế.`};
   if(['name','parent_id','source_reference','requirements'].every(k=>record[k]===after[k]))continue;
   after.version=record.version+1;
   await client.query('UPDATE positions SET name=$1,parent_id=$2,source_reference=$3,requirements=$4,version=$5,updated_at=NOW() WHERE id=$6',[after.name,after.parent_id,after.source_reference,after.requirements,after.version,record.id]);
   await writeAudit(client,{entityType:'positions',entityId:record.id,actorId:actor.id,action:'update',before:record,after,reason:'Đồng bộ cấu trúc SmartArt từ tài liệu gốc; cần xác minh',version:after.version});
   await client.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)',['positions',record.id,after.version,JSON.stringify(after),actor.id]);updated++;
  }
 }
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');console.log(JSON.stringify({updated,mode:process.argv.includes('--apply')?'applied-local':'dry-run'}));
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.code||e.message);process.exitCode=1;}finally{await client.end();}
