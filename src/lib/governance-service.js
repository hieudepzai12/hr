import { GOVERNANCE } from './governance-config';
import { query, transaction } from './db';
import { scopeFor, scopeAllows } from './access';
import { writeAudit } from './audit';
import {resolveDutyPosition,resolvePlannedPosition} from './personnel-duty';
import {jobTitles} from './employee-job-titles';
import { canViewProject, projectDepartmentsSelect, projectViewScope } from './project-access';
import { budgetDepartmentsSelect, budgetScope, canAccessBudget } from './salary-budget';
import { bonusComponents } from './bonus-components';
import { assertTransition, awardBreakdown, budgetTotal, GovernanceError, validId, validateGovernanceInput } from './governance-validation';

const REFERENCES = { departments: ['departments', 'name'], employees: ['employees', 'full_name'], customers: ['customers', 'name'], ...Object.fromEntries(Object.entries(GOVERNANCE).map(([key, value]) => [key, [value.table, 'name']])) };
// Only expose the project's completion flag, never the underlying restricted task data.
// An empty project (or one containing only cancelled tasks) is not complete.
const projectCompletion = (alias) => `(EXISTS (SELECT 1 FROM tasks pt WHERE pt.project_id=${alias}.id
  AND pt.deleted_at IS NULL AND pt.status<>'cancelled') AND NOT EXISTS
  (SELECT 1 FROM tasks pt WHERE pt.project_id=${alias}.id AND pt.deleted_at IS NULL
    AND pt.status NOT IN ('done','cancelled')) AND NOT EXISTS
  (SELECT 1 FROM project_departments pd WHERE pd.project_id=${alias}.id AND NOT EXISTS
    (SELECT 1 FROM tasks pt WHERE pt.project_id=${alias}.id AND pt.department_id=pd.department_id
      AND pt.deleted_at IS NULL AND pt.status<>'cancelled'))) AS auto_completed`;
