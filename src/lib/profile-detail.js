import {query,queryOne} from './db';
import {scopeFor,scopeAllows} from './access';
import {governanceScope} from './governance-service';
import {vietnamToday} from './deadline';
import {getRoleLabel} from './role-permissions';
export async function profileDetail(emp,user){
    emp.manager_name=emp.manager_id?(await queryOne('SELECT full_name FROM employees WHERE id=$1 AND (department_id=$2 OR id=$3 OR $4::boolean)',[emp.manager_id,user.department_id,user.id,Boolean(user.permissions.employees.manage)]))?.full_name||null:null;
    emp.assignments=null;
    if(scopeFor(user,'positions','view')!=='none'){
      const positionScope=governanceScope(user,'positions','view','p',2);
      const assignmentScope=governanceScope(user,'positions','view','a',2+positionScope.params.length);
      const values=[emp.id,...positionScope.params,...assignmentScope.params,vietnamToday()];
      emp.assignments=(await query(`SELECT a.id,a.name AS duty_name,a.start_date,a.end_date,p.name,COALESCE(NULLIF(a.notes,''),p.responsibilities) AS responsibilities,p.requirements,p.verification_status,
        pr.id AS project_id,pr.name AS project_name,pr.department_id AS project_department_id,pr.owner_id AS project_owner_id
        FROM position_assignments a JOIN positions p ON p.id=a.position_id LEFT JOIN projects pr ON pr.id=a.project_id AND pr.deleted_at IS NULL
        WHERE a.employee_id=$1 AND a.deleted_at IS NULL AND p.deleted_at IS NULL
        AND ${positionScope.sql} AND ${assignmentScope.sql}
        AND a.start_date<=$${values.length}::date AND (a.end_date IS NULL OR a.end_date>=$${values.length}::date)
        ORDER BY a.start_date DESC,a.id DESC`,values)).rows.map(({project_department_id,project_owner_id,...assignment})=>scopeAllows(user,'projects','view',{departmentId:project_department_id,ownerId:project_owner_id})?assignment:{...assignment,project_id:null,project_name:assignment.project_id?'Không có quyền xem dự án':null});
    }

emp.role_label=await getRoleLabel(emp.role);
return emp;
}
