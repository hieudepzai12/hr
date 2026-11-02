import {queryOne} from './db';
import {getRoleLabel} from './role-permissions';
export async function profileDetail(emp,user){
    emp.manager_name=emp.manager_id?(await queryOne('SELECT full_name FROM employees WHERE id=$1 AND (department_id=$2 OR id=$3 OR $4::boolean)',[emp.manager_id,user.department_id,user.id,Boolean(user.permissions.employees.manage)]))?.full_name||null:null;
emp.role_label=await getRoleLabel(emp.role);
return emp;
}
