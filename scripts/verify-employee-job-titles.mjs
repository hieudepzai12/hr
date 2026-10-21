import assert from 'node:assert/strict';
import {employeePosition,jobTitles} from '../src/lib/employee-job-titles.js';
import {isCompanyLeader} from '../src/lib/company-structure.js';
assert.deepEqual(jobTitles('Kế toán trưởng'),['Kế toán trưởng']);
const two=['Kế toán trưởng','Phụ trách dự án'];
assert.deepEqual(jobTitles(employeePosition({position_titles:two})),two);
assert.equal(employeePosition({position_titles:[' Kế toán ','kế toán']}),'Kế toán');
assert.equal(employeePosition({position_titles:[]}),null);
assert.equal(employeePosition({position:'Giám đốc; Kế toán trưởng'}),'Giám đốc; Kế toán trưởng');
assert.throws(()=>employeePosition({position_titles:'invalid'}));
assert.throws(()=>employeePosition({position_titles:['a;b']}));
assert.throws(()=>employeePosition({position_titles:[null]}));
assert.throws(()=>employeePosition({position_titles:Array(11).fill('Title')}));
assert.equal(isCompanyLeader({role:'employee',position:'Kế toán trưởng; Giám đốc'}),true);
console.log('PASS: multiple titles, old values, duplicates, clearing, malformed input and leadership recognition');

if(process.argv.includes('--api')){
 const {randomUUID}=await import('node:crypto');
 const {default:pg}=await import('pg'),{default:jwt}=await import('jsonwebtoken');
 if(!process.env.DATABASE_URL)process.loadEnvFile('.env.local');
 const url=process.env.DATABASE_URL;
 if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
 const client=new pg.Client({connectionString:url});let fixtureId;
 try{
  await client.connect();const admin=(await client.query("SELECT id,token_version FROM employees WHERE role='admin' AND status='active' LIMIT 1")).rows[0];
  const cookie='hr_session='+jwt.sign({id:admin.id,ver:admin.token_version},process.env.JWT_SECRET,{expiresIn:'5m'});
  const request=(path,method='GET',body)=>fetch('http://localhost:3000/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const response=await request('/employees','POST',{full_name:'Job title test fixture',email:`job-title-${randomUUID()}@example.invalid`,password:randomUUID(),role:'employee',position_titles:two});
  assert.equal(response.status,201);const fixture=await response.json();fixtureId=fixture.id;assert.deepEqual(jobTitles(fixture.position),two);
  const update=await request(`/employees/${fixtureId}`,'PUT',{...fixture,position_titles:['Giám đốc','Kế toán trưởng']});assert.equal(update.status,200);
  const profile=await (await request(`/profiles/${fixtureId}`)).json();assert.deepEqual(jobTitles(profile.position),['Giám đốc','Kế toán trưởng']);assert.equal(profile.role,'employee');
  assert.equal((await request(`/employees/${fixtureId}`,'PUT',{...fixture,position_titles:['bad;title']})).status,400);
  assert.equal((await request(`/employees/${fixtureId}`,'PUT',{...fixture,position_titles:[]})).status,200);
  assert.equal((await (await request(`/employees/${fixtureId}`)).json()).position,null);
  console.log('PASS: create, update, profile display, role unchanged, invalid input and clear titles via API');
 }finally{if(fixtureId)await client.query('DELETE FROM employees WHERE id=$1',[fixtureId]);await client.end();}
}
