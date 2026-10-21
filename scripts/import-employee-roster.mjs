import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import {writeAudit} from '../src/lib/audit.js';

if(!process.env.DATABASE_URL)process.loadEnvFile('.env.local');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database only');
const source=JSON.parse(readFileSync('imports/verification/employee-roster-source.json','utf8'));
const apply=process.argv.includes('--apply'),confirmAbbreviation=process.argv.includes('--confirm-abbreviation');
const key=value=>String(value||'').normalize('NFC').replace(/\s+/gu,'').toLocaleLowerCase('vi');
const excluded=new Set(process.argv.filter(arg=>arg.startsWith('--exclude=')).map(arg=>key(arg.slice('--exclude='.length))));
const plain=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d');
const unitKey=value=>key(value).replace(/^phòng/u,'');
const explicitTitles=new Set(['Giám đốc','Chủ tịch','Kiểm toán viên','Trợ lý KT']);
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
const result={mode:apply?'applied-local':'dry-run',source:source.source,added:[],updated:[],excluded:[],review:[]};
try{
 await client.connect();await client.query('BEGIN');
 await client.query('LOCK TABLE employees IN EXCLUSIVE MODE');
 const fields='id,full_name,email,role,position,department_id,manager_id,join_date,status';
 const employees=(await client.query(`SELECT ${fields} FROM employees ORDER BY id`)).rows;
 const departments=(await client.query('SELECT id,name FROM departments')).rows;
 const actor=employees.find(employee=>employee.role==='admin'&&employee.status==='active');
 if(!actor)throw Error('Active local administrator required');
 mkdirSync('imports/verification',{recursive:true});
 if(apply)writeFileSync(`imports/verification/roster-before-${Date.now()}.json`,JSON.stringify({source:source.source,sha256:source.sha256,employees},null,2),{flag:'wx'});
 const seen=new Set();
 for(const row of source.rows){
  if(!row.name?.trim()||seen.has(key(row.name)))throw Error('Empty or duplicate source name');
  seen.add(key(row.name));
  if(excluded.has(key(row.name))){result.excluded.push(row.name);continue;}
  if(row.join_date&&!/^\d{4}-\d{2}-\d{2}$/.test(row.join_date))throw Error('Invalid date');
  let matches=employees.filter(employee=>key(employee.full_name)===key(row.name));
  if(!matches.length&&row.name.includes('.')){
   const pattern=row.name.split(/\s+/u).map(token=>token.endsWith('.')?`${key(token.slice(0,-1))}\\p{L}*`:key(token)).join('');
   const candidates=employees.filter(employee=>new RegExp(`^${pattern}$`,'u').test(key(employee.full_name)));
   if(confirmAbbreviation&&candidates.length===1)matches=candidates;
   else{result.review.push({name:row.name,issue:'Tên viết tắt cần xác nhận, chưa thêm hoặc sửa',candidates:candidates.map(employee=>employee.full_name)});continue;}
  }
  if(matches.length>1)throw Error('Duplicate employee identity; no data committed');
  const departmentCandidates=departments.filter(department=>unitKey(department.name)===unitKey(row.unit));
  // Some unit cells contain an explicit title rather than a department.
  if(!departmentCandidates.length&&['Kiểm toán viên','Trợ lý KT'].includes(row.unit))departmentCandidates.push(...departments.filter(department=>unitKey(department.name)===unitKey(row.section)));
  const department=departmentCandidates.length===1?departmentCandidates[0]:null;
  const title=explicitTitles.has(row.unit)?row.unit:'Nhân viên';
  if(matches.length){
   const before=matches[0];if(before.role==='admin'){result.review.push({name:row.name,issue:'Giữ nguyên tài khoản Admin'});continue;}
   if(department&&before.department_id&&Number(before.department_id)!==department.id)result.review.push({name:row.name,issue:'Bộ phận khác dữ liệu hiện có; giữ nguyên',documentUnit:row.unit});
   if(!department&&!explicitTitles.has(row.unit))result.review.push({name:row.name,issue:'Bộ phận chưa có trong danh mục; giữ nguyên',documentUnit:row.unit});
   const currentDate=before.join_date?String(before.join_date).slice(0,10):null;
   if(currentDate&&row.join_date&&currentDate!==row.join_date)result.review.push({name:row.name,issue:'Ngày vào làm khác dữ liệu hiện có; giữ nguyên',current:currentDate,document:row.join_date});
   const nextTitle=before.position?.trim()?before.position:title;
   const nextDate=currentDate||row.join_date;
   const nextDepartment=before.department_id||department?.id||null;
   if(nextTitle!==before.position||nextDate!==currentDate||nextDepartment!==before.department_id){
    const after=(await client.query(`UPDATE employees SET position=$1,join_date=$2,department_id=$3 WHERE id=$4 RETURNING ${fields}`,[nextTitle,nextDate,nextDepartment,before.id])).rows[0];
    await writeAudit(client,{entityType:'employee',entityId:before.id,actorId:actor.id,action:'edit',before,after,reason:`Bổ sung trường trống từ ${source.source}; ${source.sha256}`});
    result.updated.push({id:before.id,name:before.full_name});Object.assign(before,after);
   }
  }else{
   if(!department)result.review.push({name:row.name,issue:'Nhân sự mới chưa phân phòng ban vì tài liệu chưa rõ hoặc chưa có bộ phận tương ứng',documentUnit:row.unit});
   const base=plain(row.name).toLowerCase().replace(/[^a-z0-9]/g,'');
   let email=`${base}@company.vn`,suffix=2;
   while(employees.some(employee=>employee.email.toLowerCase()===email))email=`${base}${suffix++}@company.vn`;
   const hash=await bcrypt.hash(randomBytes(48).toString('base64url'),10);
   const after=(await client.query(`INSERT INTO employees(full_name,email,password_hash,role,position,department_id,join_date,status) VALUES($1,$2,$3,'employee',$4,$5,$6,'active') RETURNING ${fields}`,[row.name,email,hash,title,department?.id||null,row.join_date])).rows[0];
   await writeAudit(client,{entityType:'employee',entityId:after.id,actorId:actor.id,action:'create',after,reason:`${source.source}; ${source.sha256}; email tạm @company.vn cần xác minh, không tự cấp quyền hoặc tuyến quản lý.`});
   employees.push(after);result.added.push({id:after.id,name:after.full_name});
  }
 }
 await client.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(`imports/verification/roster-${apply?'applied':'preview'}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Roster import failed:',error.code||error.message);process.exitCode=1;}
finally{await client.end();}
