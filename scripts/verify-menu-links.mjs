import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {GOVERNANCE} from '../src/lib/governance-config.js';

process.loadEnvFile('.env.local');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database only');
const base=process.env.VERIFY_BASE_URL || 'http://localhost:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local API only');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
const failures=[];let checked=0;
try{
 const admin=(await client.query("SELECT id,token_version FROM employees WHERE role='admin' AND status='active' LIMIT 1")).rows[0];
 const cookie='hr_session='+jwt.sign({id:admin.id,ver:admin.token_version},process.env.JWT_SECRET,{expiresIn:'10m'});
 const check=async path=>{
  const response=await fetch(base+path,{headers:{cookie}});checked++;
  if(!response.ok)failures.push({path,status:response.status});
  if(path.startsWith('/api/')&&response.ok){try{return await response.json();}catch{failures.push({path,error:'Invalid JSON'});}}
 };
 const nav=await readFile('src/lib/navigation.js','utf8');
 const declared=[...nav.matchAll(/to:'([^']+)'/g)].map(match=>match[1]);
 assert.equal(new Set(declared).size,declared.length,'Duplicate menu routes');
 const routes=[...new Set(declared)];
 for(const path of routes){
  try{await access('src/app'+(path==='/'?'':path)+'/page.js');}catch{failures.push({path,error:'Missing page file'});}
  await check(path);
 }
 for(const path of ['/ho-so','/profile-nhan-su','/bien-dong-nhan-su'])await check(path);
 for(const resource of Object.keys(GOVERNANCE)){
  const data=await check('/api/governance/'+resource);
  if(data?.items?.length)await check('/api/governance/'+resource+'/'+data.items[0].id);
  await check('/api/governance/'+resource+'?options=1');
 }
 for(const path of ['/auth/me','/employees?limit=2','/departments','/customers','/tasks?limit=2','/tasks/alerts','/reports?limit=2','/kpi?limit=2','/organization','/roles','/permissions','/profiles?limit=2','/governance/insights','/governance/activity'])await check('/api'+path);
 console.log(JSON.stringify({menuRoutes:routes.length,requests:checked,failures},null,2));
 assert.equal(failures.length,0,'Menu/API links failed');
}finally{await client.end();}