export const configFor = (key) => { if (!Object.hasOwn(GOVERNANCE, key)) throw new GovernanceError('Không tìm thấy chức năng', 404); return GOVERNANCE[key]; };
export function requireRecord(user, config, action, record) {
  if(config.table==='salary_budgets'){
    if(canAccessBudget(user,action,record))return;
    throw new GovernanceError('Bạn không có quyền với ngân sách của nhóm phòng ban này',403);
  }
  if(config.table==='projects'&&action==='view'&&canViewProject(user,record))return;
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
  const pageSize = Number(searchParams.get('pageSize') || 20);
  if (![10,20,50,100].includes(pageSize)) throw new GovernanceError('Số dòng không hợp lệ');
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new GovernanceError('Trang không hợp lệ');
  const scope = resource==='projects'?projectViewScope(user):resource==='budgets'?budgetScope(user):governanceScope(user, config.module);
  if(searchParams.get('tree')==='1'){
    if(resource!=='folders')throw new GovernanceError('Chức năng cây chỉ dành cho thư mục');
    const documentScope=governanceScope(user,'documents','view','d',scope.params.length+1);
    const tree=await query(`SELECT r.id,r.name,r.parent_id,COALESCE(attachments.links,'[]'::jsonb) AS links
      FROM document_folders r LEFT JOIN LATERAL (
        SELECT jsonb_agg(link) AS links FROM (SELECT d.id,d.name,d.url FROM internal_documents d
          WHERE d.folder_id=r.id AND d.deleted_at IS NULL AND ${documentScope.sql}
          ORDER BY d.name,d.id LIMIT 5) link
      ) attachments ON TRUE
      WHERE r.deleted_at IS NULL AND ${scope.sql} ORDER BY r.name,r.id LIMIT 2001`,[...scope.params,...documentScope.params]);
    return {items:tree.rows.slice(0,2000),truncated:tree.rows.length>2000};
  }
  const args = [...scope.params];
  const deleted = searchParams.get('deleted') === '1';
  if (deleted && scopeFor(user, config.module, 'restore') === 'none') throw new GovernanceError('Không có quyền khôi phục', 403);
  let where = `${scope.sql} AND r.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`;
  if (deleted) { const restore = resource==='budgets'?budgetScope(user,'restore','r',args.length+1):governanceScope(user, config.module, 'restore', 'r', args.length + 1); where += ` AND ${restore.sql}`; args.push(...restore.params); }
  if(resource==='budgets'&&searchParams.get('department_ids')){
    const ids=searchParams.get('department_ids').split(',');
    if(ids.length>100||ids.some(id=>!validId(id)))throw new GovernanceError('Bộ lọc phòng ban không hợp lệ');
    args.push([...new Set(ids.map(Number))]);
    where+=` AND EXISTS(SELECT 1 FROM salary_budget_departments bd WHERE bd.budget_id=r.id AND bd.department_id=ANY($${args.length}::int[]))`;
  }
  for (const key of ['department_id', 'position_id', 'project_id', 'folder_id', 'month', 'status', 'verification_status']) {
    const value = searchParams.get(key);
    if (value && (key === 'department_id' || config.fields.some((field) => field.key === key) || key === 'status' && config.workflow)) {
      if (key.endsWith('_id') && !validId(value)) throw new GovernanceError('Bộ lọc không hợp lệ');
      args.push(value);
      where += resource==='projects'&&key==='department_id'?` AND (r.department_id=$${args.length} OR EXISTS(SELECT 1 FROM project_departments pd WHERE pd.project_id=r.id AND pd.department_id=$${args.length}))`:resource==='budgets'&&key==='department_id'?` AND EXISTS(SELECT 1 FROM salary_budget_departments bd WHERE bd.budget_id=r.id AND bd.department_id=$${args.length})`:` AND r.${key}=$${args.length}`;
    }
  }
  const search = searchParams.get('search');
  if (search) { if (search.length > 300) throw new GovernanceError('Từ khóa quá dài'); args.push(`%${search}%`); where += ` AND r.name ILIKE $${args.length}`; }
  const sort = ['name', 'created_at', 'updated_at', 'id', ...config.fields.filter((f) => ['date', 'month', 'number', 'money'].includes(f.type)&&!(resource==='awards'&&f.key==='fixed_amount')).map((f) => f.key)].includes(searchParams.get('sort')) ? searchParams.get('sort') : 'updated_at';
  const direction = searchParams.get('direction') === 'asc' ? 'ASC' : 'DESC';
  const aggregates=resource==='budgets'?", COALESCE(SUM(r.total_amount),0)::text AS total_amount, SUM(r.headcount)::text AS headcount, COUNT(DISTINCT r.month)::int AS month_count":'';
  const count = await query(`SELECT COUNT(*)::int AS total ${aggregates} FROM ${config.table} r WHERE ${where}`, args);
  const labels = config.fields.filter((field) => field.type === 'reference').map((field) => {
    const [table, column] = REFERENCES[field.resource];
    if(resource==='assignments'&&field.key==='project_id'){
      const projectScope=projectViewScope(user,'p',args.length+1);
      args.push(...projectScope.params);
      return `(SELECT p.name FROM projects p WHERE p.id=r.project_id AND p.deleted_at IS NULL AND ${projectScope.sql}) AS project_id_label`;
    }
    return `(SELECT ${column} FROM ${table} WHERE id=r.${field.key}) AS ${field.key}_label`;
  });
  const actual = resource === 'staffing' ? `, (SELECT COUNT(*)::int FROM employees e WHERE e.department_id=r.department_id AND e.status='active' AND e.role<>'admin') AS actual_count` : '';
  const completion = resource === 'projects' ? `, ${projectCompletion('r')}` : '';
  const participating=resource==='projects'?`, ${projectDepartmentsSelect()}`:resource==='budgets'?`, ${budgetDepartmentsSelect()}`:'';
  const rows = await query(`SELECT r.* ${participating} ${labels.length ? ',' + labels.join(',') : ''} ${actual} ${completion} FROM ${config.table} r WHERE ${where} ORDER BY r.${sort} ${direction},r.id DESC LIMIT ${pageSize} OFFSET $${args.length + 1}`, [...args, (page - 1) * pageSize]);
  return { items: resource==='awards'?rows.rows.map(row=>({...row,...bonusComponents(row)})):rows.rows, total: count.rows[0].total, page, pageSize, ...(resource==='budgets'?{summary:count.rows[0]}:{}) };
}
export async function detailGovernance(resource, id, user) {
  const config = configFor(resource);
  if (!validId(id)) throw new GovernanceError('ID không hợp lệ');
  const found = await query(`SELECT r.* ${resource==='projects'?`, ${projectCompletion('r')}, ${projectDepartmentsSelect()}`:resource==='budgets'?`, ${budgetDepartmentsSelect()}`:''} FROM ${config.table} r WHERE r.id=$1`, [id]);
  const row = found.rows[0];
  if (!row) throw new GovernanceError('Không tìm thấy dữ liệu', 404);
  if(resource==='awards')Object.assign(row,bonusComponents(row));
  requireRecord(user, config, 'view', row);
  if (row.deleted_at) requireRecord(user, config, 'restore', row);
  for(const field of config.fields.filter(field=>field.type==='reference'&&row[field.key])){
    const [table,column]=REFERENCES[field.resource];
    if(resource==='assignments'&&field.key==='project_id'){
      const projectScope=projectViewScope(user,'p',2);
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
  if((resource==='recruitment'||resource==='budgets'&&body.budget_mode!=='aggregate')&&intent!=='restore'&&typeof body.position_id==='string'){
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
  if(resource==='policies'){
    if(fields.calculation==='combined'&&before?.calculation!=='combined')throw new GovernanceError('Tách tiền thưởng phòng ban và phần trăm nhân sự thành hai chính sách riêng');
    if(fields.calculation==='manual'&&!fields.department_id&&!before)throw new GovernanceError('Chọn phòng ban áp dụng tổng tiền thưởng');
    if(fields.calculation==='manual')fields.rate=0;
  }
  if(resource==='budgets'&&fields.budget_mode==='aggregate'){
    fields.department_ids=Object.hasOwn(body,'department_ids')?fields.department_ids:before?.department_ids||[];
    if(!fields.department_ids.length)throw new GovernanceError('Chọn ít nhất một phòng ban cho dòng ngân sách');
    const departments=await client.query('SELECT id FROM departments WHERE id=ANY($1::int[]) FOR SHARE',[fields.department_ids]);
    if(departments.rowCount!==fields.department_ids.length)throw new GovernanceError('Phòng ban không tồn tại');
    if(fields.department_ids.length>1&&scopeFor(user,'budgets',before?'edit':'create')!=='all')throw new GovernanceError('Cần quyền toàn bộ để quản lý quỹ lương gộp nhiều phòng',403);
    if(fields.department_ids.length){
      const overlap=await client.query(`SELECT 1 FROM salary_budget_departments bd JOIN salary_budgets b ON b.id=bd.budget_id
        WHERE b.month=$1 AND b.deleted_at IS NULL AND b.id<>$2 AND bd.department_id=ANY($3::int[]) LIMIT 1`,[fields.month,before?.id||0,fields.department_ids]);
      if(overlap.rowCount)throw new GovernanceError('Phòng ban đã có ngân sách trong tháng này. Sửa hoặc xử lý dòng hiện có để tránh tính trùng.',409);
    }
  }
  if(resource==='positions'&&before&&!Object.hasOwn(body,'role_description'))fields.role_description=before.role_description??null;
  if(resource==='projects'){
    const selected=Object.hasOwn(body,'department_ids')?fields.department_ids:before?.department_ids?.length?before.department_ids:validId(body.department_id)?[Number(body.department_id)]:[];
    fields.department_ids=[...new Set(selected.map(Number))].sort((a,b)=>a-b);
    if(!fields.department_ids.length)throw new GovernanceError('Chọn ít nhất một phòng ban tham gia');
    // Legacy compatibility/scope column; there is no business-level lead department.
    fields.department_id=before&&fields.department_ids.includes(Number(before.department_id))?before.department_id:fields.department_ids[0];
    if(fields.department_ids.length>100)throw new GovernanceError('Tối đa 100 phòng ban tham gia');
    const departments=await client.query('SELECT id FROM departments WHERE id=ANY($1::int[]) FOR SHARE',[fields.department_ids]);
    if(departments.rowCount!==fields.department_ids.length)throw new GovernanceError('Phòng ban tham gia không tồn tại');
    const added=fields.department_ids.filter(id=>!before?.department_ids?.includes(id));
    if(scopeFor(user,'projects',before?'edit':'create')!=='all'&&added.some(id=>id!==Number(user.department_id)))throw new GovernanceError('Cần quyền toàn bộ để thêm phòng ban khác vào dự án',403);
    if(before){
      const linked=await client.query(`SELECT 1 FROM tasks WHERE project_id=$1 AND deleted_at IS NULL AND department_id IS NOT NULL AND NOT(department_id=ANY($2::int[]))
        UNION ALL SELECT 1 FROM project_members m JOIN employees e ON e.id=m.employee_id WHERE m.project_id=$1 AND m.deleted_at IS NULL AND e.department_id IS NOT NULL AND NOT(e.department_id=ANY($2::int[])) LIMIT 1`,[before.id,fields.department_ids]);
      if(linked.rowCount)throw new GovernanceError('Phòng ban còn công việc hoặc nhân sự trong dự án, chưa thể bỏ khỏi danh sách tham gia',409);
    }
  }
  if(resource==='staffing'&&intent!=='restore')fields.position_id=null;
  const rows = {};
  for (const field of config.fields.filter((field) => field.type === 'reference' && fields[field.key])) {
    const [table] = REFERENCES[field.resource];
    const live = ['employees', 'customers'].includes(field.resource) ? " AND status='active'" : field.resource === 'departments' ? '' : ' AND deleted_at IS NULL';
    const result = await client.query(`SELECT * ${field.resource==='projects'?`,${projectDepartmentsSelect('projects')}`:''} FROM ${table} WHERE id=$1${live} FOR SHARE`, [fields[field.key]]);
    if (!result.rows[0]) throw new GovernanceError(`${field.label} không còn hoạt động`);
    rows[field.key] = result.rows[0];
  }
  if(['assignments','members'].includes(resource)&&rows.project_id)requireRecord(user,GOVERNANCE.projects,'view',rows.project_id);
  if(resource!=='policies')fields.department_id ??= rows.position_id?.department_id ?? rows.project_id?.department_id ?? rows.folder_id?.department_id ?? user.department_id ?? null;
  if(resource==='members'&&rows.employee_id?.department_id&&rows.project_id){
    const departmentId=Number(rows.employee_id.department_id);
    if(![rows.project_id.department_id,...rows.project_id.department_ids].map(Number).includes(departmentId))throw new GovernanceError('Phòng ban của nhân viên chưa tham gia dự án');
    fields.department_id=departmentId;
  }
  fields.owner_id ??= rows.folder_id?.owner_id ?? before?.owner_id ?? user.id;
  if(resource==='budgets'){
    if(fields.budget_mode==='aggregate')fields.department_id=fields.department_ids[0]??null;
    else fields.department_ids=[fields.department_id];
  }
  if (['assignments', 'members', 'awards'].includes(resource)) fields.owner_id = fields.employee_id;
  if(before&&['positions','folders'].includes(resource)&&
    (Number(before.department_id)!==Number(fields.department_id)||resource==='folders'&&Number(before.owner_id)!==Number(fields.owner_id))){
    const links=resource==='folders'
      ? 'SELECT 1 FROM document_folders WHERE parent_id=$1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM internal_documents WHERE folder_id=$1 AND deleted_at IS NULL LIMIT 1'
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
  if (resource === 'budgets'&&fields.budget_mode==='position') fields.total_amount = budgetTotal(fields);
  if (resource === 'awards') {
    const policy = rows.policy_id;
    if (policy.status !== 'approved') throw new GovernanceError('Chỉ áp dụng chính sách đã duyệt');
    const legacy=before?.award_scope==='legacy';
    if(!legacy&&policy.calculation==='combined')throw new GovernanceError('Chính sách kết hợp cũ chỉ dùng để xem lịch sử. Chọn chính sách tiền phòng ban hoặc phần trăm nhân sự');
    fields.award_scope=legacy?'legacy':policy.calculation==='manual'?'department':'employee';
    if(fields.award_scope==='department'){
      if(fields.employee_id)throw new GovernanceError('Tổng thưởng phòng ban không gán hoặc chia xuống nhân sự');
      if(!rows.department_id)throw new GovernanceError('Chọn phòng ban nhận thưởng');
      if(!policy.department_id||policy.department_id!==fields.department_id)throw new GovernanceError('Phòng nhận thưởng phải đúng phòng áp dụng chính sách');
      fields.employee_id=null;fields.owner_id=null;fields.basis_amount='0';
    }else{
      if(!rows.employee_id)throw new GovernanceError('Chọn nhân sự nhận thưởng');
      if(!rows.employee_id.department_id)throw new GovernanceError('Nhân sự chưa thuộc phòng ban');
      fields.department_id=rows.employee_id.department_id;fields.owner_id=fields.employee_id;
      if(!legacy&&policy.department_id&&policy.department_id!==fields.department_id)throw new GovernanceError('Nhân sự không thuộc phòng áp dụng chính sách');
    }
    if(intent!=='restore')requireRecord(user,config,before?'edit':'create',fields);
    if(rows.project_id){
      if(!legacy&&![rows.project_id.department_id,...rows.project_id.department_ids].map(Number).includes(Number(fields.department_id)))throw new GovernanceError('Phòng nhận thưởng chưa tham gia dự án');
      requireRecord(user,GOVERNANCE.projects,'view',rows.project_id);
    }
    const components=awardBreakdown(policy,fields);
    fields.basis_amount=fields.basis_amount??'0';
    fields.policy_snapshot = JSON.stringify({...policy,award_components:{fixed_amount:components.fixed_amount,percentage_amount:components.percentage_amount}});
    fields.amount=components.amount;
    delete fields.fixed_amount;
  }
  const action = intent || (before ? 'edit' : 'create');
  if (intent !== 'restore') requireRecord(user, config, action, fields);
  if(resource==='positions'){
    const duplicate=await client.query(`SELECT id FROM positions WHERE department_id=$1 AND deleted_at IS NULL
      AND LOWER(REGEXP_REPLACE(TRIM(name),'\\s+',' ','g'))=LOWER(REGEXP_REPLACE(TRIM($2::text),'\\s+',' ','g')) AND id<>$3 LIMIT 1`,
    [fields.department_id,fields.name,before?.id||0]);
    if(duplicate.rowCount)throw new GovernanceError('Chức vụ này đã có trong phòng ban. Hãy sửa nhiệm vụ của chức vụ hiện có.',409);
  }

  if(resource==='staffing'&&(intent!=='restore'||before?.position_id==null)){
    const duplicate=await client.query('SELECT 1 FROM staffing_plans WHERE department_id=$1 AND month=$2 AND position_id IS NULL AND deleted_at IS NULL AND id<>$3',[fields.department_id,fields.month,before?.id||0]);
    if(duplicate.rowCount)throw new GovernanceError('Phòng ban đã có kế hoạch định biên trong tháng này. Mở kế hoạch hiện có để cập nhật.',409);
  }
  // References must remain within the granted scope; never allow a self/department grant to attach an unrelated object.
  for (const [key, row] of Object.entries(rows)) {
    if (['parent_id','position_id','project_id','folder_id','customer_id'].includes(key) && row.department_id != null) {
      const grant = scopeFor(user, config.module, action);
      const participatingProject=key==='project_id'&&row.department_ids?.map(Number).includes(Number(user.department_id))&&canViewProject(user,row);
      if (grant === 'department' && Number(row.department_id) !== Number(user.department_id)&&!participatingProject) throw new GovernanceError('Liên kết ngoài phạm vi phòng ban', 403);
      if (grant === 'self' && row.owner_id && Number(row.owner_id) !== Number(user.id)) throw new GovernanceError('Liên kết ngoài phạm vi bản thân', 403);
    }
    if (['employee_id','owner_id'].includes(key) && scopeFor(user,config.module,action)==='department' && Number(row.department_id)!==Number(user.department_id)) throw new GovernanceError('Nhân viên ngoài phạm vi phòng ban',403);
  }
  return fields;
}

async function mutateGovernanceRecord(client, resource, id, body, user, method = 'save') {
  const config = configFor(resource);
  if (id && !validId(id)) throw new GovernanceError('ID không hợp lệ');
  if (!body || typeof body !== 'object') throw new GovernanceError('Dữ liệu không hợp lệ');
  // Serializes tree changes and overlapping assignments as well as record edits.
  await client.query('SELECT pg_advisory_xact_lock(68451206)');
  const before = id ? (await client.query(`SELECT * FROM ${config.table} WHERE id=$1 FOR UPDATE`, [id])).rows[0] : null;
  if(before&&resource==='awards')Object.assign(before,bonusComponents(before));
  if(before&&resource==='projects')before.department_ids=(await client.query('SELECT department_id FROM project_departments WHERE project_id=$1 ORDER BY department_id',[id])).rows.map(row=>row.department_id);
  if(before&&resource==='budgets')before.department_ids=(await client.query('SELECT department_id FROM salary_budget_departments WHERE budget_id=$1 ORDER BY department_id',[id])).rows.map(row=>row.department_id);
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
  const departmentIds=['projects','budgets'].includes(resource)?fields.department_ids:undefined;
  if(['projects','budgets'].includes(resource))delete fields.department_ids;
  const columns = Object.keys(fields);
  const values = Object.values(fields);
  const result = before ? await client.query(`UPDATE ${config.table} SET ${columns.map((column,index)=>`${column}=$${index+1}`).join(',')},version=version+1,updated_at=NOW() WHERE id=$${values.length+1} RETURNING *`, [...values,id])
    : await client.query(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${values.map((_,index)=>`$${index+1}`).join(',')}) RETURNING *`, values);
  const after = result.rows[0];
  if(resource==='awards')Object.assign(after,bonusComponents(after));
  if(resource==='projects'){
    if(departmentIds){
      await client.query('DELETE FROM project_departments WHERE project_id=$1',[after.id]);
      await client.query('INSERT INTO project_departments(project_id,department_id) SELECT $1,unnest($2::int[])',[after.id,departmentIds]);
    }
    after.department_ids=departmentIds||before?.department_ids||[];
  }
  if(resource==='budgets'){
    if(departmentIds){
      await client.query('DELETE FROM salary_budget_departments WHERE budget_id=$1',[after.id]);
      await client.query('INSERT INTO salary_budget_departments(budget_id,department_id) SELECT $1,unnest($2::int[])',[after.id,departmentIds]);
    }
    after.department_ids=departmentIds||before?.department_ids||[];
  }
  await client.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES ($1,$2,$3,$4::jsonb,$5)', [resource,after.id,after.version,JSON.stringify(after),user.id]);
  await writeAudit(client, { entityType: `governance:${resource}`, entityId: after.id, actorId: user.id, action, before: before || {}, after, reason: body.reason, version: after.version });
  return after;
}

export async function mutateGovernance(resource, id, body, user, method = 'save') {
  return transaction(client => mutateGovernanceRecord(client,resource,id,body,user,method));
}

export async function createBudgetBatch(body,user) {
  if(scopeFor(user,'budgets','create')==='none')throw new GovernanceError('Không có quyền tạo ngân sách',403);
  if(!body||typeof body.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)throw new GovernanceError('Chọn tháng và nhập từ 1 đến 100 dòng ngân sách');
  return transaction(async client=>{
    const items=[];
    for(const [index,item] of body.items.entries()){
      if(!item||typeof item!=='object'||Array.isArray(item))throw new GovernanceError(`Dòng ${index+1}: dữ liệu không hợp lệ`);
      try{
        items.push(await mutateGovernanceRecord(client,'budgets',null,{...item,budget_mode:'aggregate',month:body.month},user));
      }catch(error){
        if(error instanceof GovernanceError)throw new GovernanceError(`Dòng ${index+1}: ${error.message}`,error.status);
        throw error;
      }
    }
    return {items,created:items.length,total_amount:items.reduce((sum,row)=>sum+BigInt(row.total_amount),0n).toString(),month:body.month};
  });
}

export async function governanceOptions(resource, user) {
  const config = configFor(resource);
  if (scopeFor(user, config.module, 'view') === 'none') throw new GovernanceError('Không có quyền xem', 403);
  const result = {};
  if(resource==='positions'){
    const scope=scopeFor(user,'positions','view');const args=[];
    let where="e.status='active' AND e.role<>'admin' AND e.department_id IS NOT NULL";
    if(scope==='department'){args.push(user.department_id??-1);where+=' AND e.department_id=$1';}
    if(scope==='self'){args.push(user.id);where+=' AND e.id=$1';}
    const people=(await query(`SELECT e.position,e.department_id FROM employees e WHERE ${where}`,args)).rows;
    const positionScope=governanceScope(user,'positions','view','r');
    const saved=(await query(`SELECT r.name,r.department_id FROM positions r WHERE r.deleted_at IS NULL AND ${positionScope.sql}`,positionScope.params)).rows;
    const titles=new Map(saved.map(row=>[`${row.department_id}:${row.name.trim().toLocaleLowerCase('vi')}`,row]));
    for(const person of people)for(const title of jobTitles(person.position))titles.set(`${person.department_id}:${title.toLocaleLowerCase('vi')}`,{name:title,department_id:person.department_id});
    result.job_titles=[...titles.values()];
  }
  for (const target of new Set(config.fields.filter((field)=>field.type==='reference').map((field)=>field.resource))) {
    if(resource==='assignments'&&target==='projects'){
      const projectScope=projectViewScope(user);
      result.projects=(await query(`SELECT r.id,r.name FROM projects r WHERE r.deleted_at IS NULL AND ${projectScope.sql} ORDER BY r.name,r.id LIMIT 1000`,projectScope.params)).rows;
      continue;
    }
    const [table,column] = REFERENCES[target];
    const scope = scopeFor(user, config.module, 'view');
    const params = [];
    let where = ['employees','customers'].includes(target) ? "r.status='active'" : target === 'departments' ? 'TRUE' : 'r.deleted_at IS NULL';
    if(target==='policies'&&resource==='awards'){
      const policyWhere=scope==='all'?'TRUE':scope==='self'?"r.calculation='percentage' AND (r.department_id IS NULL OR r.department_id=$1)":"(r.department_id=$1 OR (r.department_id IS NULL AND r.calculation='percentage'))";
      result.policies=(await query(`SELECT r.id,r.name,r.calculation,r.rate,r.conditions,r.version,r.department_id FROM bonus_policies r WHERE r.deleted_at IS NULL AND r.status='approved' AND (${policyWhere}) ORDER BY r.name,r.id LIMIT 1000`,scope==='all'?[]:[user.department_id??-1])).rows;
      continue;
    }
    if(target==='projects'){
      const projectScope=projectViewScope(user,'r',params.length+1);params.push(...projectScope.params);where+=` AND ${projectScope.sql}`;
    } else if (scope === 'department') { params.push(user.department_id ?? -1); where += target === 'departments' ? ' AND r.id=$1' : ' AND r.department_id=$1'; }
    if (scope === 'self' && target === 'employees') { params.push(user.id); where += ` AND r.id=$${params.length}`; }
    else if (scope === 'self' && target !== 'departments'&&target!=='projects') { params.push(user.id); where += ` AND r.owner_id=$${params.length}`; }
    else if (scope === 'self' && target === 'departments') { params.push(user.department_id ?? -1); where += ` AND r.id=$${params.length}`; }
    if (target === 'policies') where += " AND r.status='approved'";
    const plannedPositions=['recruitment','budgets'].includes(resource)&&target==='positions';
    result[target] = (await query(`SELECT r.id,r.${column} AS name ${target==='policies'?',r.calculation,r.rate,r.conditions,r.version,r.department_id':''} ${resource==='awards'&&target==='employees'?',r.department_id':''} ${resource==='assignments'&&target==='employees'?',r.position':''} ${plannedPositions?',r.department_id':''} FROM ${table} r WHERE ${where} ORDER BY r.${column},r.id LIMIT 1000`,params)).rows;
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
    const scope=resource==='projects'?projectViewScope(user):resource==='budgets'?budgetScope(user):governanceScope(user,config.module);
    result[resource]=(await query(`SELECT r.id,r.name FROM ${config.table} r WHERE r.deleted_at IS NULL AND ${scope.sql} ORDER BY r.name,r.id LIMIT 1000`,scope.params)).rows;
  }
  if(!result.departments){
    const all=scopeFor(user,config.module,'view')==='all';
    result.departments=(await query(`SELECT id,name FROM departments ${all?'':'WHERE id=$1'} ORDER BY name`,all?[]:[user.department_id??-1])).rows;
  }
  return result;
}
