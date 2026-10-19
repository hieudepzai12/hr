import { queryOne } from './db';
import { scopeAllows } from './access';
export async function validateTaskProject(user,projectId,departmentId,customerId){
  if(projectId===undefined||projectId===null||projectId==='')return null;
  if(!Number.isSafeInteger(Number(projectId))||Number(projectId)<=0)return 'Dự án không hợp lệ';
  const project=await queryOne('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL',[projectId]);
  if(!project||!scopeAllows(user,'projects','view',{ownerId:project.owner_id,departmentId:project.department_id}))return 'Dự án không tồn tại hoặc ngoài quyền truy cập';
  if(Number(project.department_id)!==Number(departmentId))return 'Phòng phụ trách công việc phải khớp phòng phụ trách dự án';
  if(customerId&&project.customer_id&&Number(customerId)!==Number(project.customer_id))return 'Khách hàng của công việc khác khách hàng dự án';
  return null;
}
