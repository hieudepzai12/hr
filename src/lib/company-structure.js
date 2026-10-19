// Organizational titles come from employee records, never from login role labels.
export function isCompanyLeader(employee) {
  const title=employee.position?.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
  return employee.role!=='admin'&&/^(tổng )?giám đốc( công ty)?$/u.test(title||'');
}
export function subordinateCount(node) {
  const seen=new Set([node.id]);
  function count(children){let total=0;for(const child of children){if(seen.has(child.id))continue;seen.add(child.id);total+=1+count(child.children);}return total;}
  return count(node.children);
}
export function departmentStructure(employees, departmentId) {
  const people=employees.filter(e=>String(e.department_id)===String(departmentId)&&e.role!=='admin'&&!isCompanyLeader(e));
  const ids=new Set(people.map(e=>e.id)), children=new Map(), visited=new Set();
  for(const person of people){const parent=ids.has(person.manager_id)&&person.manager_id!==person.id?person.manager_id:null;const list=children.get(parent)||[];list.push(person);children.set(parent,list);}
  function node(person,ancestors=new Set()){
    if(ancestors.has(person.id))return null;
    visited.add(person.id);
    const next=new Set([...ancestors,person.id]);
    return {id:person.id,title:person.position?.trim()||null,children:(children.get(person.id)||[]).map(child=>node(child,next)).filter(Boolean)};
  }
  const roots=(children.get(null)||[]).map(p=>node(p));
  // Keep malformed cyclic components visible without inventing management links.
  const unresolved=people.filter(p=>!visited.has(p.id)).map(p=>({id:p.id,title:p.position?.trim()||null,children:[]}));
  return {roots:[...roots,...unresolved],count:people.length,unresolved:unresolved.length};
}
