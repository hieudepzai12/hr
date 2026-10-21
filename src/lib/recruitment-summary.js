import {delegatedDepartmentTitles} from './company-structure.js';
export function summarizeRecruitment(rows){
 const departments=new Map();
 for(const row of rows){
  if(row.deleted_at||row.status!=='approved'||!['pending','recruiting'].includes(row.hiring_status))continue;
  const summary=departments.get(row.department_id)||{department_id:row.department_id,remaining:0,request_count:0};
  summary.remaining+=Math.max(0,Number(row.quantity)-Number(row.hired_count||0));
  summary.request_count++;
  departments.set(row.department_id,summary);
 }
 return [...departments.values()];
}
export function departmentHeadcount(employees,departmentId,recruitment,departmentName=''){
 const members=employees.filter(e=>e.role!=='admin'&&(!e.status||e.status==='active')&&(String(e.department_id)===String(departmentId)||delegatedDepartmentTitles(e,{id:departmentId,name:departmentName}).length>0));
 const current=new Set(members.map(e=>e.id)).size;
 const needed=recruitment==null?null:(recruitment.find(r=>String(r.department_id)===String(departmentId))?.remaining??0);
 return {current,needed,total:needed==null?null:current+needed};
}
