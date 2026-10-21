import { GOVERNANCE } from './governance-config';
import { query, transaction } from './db';
import { scopeFor, scopeAllows } from './access';
import { writeAudit } from './audit';
import {resolveDutyPosition,resolvePlannedPosition} from './personnel-duty';
import {jobTitles} from './employee-job-titles';
import { assertTransition, awardTotal, budgetTotal, GovernanceError, validId, validateGovernanceInput } from './governance-validation';

const REFERENCES = { departments: ['departments', 'name'], employees: ['employees', 'full_name'], customers: ['customers', 'name'], ...Object.fromEntries(Object.entries(GOVERNANCE).map(([key, value]) => [key, [value.table, 'name']])) };
export const configFor = (key) => { if (!Object.hasOwn(GOVERNANCE, key)) throw new GovernanceError('Không tìm thấy chức năng', 404); return GOVERNANCE[key]; };
export function requireRecord(user, config, action, record) {
  if (!scopeAllows(user, config.module, action, { ownerId: record.owner_id, departmentId: record.department_id })) throw new GovernanceError('Bạn không có quyền với dữ liệu này', 403);
}
export function governanceScope(user, module, action = 'view', alias = 'r', start = 1) {
  const scope = scopeFor(user, module, action);
  if (scope === 'all') return { sql: 'TRUE', params: [] };
  if (scope === 'department') return { sql: `${alias}.department_id=$${start}`, params: [user.department_id ?? -1] };
  if (scope === 'self') return { sql: `${alias}.owner_id=$${start}`, params: [user.id] };
  return { sql: 'FALSE', params: [] };
}
export async function listGovernance(resource, searchParams, user) {
  const config = configFor(resource);
  if (scopeFor(user, config.module, 'view') === 'none') throw new GovernanceError('Không có quyền xem', 403);
  const page = Number(searchParams.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new GovernanceError('Trang không hợp lệ');
  const scope = governanceScope(user, config.module);
  if(searchParams.get('tree')==='1'){
    if(resource!=='folders')throw new GovernanceError('Chức năng cây chỉ dành cho thư mục');
    const tree=await query(`SELECT r.id,r.name,r.parent_id FROM document_folders r WHERE r.deleted_at IS NULL AND ${scope.sql} ORDER BY r.name,r.id LIMIT 2001`,scope.params);
    return {items:tree.rows.slice(0,2000),truncated:tree.rows.length>2000};
  }
  const args = [...scope.params];
  const deleted = searchParams.get('deleted') === '1';
  if (deleted && scopeFor(user, config.module, 'restore') === 'none') throw new GovernanceError('Không có quyền khôi phục', 403);
  let where = `${scope.sql} AND r.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`;
  if (deleted) { const restore = governanceScope(user, config.module, 'restore', 'r', args.length + 1); where += ` AND ${restore.sql}`; args.push(...restore.params); }
  for (const key of ['department_id', 'position_id', 'project_id', 'month', 'status', 'verification_status']) {
    const value = searchParams.get(key);
    if (value && (key === 'department_id' || config.fields.some((field) => field.key === key) || key === 'status' && config.workflow)) {
      if (key.endsWith('_id') && !validId(value)) throw new GovernanceError('Bộ lọc không hợp lệ');
      args.push(value); where += ` AND r.${key}=$${args.length}`;
    }
  }
  const search = searchParams.get('search');
  if (search) { if (search.length > 300) throw new GovernanceError('Từ khóa quá dài'); args.push(`%${search}%`); where += ` AND r.name ILIKE $${args.length}`; }
  const sort = ['name', 'created_at', 'updated_at', 'id', ...config.fields.filter((f) => ['date', 'month', 'number'].includes(f.type)).map((f) => f.key)].includes(searchParams.get('sort')) ? searchParams.get('sort') : 'updated_at';
  const direction = searchParams.get('direction') === 'asc' ? 'ASC' : 'DESC';
  const count = await query(`SELECT COUNT(*)::int AS total FROM ${config.table} r WHERE ${where}`, args);
  const labels = config.fields.filter((field) => field.type === 'reference').map((field) => {
    const [table, column] = REFERENCES[field.resource];
    if(resource==='assignments'&&field.key==='project_id'){
      const projectScope=governanceScope(user,'projects','view','p',args.length+1);
      args.push(...projectScope.params);
      return `(SELECT p.name FROM projects p WHERE p.id=r.project_id AND p.deleted_at IS NULL AND ${projectScope.sql}) AS project_id_label`;
    }
    return `(SELECT ${column} FROM ${table} WHERE id=r.${field.key}) AS ${field.key}_label`;
  });
  const actual = resource === 'staffing' ? `, (SELECT COUNT(*)::int FROM employees e WHERE e.department_id=r.department_id AND e.status='active' AND e.role<>'admin') AS actual_count` : '';
  const rows = await query(`SELECT r.* ${labels.length ? ',' + labels.join(',') : ''} ${actual} FROM ${config.table} r WHERE ${where} ORDER BY r.${sort} ${direction},r.id DESC LIMIT 20 OFFSET $${args.length + 1}`, [...args, (page - 1) * 20]);
  return { items: rows.rows, total: count.rows[0].total, page, pageSize: 20 };
}
export async function detailGovernance(resource, id, user) {
  const config = configFor(resource);
  if (!validId(id)) throw new GovernanceError('ID không hợp lệ');
  const found = await query(`SELECT * FROM ${config.table} WHERE id=$1`, [id]);
  const row = found.rows[0];
  if (!row) throw new GovernanceError('Không tìm thấy dữ liệu', 404);
  requireRecord(user, config, 'view', row);
  if (row.deleted_at) requireRecord(user, config, 'restore', row);
  for(const field of config.fields.filter(field=>field.type==='reference'&&row[field.key])){
    const [table,column]=REFERENCES[field.resource];
    if(resource==='assignments'&&field.key==='project_id'){
      const projectScope=governanceScope(user,'projects','view','p',2);
      row.project_id_label=(await query(`SELECT p.name AS label FROM projects p WHERE p.id=$1 AND p.deleted_at IS NULL AND ${projectScope.sql}`,[row.project_id,...projectScope.params])).rows[0]?.label||'Không có quyền xem dự án';
      continue;
    }
    row[`${field.key}_label`]=(await query(`SELECT ${column} AS label FROM ${table} WHERE id=$1`,[row[field.key]])).rows[0]?.label||'—';
  }
  const [history, versions] = await Promise.all([
    query(`SELECT a.id,a.action,a.changes,a.reason,a.created_at,e.full_name AS actor_name FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id WHERE a.entity_type=$1 AND a.entity_id=$2 ORDER BY a.id DESC LIMIT 100`, [`governance:${resource}`, String(id)]),
    query('SELECT version,snapshot,created_at FROM governance_versions WHERE resource=$1 AND entity_id=$2 ORDER BY version DESC', [resource, id]),
  ]);
  let taskSummary=[];
  if(resource==='projects'&&scopeFor(user,'tasks','view')!=='none'){
    const args=[id];let taskWhere='TRUE';const taskScope=scopeFor(user,'tasks','view');
    if(taskScope==='department'){args.push(user.department_id??-1,user.id);taskWhere='(t.department_id=$2 OR t.assignee_id=$3 OR EXISTS(SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$3))';}
    if(taskScope==='self'){args.push(user.id);taskWhere='(t.assignee_id=$2 OR EXISTS(SELECT 1 FROM task_collaborators tc WHERE tc.task_id=t.id AND tc.employee_id=$2))';}
    taskSummary=(await query(`SELECT status,COUNT(*)::int AS count FROM tasks t WHERE t.project_id=$1 AND t.deleted_at IS NULL AND ${taskWhere} GROUP BY status`,args)).rows;
  }
  return { ...row, history: history.rows, versions: versions.rows, taskSummary };
}

async function prepareFields(client, resource, body, user, before, intent) {
  const config = configFor(resource);
  if(['recruitment','budgets'].includes(resource)&&intent!=='restore'&&typeof body.position_id==='string'){
    const authorize=person=>requireRecord(user,config,before?'edit':'create',{owner_id:person.id,department_id:person.department_id});
    if(body.position_id==='new')body={...body,position_id:await resolvePlannedPosition(client,body,user,authorize)};
    else if(body.position_id.startsWith('employee:')){
      const match=body.position_id.match(/^employee:([1-9]\d*):(\d+)$/);
      if(!match||!validId(match[1]))throw new GovernanceError('Chức vụ không hợp lệ');
      const employee=(await client.query("SELECT position FROM employees WHERE id=$1 AND status='active'",[match[1]])).rows[0];
      const title=jobTitles(employee?.position)[Number(match[2])];
      if(!title)throw new GovernanceError('Chức vụ đã thay đổi. Vui lòng mở lại biểu mẫu.');
      body={...body,position_id:await resolveDutyPosition(client,{employee_id:match[1],position_title:title},user,authorize)};
    }
  }
  if(resource==='assignments'&&intent!=='restore'&&Object.hasOwn(body,'position_title')){
    const positionId=await resolveDutyPosition(client,body,user,employee=>requireRecord(user,config,before?'edit':'create',{owner_id:employee.id,department_id:employee.department_id}));
    body={...body,position_id:positionId};
  }
  const fields = validateGovernanceInput(resource, body);
  if(resource==='staffing'&&intent!=='restore')fields.position_id=null;
  const rows = {};
  for (const field of config.fields.filter((field) => field.type === 'reference' && fields[field.key])) {
    const [table] = REFERENCES[field.resource];
    const live = ['employees', 'customers'].includes(field.resource) ? " AND status='active'" : field.resource === 'departments' ? '' : ' AND deleted_at IS NULL';
    const result = await client.query(`SELECT * FROM ${table} WHERE id=$1${live} FOR SHARE`, [fields[field.key]]);
    if (!result.rows[0]) throw new GovernanceError(`${field.label} không còn hoạt động`);
    rows[field.key] = result.rows[0];
  }
  if(resource==='assignments'&&rows.project_id)requireRecord(user,GOVERNANCE.projects,'view',rows.project_id);
  fields.department_id ??= rows.position_id?.department_id ?? rows.project_id?.department_id ?? rows.folder_id?.department_id ?? user.department_id ?? null;
  fields.owner_id ??= rows.folder_id?.owner_id ?? before?.owner_id ?? user.id;
  if (['assignments', 'members', 'awards'].includes(resource)) fields.owner_id = fields.employee_id;
  if(before&&['positions','projects','folders'].includes(resource)&&
    (Number(before.department_id)!==Number(fields.department_id)||resource==='folders'&&Number(before.owner_id)!==Number(fields.owner_id))){
    const links=resource==='folders'
      ? 'SELECT 1 FROM document_folders WHERE parent_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM internal_documents WHERE folder_id=$1 AND deleted_at IS NULL LIMIT 1'
      :resource==='projects'
        ? 'SELECT 1 FROM tasks WHERE project_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM project_members WHERE project_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM position_assignments WHERE project_id=$1 AND deleted_at IS NULL LIMIT 1'
        : 'SELECT 1 FROM position_assignments WHERE position_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM staffing_plans WHERE position_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM salary_budgets WHERE position_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM recruitment_requests WHERE position_id=$1 AND deleted_at IS NULL LIMIT 1';
    if((await client.query(links,[before.id])).rowCount)throw new GovernanceError('Dữ liệu còn liên kết. Cần xử lý các liên kết trước khi đổi đơn vị hoặc chủ quản.',409);
  }
  if (rows.parent_id) {
    if (resource === 'folders' && rows.parent_id.department_id !== fields.department_id) throw new GovernanceError('Thư mục cha khác phòng ban');
    if (before) {
      const cycle = await client.query(`WITH RECURSIVE ancestors AS (SELECT id,parent_id,ARRAY[id] AS visited FROM ${config.table} WHERE id=$1 UNION ALL SELECT r.id,r.parent_id,a.visited||r.id FROM ${config.table} r JOIN ancestors a ON r.id=a.parent_id WHERE NOT r.id=ANY(a.visited)) SELECT 1 FROM ancestors WHERE id=$2`, [fields.parent_id, before.id]);
      if (cycle.rowCount) throw new GovernanceError('Không được tạo quan hệ cha/con vòng lặp');
    }
  }
  if (resource === 'assignments') {
    const overlap = await client.query(`SELECT 1 FROM position_assignments WHERE employee_id=$1 AND position_id=$2 AND deleted_at IS NULL AND id<>$3 AND start_date<=COALESCE($4::date,'infinity'::date) AND COALESCE(end_date,'infinity'::date)>=$5::date AND project_id IS NOT DISTINCT FROM $6::int`, [fields.employee_id, fields.position_id, before?.id || 0, fields.end_date, fields.start_date,fields.project_id]);
    if (overlap.rowCount) throw new GovernanceError('Khoảng phân công trùng vị trí của nhân viên');
  }
  if (resource === 'budgets') fields.total_amount = budgetTotal(fields);
  if (resource === 'awards') {
    const policy = rows.policy_id;
    if (policy.status !== 'approved') throw new GovernanceError('Chỉ áp dụng chính sách đã duyệt');
    fields.policy_snapshot = JSON.stringify(policy);
    fields.amount = awardTotal(policy, fields);
  }
  const action = intent || (before ? 'edit' : 'create');
  if (intent !== 'restore') requireRecord(user, config, action, fields);
  if(resource==='staffing'&&(intent!=='restore'||before?.position_id==null)){
    const duplicate=await client.query('SELECT 1 FROM staffing_plans WHERE department_id=$1 AND month=$2 AND position_id IS NULL AND deleted_at IS NULL AND id<>$3',[fields.department_id,fields.month,before?.id||0]);
    if(duplicate.rowCount)throw new GovernanceError('Phòng ban đã có kế hoạch định biên trong tháng này. Mở kế hoạch hiện có để cập nhật.',409);
  }
  // References must remain within the granted scope; never allow a self/department grant to attach an unrelated object.
  for (const [key, row] of Object.entries(rows)) {
    if (['parent_id','position_id','project_id','folder_id','customer_id'].includes(key) && row.department_id != null) {
      const grant = scopeFor(user, config.module, action);
      if (grant === 'department' && Number(row.department_id) !== Number(user.department_id)) throw new GovernanceError('Liên kết ngoài phạm vi phòng ban', 403);
      if (grant === 'self' && row.owner_id && Number(row.owner_id) !== Number(user.id)) throw new GovernanceError('Liên kết ngoài phạm vi bản thân', 403);
    }
    if (['employee_id','owner_id'].includes(key) && scopeFor(user,config.module,action)==='department' && Number(row.department_id)!==Number(user.department_id)) throw new GovernanceError('Nhân viên ngoài phạm vi phòng ban',403);
  }
  return fields;
}

export async function mutateGovernance(resource, id, body, user, method = 'save') {
  const config = configFor(resource);
  if (id && !validId(id)) throw new GovernanceError('ID không hợp lệ');
  if (!body || typeof body !== 'object') throw new GovernanceError('Dữ liệu không hợp lệ');
  return transaction(async (client) => {
    // Serializes tree changes and overlapping assignments as well as record edits.
    await client.query('SELECT pg_advisory_xact_lock(68451206)');
    const before = id ? (await client.query(`SELECT * FROM ${config.table} WHERE id=$1 FOR UPDATE`, [id])).rows[0] : null;
    if (id && !before) throw new GovernanceError('Không tìm thấy dữ liệu', 404);
    if (before) {
      requireRecord(user, config, 'view', before);
      if (Number(body.version) !== before.version) throw new GovernanceError('Dữ liệu đã thay đổi. Đóng và mở lại để lấy phiên bản mới.', 409);
    }
    let fields, action = before ? 'edit' : 'create';
    if (method !== 'save') {
      if (!before) throw new GovernanceError('Thiếu dữ liệu');
      action = body.action || method;
      if(resource==='staffing'&&before.position_id!=null&&['submit','approve'].includes(action))throw new GovernanceError('Đây là định biên cũ theo chức vụ. Sửa và lưu tổng định biên phòng ban trước khi gửi duyệt.',409);
      if (action === 'delete' || action === 'restore') {
        requireRecord(user, config, action, before);
        if (action === 'delete' && before.status === 'approved') throw new GovernanceError('Mở lại bản đã duyệt trước khi xóa', 409);
        if ((action === 'restore') !== Boolean(before.deleted_at)) throw new GovernanceError('Trạng thái xóa đã thay đổi', 409);
        if (action === 'delete' && !String(body.reason || '').trim()) throw new GovernanceError('Cần lý do xóa');
        if(action==='delete'&&resource==='folders'){
          const linked=await client.query('SELECT 1 FROM document_folders WHERE parent_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM internal_documents WHERE folder_id=$1 AND deleted_at IS NULL LIMIT 1',[id]);
          if(linked.rowCount)throw new GovernanceError('Thư mục còn thư mục con hoặc tài liệu. Chuyển hoặc lưu trữ nội dung trước khi xóa.',409);
        }
        if(action==='delete'&&resource==='projects'){
          const linked=await client.query('SELECT 1 FROM tasks WHERE project_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM position_assignments WHERE project_id=$1 AND deleted_at IS NULL LIMIT 1',[id]);
          if(linked.rowCount)throw new GovernanceError('Dự án còn công việc hoặc nhiệm vụ nhân sự liên kết. Dùng trạng thái tạm dừng/hoàn thành để giữ kế hoạch.',409);
        }
        if (action === 'restore') await prepareFields(client, resource, before, user, before, 'restore');
        fields = { deleted_at: action === 'delete' ? new Date().toISOString() : null, deleted_reason: action === 'delete' ? String(body.reason).slice(0,2000) : null };
      } else {
        if (!config.workflow || before.deleted_at) throw new GovernanceError('Không thể chuyển trạng thái', 409);
        requireRecord(user, config, action === 'submit' ? 'edit' : 'approve', before);
        if (['reopen','reject'].includes(action) && !String(body.reason || '').trim()) throw new GovernanceError('Cần nhập lý do');
        const status = assertTransition(before, action, user.id, {role:user.role,resource});
        if (action === 'submit' || action === 'approve') {
          if (resource === 'awards') {
            const policy = await client.query("SELECT 1 FROM bonus_policies WHERE id=$1 AND version=$2 AND status='approved' AND deleted_at IS NULL FOR SHARE", [before.policy_id, before.policy_snapshot.version]);
            if (!policy.rowCount) throw new GovernanceError('Chính sách đã đổi phiên bản; mở sửa đề xuất và lưu lại để đối chiếu', 409);
          }
        }
        fields = { status, feedback: String(body.reason || '').slice(0,2000), reviewed_by: action === 'submit' ? null : user.id, reviewed_at: action === 'submit' ? null : new Date().toISOString() };
      }
    } else {
      const editableStates=resource==='staffing'?['draft','rejected','submitted']:['draft','rejected'];
      if (before?.deleted_at || config.workflow && before && !editableStates.includes(before.status)) throw new GovernanceError('Nội dung đang khóa; cần mở lại bản đã duyệt trước khi sửa', 409);
      if (before) requireRecord(user, config, 'edit', before);
      fields = await prepareFields(client, resource, body, user, before);
      if(resource==='staffing'&&before?.status==='submitted'){
        fields.status='draft';fields.reviewed_by=null;fields.reviewed_at=null;
      }
      if (!before) fields.created_by = user.id;
    }
    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const result = before ? await client.query(`UPDATE ${config.table} SET ${columns.map((column,index)=>`${column}=$${index+1}`).join(',')},version=version+1,updated_at=NOW() WHERE id=$${values.length+1} RETURNING *`, [...values,id])
      : await client.query(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${values.map((_,index)=>`$${index+1}`).join(',')}) RETURNING *`, values);
    const after = result.rows[0];
    await client.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES ($1,$2,$3,$4::jsonb,$5)', [resource,after.id,after.version,JSON.stringify(after),user.id]);
    await writeAudit(client, { entityType: `governance:${resource}`, entityId: after.id, actorId: user.id, action, before: before || {}, after, reason: body.reason, version: after.version });
    return after;
  });
}

export async function governanceOptions(resource, user) {
  const config = configFor(resource);
  if (scopeFor(user, config.module, 'view') === 'none') throw new GovernanceError('Không có quyền xem', 403);
  const result = {};
  for (const target of new Set(config.fields.filter((field)=>field.type==='reference').map((field)=>field.resource))) {
    if(resource==='assignments'&&target==='projects'){
      const projectScope=governanceScope(user,'projects');
      result.projects=(await query(`SELECT r.id,r.name FROM projects r WHERE r.deleted_at IS NULL AND ${projectScope.sql} ORDER BY r.name,r.id LIMIT 1000`,projectScope.params)).rows;
      continue;
    }
    const [table,column] = REFERENCES[target];
    const scope = scopeFor(user, config.module, 'view');
    const params = [];
    let where = ['employees','customers'].includes(target) ? "r.status='active'" : target === 'departments' ? 'TRUE' : 'r.deleted_at IS NULL';
    if (scope === 'department') { params.push(user.department_id ?? -1); where += target === 'departments' ? ' AND r.id=$1' : ' AND r.department_id=$1'; }
    if (scope === 'self' && target === 'employees') { params.push(user.id); where += ` AND r.id=$${params.length}`; }
    else if (scope === 'self' && target !== 'departments') { params.push(user.id); where += ` AND r.owner_id=$${params.length}`; }
    else if (scope === 'self' && target === 'departments') { params.push(user.department_id ?? -1); where += ` AND r.id=$${params.length}`; }
    if (target === 'policies') where += " AND r.status='approved'";
    const plannedPositions=['recruitment','budgets'].includes(resource)&&target==='positions';
    result[target] = (await query(`SELECT r.id,r.${column} AS name ${resource==='assignments'&&target==='employees'?',r.position':''} ${plannedPositions?',r.department_id':''} FROM ${table} r WHERE ${where} ORDER BY r.${column},r.id LIMIT 1000`,params)).rows;
    if(plannedPositions){
      const args=[];let employeeWhere="e.status='active' AND e.role<>'admin' AND e.department_id IS NOT NULL";
      if(scope==='department'){args.push(user.department_id??-1);employeeWhere+=' AND e.department_id=$1';}
      if(scope==='self'){args.push(user.id);employeeWhere+=' AND e.id=$1';}
      const people=(await query(`SELECT e.id,e.position,e.department_id,d.name AS department_name FROM employees e JOIN departments d ON d.id=e.department_id WHERE ${employeeWhere} ORDER BY e.id`,args)).rows;
      const seen=new Set(result.positions.map(position=>`${position.department_id}:${position.name.trim().toLocaleLowerCase('vi')}`));
      for(const person of people)for(const [index,title] of jobTitles(person.position).entries()){
        const key=`${person.department_id}:${title.toLocaleLowerCase('vi')}`;
        if(seen.has(key))continue;
        seen.add(key);result.positions.push({id:`employee:${person.id}:${index}`,name:`${title} — ${person.department_name}`});
      }
    }

  }
  if(!result[resource]){
    const scope=governanceScope(user,config.module);
    result[resource]=(await query(`SELECT r.id,r.name FROM ${config.table} r WHERE r.deleted_at IS NULL AND ${scope.sql} ORDER BY r.name,r.id LIMIT 1000`,scope.params)).rows;
  }
  if(!result.departments){
    const all=scopeFor(user,config.module,'view')==='all';
    result.departments=(await query(`SELECT id,name FROM departments ${all?'':'WHERE id=$1'} ORDER BY name`,all?[]:[user.department_id??-1])).rows;
  }
  return result;
}
