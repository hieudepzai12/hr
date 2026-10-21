import {randomUUID} from 'node:crypto';
import {jobTitles} from './employee-job-titles.js';
import {GovernanceError,validId} from './governance-validation.js';
import {writeAudit} from './audit.js';

export async function resolvePlannedPosition(client,body,user,authorize){
 const title=typeof body.position_name==='string'?body.position_name.trim():'';
 if(typeof title!=='string'||!title||title.length>300||/[;\r\n]/.test(title)||!validId(body.position_department_id))throw new GovernanceError('Cần tên chức vụ và phòng ban hợp lệ');
 const departmentId=Number(body.position_department_id);
 authorize({id:user.id,department_id:departmentId});
 if(!(await client.query('SELECT id FROM departments WHERE id=$1 FOR SHARE',[departmentId])).rowCount)throw new GovernanceError('Phòng ban không tồn tại');
 return ensurePosition(client,{title,departmentId,ownerId:user.id},user,'Liên kết chức vụ khi lập nhu cầu tuyển dụng hoặc dự toán');
}

// Legacy position IDs remain valid. New duties use the employee's actual job title.
export async function resolveDutyPosition(client,body,user,requireEmployee){
 if(!validId(body.employee_id))throw new GovernanceError('Cần chọn nhân viên hợp lệ');
 const employee=(await client.query("SELECT * FROM employees WHERE id=$1 AND status='active' FOR SHARE",[body.employee_id])).rows[0];
 if(!employee)throw new GovernanceError('Nhân viên không còn hoạt động');
 requireEmployee(employee);
 const titles=jobTitles(employee.position);
 const supplied=typeof body.position_title==='string'?body.position_title.trim():'';
 const title=supplied?titles.find(title=>title===supplied):(titles[0]||'Nhân viên');
 if(!title)throw new GovernanceError('Chức vụ không thuộc hồ sơ nhân viên. Vui lòng tải lại biểu mẫu.');
 if(!employee.department_id)throw new GovernanceError('Cần phân phòng ban cho nhân viên trước khi giao nhiệm vụ');
 return ensurePosition(client,{title,departmentId:employee.department_id,ownerId:employee.id},user,'Liên kết chức vụ từ hồ sơ khi phân công nhiệm vụ');
}

async function ensurePosition(client,{title,departmentId,ownerId},user,reason){
 const existing=(await client.query('SELECT id FROM positions WHERE department_id=$1 AND lower(name)=lower($2) AND deleted_at IS NULL ORDER BY id LIMIT 1',[departmentId,title])).rows[0];
 if(existing)return existing.id;
 const position=(await client.query(`INSERT INTO positions(code,name,department_id,responsibilities,owner_id,created_by) VALUES($1,$2,$3,'',$4,$5) RETURNING *`,['JOB-'+randomUUID(),title,departmentId,ownerId,user.id])).rows[0];
 await client.query("INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES('positions',$1,$2,$3::jsonb,$4)",[position.id,position.version,JSON.stringify(position),user.id]);
 await writeAudit(client,{entityType:'governance:positions',entityId:position.id,actorId:user.id,action:'create',before:{},after:position,reason,version:position.version});
 return position.id;
}
