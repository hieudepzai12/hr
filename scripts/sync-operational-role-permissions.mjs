import { mkdirSync,writeFileSync } from 'node:fs';
import pg from 'pg';
import { operationalRolePermissions } from '../src/lib/operational-role-permissions.js';
import { writeAudit } from '../src/lib/audit.js';

process.loadEnvFile('.env.local');
const connection=process.env.DATABASE_URL;
const apply=process.argv.includes('--apply');
if(apply&&!['localhost','127.0.0.1','[::1]'].includes(new URL(connection).hostname)&&!process.argv.includes('--allow-remote'))throw new Error('Remote write requires --allow-remote');
const client=new pg.Client({connectionString:connection,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query(apply?'BEGIN':'BEGIN READ ONLY');
  if(apply){
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query('LOCK TABLE role_permissions IN EXCLUSIVE MODE');
    await client.query('LOCK TABLE employees IN SHARE MODE');
  }
  const before=(await client.query('SELECT role,label,permissions,is_deleted,updated_at FROM role_permissions ORDER BY role')).rows;
  const usage=(await client.query("SELECT role,COUNT(*)::int AS count,COUNT(*) FILTER(WHERE status='active')::int AS active FROM employees GROUP BY role ORDER BY role")).rows;
  const stored=new Map(before.map(row=>[row.role,row]));
  const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
  const plans=usage.map(item=>{
    const current=stored.get(item.role);
    const level=['admin','director','employee'].includes(item.role)?item.role:normalize(current?.label||'')==='truong phong'?'department_head':null;
    if(!level||current?.is_deleted)throw new Error(`No approved operational template for ${item.role}`);
    return {...item,level,label:current?.label||({admin:'Admin',director:'Giám đốc',employee:'Nhân viên'})[item.role],permissions:operationalRolePermissions(level)};
  });
  const output={apply,roles:plans.map(({role,label,count,active,level})=>({role,label,count,active,level})),departmentHeadFinance:'department read only',accounts:'admin only'};
  if(apply){
    const directory=`imports/private/role-permissions-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
    mkdirSync(directory,{recursive:true});
    writeFileSync(`${directory}/before.json`,JSON.stringify({roles:before,usage},null,2));
    writeFileSync(`${directory}/planned.json`,JSON.stringify(plans,null,2));
    const actor=(await client.query("SELECT id FROM employees WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];
    if(!actor)throw new Error('No active Admin found');
    for(const plan of plans){
      await client.query(`INSERT INTO role_permissions(role,label,permissions,is_deleted) VALUES($1,$2,$3::jsonb,false)
        ON CONFLICT(role) DO UPDATE SET permissions=EXCLUDED.permissions,updated_at=NOW()`,[plan.role,plan.label,JSON.stringify(plan.permissions)]);
      await writeAudit(client,{entityType:'role',entityId:plan.role,actorId:actor.id,action:'permission_change',before:stored.get(plan.role)||{},after:{label:plan.label,permissions:plan.permissions},reason:'Điều chỉnh theo vai trò thực tế; Trưởng Phòng chỉ xem tài chính phòng mình.'});
    }
    const after=(await client.query('SELECT role,permissions FROM role_permissions WHERE role=ANY($1::text[])',[plans.map(row=>row.role)])).rows;
    for(const plan of plans){
      const saved=after.find(row=>row.role===plan.role)?.permissions;
      // JSONB key order differs from JS objects; compare each value recursively.
      const canonical=value=>value&&typeof value==='object'?JSON.stringify(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):JSON.stringify(value);
      if(canonical(saved)!==canonical(plan.permissions))throw new Error('Permission verification failed');
    }
    const afterUsage=(await client.query("SELECT role,COUNT(*)::int AS count,COUNT(*) FILTER(WHERE status='active')::int AS active FROM employees GROUP BY role ORDER BY role")).rows;
    if(JSON.stringify(usage)!==JSON.stringify(afterUsage))throw new Error('Employee role assignments changed unexpectedly');
    await client.query('COMMIT');
    writeFileSync(`${directory}/result.json`,JSON.stringify(output,null,2));
    output.backup=directory;
  } else await client.query('ROLLBACK');
  console.log(JSON.stringify(output));
} catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
finally{await client.end();}
