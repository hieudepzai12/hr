import { queryOne } from './db';
import { scopeAllows, scopeFor } from './access';
export const projectDepartmentsSelect = (alias='r') => `ARRAY(SELECT pd.department_id FROM project_departments pd WHERE pd.project_id=${alias}.id ORDER BY pd.department_id) AS department_ids,
  (SELECT string_agg(d.name, ', ' ORDER BY d.name) FROM project_departments pd JOIN departments d ON d.id=pd.department_id WHERE pd.project_id=${alias}.id) AS department_ids_label`;
export function projectViewScope(user,alias='r',start=1) {
  const scope=scopeFor(user,'projects','view');
  if(scope==='all')return {sql:'TRUE',params:[]};
  if(scope==='self')return {sql:`${alias}.owner_id=$${start}`,params:[user.id]};
  if(scope==='department')return {sql:`(${alias}.department_id=$${start} OR EXISTS(SELECT 1 FROM project_departments pd WHERE pd.project_id=${alias}.id AND pd.department_id=$${start}))`,params:[user.department_id??-1]};
  return {sql:'FALSE',params:[]};
}
export function canViewProject(user,project) {
  return scopeAllows(user,'projects','view',{ownerId:project.owner_id,departmentId:project.department_id}) ||
    scopeFor(user,'projects','view')==='department' && project.department_ids?.map(Number).includes(Number(user.department_id));
}
export async function validateTaskProject(user,projectId,departmentId,customerId){
  if(projectId===undefined||projectId===null||projectId==='')return null;
  if(!Number.isSafeInteger(Number(projectId))||Number(projectId)<=0)return 'Dự án không hợp lệ';
  const project=await queryOne(`SELECT r.*,${projectDepartmentsSelect()} FROM projects r WHERE r.id=$1 AND r.deleted_at IS NULL`,[projectId]);
  if(!project||!canViewProject(user,project))return 'Dự án không tồn tại hoặc ngoài quyền truy cập';
  if(![project.department_id,...project.department_ids].map(Number).includes(Number(departmentId)))return 'Phòng của công việc chưa tham gia dự án';
  if(customerId&&project.customer_id&&Number(customerId)!==Number(project.customer_id))return 'Khách hàng của công việc khác khách hàng dự án';
  return null;
}
