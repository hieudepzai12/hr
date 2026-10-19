// Synchronize direct managers from explicit diagram edges, without granting roles.
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {writeAudit} from '../src/lib/audit.js';
if(!process.env.DATABASE_URL)process.loadEnvFile('.env.local');
const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
const sources=JSON.parse(readFileSync('imports/organization-review.json','utf8')).sources;
const key=s=>s.normalize('NFC').replace(/\s+/gu,'').toLocaleLowerCase('vi');
const client=new pg.Client({connectionString:url});
let updated=0,unfilled=0;
try{
 await client.connect();await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('otis-organization-source-import'))");
 await client.query('LOCK TABLE employees IN EXCLUSIVE MODE');
 const employees=(await client.query('SELECT id,full_name,manager_id,department_id,role,email FROM employees')).rows;
 const actor=employees.find(e=>e.role==='admin');
 if(!actor)throw new Error('Administrator required');
 for(const source of sources){
  const nodes=new Map(source.diagram_nodes.map(n=>[n.source_node,n]));
  const parents=new Map((source.diagram_connections||[]).filter(e=>(e.type||'parOf')==='parOf').map(e=>[e.destId,e.srcId]));
  const personFor=node=>{
   const name=node?.text.split('|').at(-1).trim();
   if(!name)return null;
   const matches=employees.filter(e=>e.role!=='admin'&&key(e.full_name)===key(name));
   if(matches.length>1)throw new Error('Ambiguous employee name');
   return matches[0]||null;
  };
  for(const [id,node] of nodes){
   const employee=personFor(node);
   if(!employee)continue;
   let parent=parents.get(id);const visited=new Set([id]);
   while(parent&&!nodes.has(parent)&&!visited.has(parent)){visited.add(parent);parent=parents.get(parent);}
   if(parent&&visited.has(parent))throw new Error('Cyclic diagram');
   // Never skip an unnamed management box to use a more senior manager.
   const manager=personFor(nodes.get(parent));
   if(manager&&(manager.id===employee.id||manager.department_id!==employee.department_id))throw new Error('Invalid manager relationship');
   const managerId=manager?.id||null;
   if(!manager)unfilled++;
   if(employee.manager_id===managerId)continue;
   await client.query('UPDATE employees SET manager_id=$1 WHERE id=$2',[managerId,employee.id]);
   await writeAudit(client,{entityType:'employee',entityId:employee.id,actorId:actor.id,action:'update',before:{manager_id:employee.manager_id},after:{manager_id:managerId},reason:`${source.source}; quản lý trực tiếp theo ô cấp trên liền kề; dữ liệu tài liệu cần xác minh.`});
   employee.manager_id=managerId;updated++;
  }
 }
 const byId=new Map(employees.map(e=>[e.id,e]));
 for(const employee of employees){let current=employee;const seen=new Set();while(current){if(seen.has(current.id))throw new Error('Cyclic employee management');seen.add(current.id);current=byId.get(current.manager_id);}}
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'applied-local':'dry-run',updated,unfilledManager:unfilled,rolesChanged:0}));
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.code||e.message);process.exitCode=1;}finally{await client.end();}
