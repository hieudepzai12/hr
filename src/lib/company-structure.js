import {jobTitles} from './employee-job-titles.js';
const normalizeTitle=title=>title.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
export const companyLeadershipTitles=employee=>jobTitles(employee.position).filter(title=>/^(tổng )?giám đốc(?: (?:công ty|điều hành))?$/u.test(normalizeTitle(title)));
export function departmentHeads(structure){
 return structure.roots.filter(node=>node.children.length>0||/trưởng|trường phòng|quản lý/iu.test(node.title||''));
}
// Organizational titles come from employee records, never from login role labels.
export function isCompanyLeader(employee) {
  return employee.role!=='admin'&&companyLeadershipTitles(employee).length>0;
}
export function delegatedDepartmentTitles(employee,department){
 if(employee.role==='admin'||jobTitles(employee.position).length<2)return [];
 const departmentName=normalizeTitle(department.name||'').replace(/^phòng\s+/u,'');
 return jobTitles(employee.position).filter(title=>{
  const normalized=normalizeTitle(title);
  const explicit=normalized.split(' — ');
  if(explicit.length===2)return explicit[1].replace(/^phòng\s+/u,'')===departmentName;
  if(departmentName&&normalized.endsWith(` ${departmentName}`)&&normalized!==departmentName)return true;
  const match=normalizeTitle(title).match(/^trưởng (?:phòng|bộ phận)(?:\s+(.+))?$/u);
  if(!match)return false;
  return match[1]?Boolean(departmentName)&&match[1]===departmentName:String(employee.department_id)===String(department.id);
 });
}
export function visibleOrganizationEmployees(employees,departments,user,companyWide){
 if(companyWide)return employees;
 return employees.filter(employee=>(user.department_id!=null&&employee.department_id===user.department_id)||employee.role==='director'||departments.some(department=>delegatedDepartmentTitles(employee,department).length>0));
}
export function personnelChartPeople(employees,departments){
 const delegated=new Map(),result=[];
 for(const employee of employees){
  const leader=isCompanyLeader(employee);
  result.push({...employee,position:leader?companyLeadershipTitles(employee).join('; '):employee.position,all_positions:employee.position,company_level:leader,concurrent:jobTitles(employee.position).length>1});
  for(const department of departments){
   if(!leader&&String(employee.department_id)===String(department.id))continue;
   const titles=delegatedDepartmentTitles(employee,department);if(!titles.length)continue;
   const id=`${employee.id}:department:${department.id}`;
   delegated.set(`${employee.id}:${department.id}`,id);
   result.push({...employee,id,source_employee_id:employee.id,position:titles.join('; '),all_positions:employee.position,department_id:department.id,manager_id:employee.id,concurrent:true,delegated:true});
  }
 }
 return result.map(person=>person.delegated?person:{...person,manager_id:delegated.get(`${person.manager_id}:${person.department_id}`)||person.manager_id});
}
export function subordinateCount(node) {
  const seen=new Set([node.id]);
  function count(children){let total=0;for(const child of children){if(seen.has(child.id))continue;seen.add(child.id);total+=1+count(child.children);}return total;}
  return count(node.children);
}
export function departmentStructure(employees, departmentId, departmentName='') {
  const people=employees.flatMap(e=>{
    if(e.role==='admin')return [];
    if(!isCompanyLeader(e)&&String(e.department_id)===String(departmentId))return [e];
    const titles=delegatedDepartmentTitles(e,{id:departmentId,name:departmentName});
    return titles.length?[{...e,position:titles.join('; '),concurrent:true}]:[];
  });
  const ids=new Set(people.map(e=>e.id)), children=new Map(), visited=new Set();
  for(const person of people){const parent=ids.has(person.manager_id)&&person.manager_id!==person.id?person.manager_id:null;const list=children.get(parent)||[];list.push(person);children.set(parent,list);}
  function node(person,ancestors=new Set()){
    if(ancestors.has(person.id))return null;
    visited.add(person.id);
    const next=new Set([...ancestors,person.id]);
    return {id:person.id,title:person.position?.trim()||null,concurrent:Boolean(person.concurrent),children:(children.get(person.id)||[]).map(child=>node(child,next)).filter(Boolean)};
  }
  const roots=(children.get(null)||[]).map(p=>node(p));
  // Keep malformed cyclic components visible without inventing management links.
  const unresolved=people.filter(p=>!visited.has(p.id)).map(p=>({id:p.id,title:p.position?.trim()||null,children:[]}));
  return {roots:[...roots,...unresolved],count:people.length,unresolved:unresolved.length};
}
