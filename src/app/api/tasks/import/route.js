import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows, scopeFor } from '@/lib/access';
import { parseExcelTasks, normalize, validIsoDate } from '@/lib/excel-import';
import { projectViewScope, validateTaskProject } from '@/lib/project-access';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const personNames = (value) => value.split(/\s*\+\s*/).map((name) => name.trim()).filter(Boolean);
const sameTask = (existing,row) => existing.source_import_key===row.source_key ||
  (normalize(existing.title)===normalize(row.title) && Number(existing.assignee_id)===Number(row.assignee_id) && (existing.data_period||'')===(row.data_period||'') && Number(existing.project_id||0)===Number(row.project_id||0) && Number(existing.customer_id||0)===Number(row.customer_id||0) && (existing.due_date||'')===(row.due_date||''));

export const POST = withAuth(async (req, ctx, user) => {
  if (scopeFor(user, 'tasks', 'create') === 'none') return forbidden();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const action = form?.get('action');
  if (!file || typeof file === 'string' || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024 ||
    !['preview', 'commit'].includes(action)) {
    return NextResponse.json({ error: 'Chọn file .xlsx tối đa 5 MB' }, { status: 400 });
  }
  let parsed;
  try { parsed = await parseExcelTasks(Buffer.from(await file.arrayBuffer())); }
  catch (error) { return NextResponse.json({ error: error.message || 'Không đọc được file Excel' }, { status: 400 }); }
  let overrides = {};
  if (form.get('overrides')) {
    try { overrides = JSON.parse(String(form.get('overrides') || '{}')); }
    catch { return NextResponse.json({ error: 'Thông tin đối chiếu không hợp lệ' }, { status: 400 }); }
  }
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.values(overrides).some(value=>!value||typeof value!=='object'||Array.isArray(value))) return NextResponse.json({error:'Thông tin đối chiếu không hợp lệ'},{status:400});
  const projectScope=projectViewScope(user,'p');
  const [employeeRows, customerRows, departmentRows, duplicateRows, projectRows] = await Promise.all([
    query(`SELECT id, full_name, department_id FROM employees WHERE status='active'
      AND ($1='all' OR ($1='department' AND department_id=$2) OR ($1='self' AND id=$3))`,
      [scopeFor(user, 'tasks', 'create'), user.department_id ?? -1, user.id]),
    query(`SELECT id, code, name FROM customers WHERE status='active'
      AND ($1='all' OR ($1='department' AND department_id=$2) OR ($1='self' AND owner_id=$3))`,
      [scopeFor(user, 'customers', 'view'), user.department_id ?? -1, user.id]),
    query('SELECT id, name FROM departments'),
    query(`SELECT source_import_key,title,assignee_id,data_period,project_id,customer_id,due_date FROM tasks WHERE source_import_key=ANY($1::text[])
      OR assignee_id IN (SELECT id FROM employees WHERE status='active' AND
        ($2='all' OR ($2='department' AND department_id=$3) OR ($2='self' AND id=$4)))`,
      [parsed.map(row=>row.source_key),scopeFor(user,'tasks','create'),user.department_id??-1,user.id]),
    query(`SELECT p.id,p.code,p.name,p.customer_id FROM projects p WHERE p.deleted_at IS NULL AND ${projectScope.sql}`,projectScope.params),
  ]);
  const employees = employeeRows.rows;
  const customers = customerRows.rows;
  const departments = departmentRows.rows;
  const matches = (items, key, value) => items.filter((item) => normalize(item[key]) === normalize(value));
  const seen = new Set();
  const projectErrors=new Map();
  const prepared = await Promise.all(parsed.map(async (row) => {
    const selection = overrides[row.source_key] || {};
    const names = personNames(row.assignee_name);
    const people = names.map((name) => matches(employees, 'full_name', name));
    const assigneeId = Number(selection.assignee_id || (people[0]?.length === 1 ? people[0][0].id : 0));
    const assignee = employees.find((person) => person.id === assigneeId);
    const collaborators = Array.isArray(selection.collaborator_ids) ? selection.collaborator_ids.map(Number) :
      people.slice(1).flatMap((found) => found.length === 1 ? [found[0].id] : []);
    const customerFound = row.customer_name ? customers.filter((customer) =>
      normalize(customer.name) === normalize(row.customer_name) || normalize(customer.code) === normalize(row.customer_name)) : [];
    let customerId = Number(selection.customer_id || (customerFound.length === 1 ? customerFound[0].id : 0));
    const projectMatches=row.project_name?projectRows.rows.filter(project=>normalize(project.name)===normalize(row.project_name)||normalize(project.code)===normalize(row.project_name)):[];
    const projectId=Number(selection.project_id||(projectMatches.length===1?projectMatches[0].id:0));
    const project=projectRows.rows.find(project=>project.id===projectId);
    if(project)customerId=Number(project.customer_id||0);
    const departmentFound = row.department_name ? matches(departments, 'name', row.department_name) : [];
    const departmentId = Number(selection.department_id || (departmentFound.length === 1 ? departmentFound[0].id : assignee?.department_id || 0));
    const dueDate = selection.due_date === undefined ? row.due_date : selection.due_date;
    const identity=JSON.stringify([normalize(row.title),assigneeId,row.data_period||'',projectId,customerId,dueDate||'']);
    const duplicate=seen.has(identity)||duplicateRows.rows.some(existing=>sameTask(existing,{...row,assignee_id:assigneeId,project_id:projectId,customer_id:customerId,due_date:dueDate}));
    if(!selection.skip)seen.add(identity);
    const issues = [];
    if (row.title.length > 500) issues.push('Tên công việc dài quá 500 ký tự');
    if (!assignee) issues.push('Chưa đối chiếu được người phụ trách');
    if (!Array.isArray(selection.collaborator_ids) && people.slice(1).some((found) => found.length !== 1)) issues.push('Chưa đối chiếu được người phối hợp');
    if (collaborators.some((id) => !employees.some((person) => person.id === id))) issues.push('Người phối hợp ngoài phạm vi');
    if (!project && row.customer_name && !customers.some((customer) => customer.id === customerId)) issues.push('Chưa đối chiếu được khách hàng');
    if ((!departmentId && user.role!=='admin') || (departmentId && !departments.some((dept) => dept.id === departmentId))) issues.push('Chưa có phòng ban hợp lệ');
    if((row.project_name||selection.project_id)&&!project)issues.push('Chưa đối chiếu được dự án');
    if(project){const key=`${project.id}:${departmentId}:${customerId}`;if(!projectErrors.has(key))projectErrors.set(key,validateTaskProject(user,project.id,departmentId||null,customerId||null));const error=await projectErrors.get(key);if(error)issues.push(error);}
    if (assignee && !scopeAllows(user, 'tasks', 'create', { ownerId: assigneeId, departmentId })) issues.push('Ngoài phạm vi quyền tạo');
    if (row.invalid_due_date && selection.due_date === undefined) issues.push('Hạn chót không đọc được');
    if (dueDate && !validIsoDate(dueDate)) issues.push('Hạn chót không hợp lệ');
    if (!dueDate) issues.push('Chưa có hạn chót');
    if (row.confirm_fraction && !selection.progress_confirmed) issues.push('Cần xác nhận tiến độ dạng 0.x');
    if (row.progress != null && (row.progress < 0 || row.progress > 100)) issues.push('Tiến độ ngoài 0–100%');
    if (row.progress != null && !Number.isInteger(row.progress)) issues.push('Tiến độ cần là số nguyên');
    if ([row.business_group, row.data_period, row.result, row.blockers, row.solution, row.progress_text,row.description].some((value) => value.length > 10000)) issues.push('Nội dung quá dài');
    if (collaborators.length > 100) issues.push('Quá nhiều người phối hợp');
    if (duplicate) issues.push('Có thể đã nhập công việc này');
    return { ...row, assignee_id: assigneeId || null, collaborator_ids: collaborators,
      project_id:projectId||null, customer_id: customerId || null, department_id: departmentId || null, due_date: dueDate || null,
      duplicate, issues, skip: Boolean(selection.skip) };
  }));
  if (action === 'preview') return NextResponse.json({ rows: prepared, employees, customers, departments, projects:projectRows.rows });
  const selected = prepared.filter((row) => !row.skip && !row.duplicate);
  if (!selected.length) return NextResponse.json({ imported:0, skipped:parsed.length, task_ids:[] });
  const allowMissingDue = form.get('allow_missing_due') === 'true';
  const invalid = selected.find((row) => row.issues.some((issue) => issue !== 'Chưa có hạn chót' || !allowMissingDue));
  if (invalid) return NextResponse.json({ error: `Dòng ${invalid.sheet}!${invalid.row}: ${invalid.issues.join(', ')}` }, { status: 400 });
  const created = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(68451207)');
    const existing=(await client.query('SELECT source_import_key,title,assignee_id,data_period,project_id,customer_id,due_date FROM tasks WHERE source_import_key=ANY($1::text[]) OR assignee_id=ANY($2::int[])',[selected.map(row=>row.source_key),[...new Set(selected.map(row=>row.assignee_id))]])).rows;
    const imported = [];
    for (const row of selected) {
      if(existing.some(task=>sameTask(task,row)))continue;
      const { rows } = await client.query(`INSERT INTO tasks
        (title, assignee_id, created_by, department_id, customer_id, business_group, data_period,
          due_date, progress, status, completed_result, blockers, proposed_solution, source_import_key, source_import_row, progress_text, project_id, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18)
        ON CONFLICT DO NOTHING RETURNING *`,
      [row.title, row.assignee_id, user.id, row.department_id, row.customer_id, row.business_group || null,
        row.data_period || null, row.due_date, row.progress || 0, row.status, row.result || null,
        row.blockers || null, row.solution || null, row.source_key,
        JSON.stringify({ sheet: row.sheet, row: row.row, values: row.source }), row.progress_text, row.project_id, row.description||null]);
      if (!rows[0]) continue;
      existing.push(rows[0]);
      for (const employeeId of new Set(row.collaborator_ids)) {
        if (employeeId !== row.assignee_id) await client.query('INSERT INTO task_collaborators (task_id,employee_id) VALUES ($1,$2)', [rows[0].id, employeeId]);
      }
      const { source_import_row, ...audited } = rows[0];
      await writeAudit(client, { entityType: 'task', entityId: rows[0].id, actorId: user.id,
        action: 'import', after: audited, reason: `${row.sheet}!${row.row}` });
      imported.push(rows[0].id);
    }
    return imported;
  });
  return NextResponse.json({ imported: created.length, skipped: parsed.length - created.length, task_ids: created });
});
