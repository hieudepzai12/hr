// Private document data stays in imports/ (gitignored). Dry run unless explicitly applied.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { writeAudit } from '../src/lib/audit.js';
import { migrateProjectDepartmentOwner } from '../src/lib/migrations/009-project-department-owner.js';

if (!process.env.DATABASE_URL) process.loadEnvFile('.env.local');
const url = new URL(process.env.DATABASE_URL);
const remote = !['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const apply = process.argv.includes('--apply');
if (remote && (!url.hostname.endsWith('.neon.tech') || !process.argv.includes('--allow-neon'))) throw new Error('Explicit Neon authorization required');
const planPath = process.argv[process.argv.indexOf('--plan') + 1];
if (!process.argv.includes('--plan') || !planPath) throw new Error('Pass --plan with private reviewed JSON');
const plan = JSON.parse(readFileSync(planPath,'utf8'));
const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const client = new pg.Client({ connectionString: String(url), ssl: remote ? {rejectUnauthorized:true} : false, connectionTimeoutMillis:15000 });
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
const reason = `Nhập kế hoạch từ ${plan.source}; phân tích phòng ban là đề xuất, cần xác minh`;
let completed = false;
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('otis-work-plan-import'))");
  const actor = (await client.query("SELECT id FROM employees WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];
  if (!actor) throw new Error('Active administrator required');
  const departments = (await client.query('SELECT id,name FROM departments')).rows;
  const department = name => {
    const matches = departments.filter(row => normalize(row.name).replace(/^phong /,'') === name);
    if (matches.length !== 1) throw new Error('Missing or ambiguous department');
    return matches[0];
  };
  const mapped = { accounting: department('ke toan'), finance: department('tai chinh') };
  const prior = {};
  for (const table of ['customers','projects','tasks','schema_migrations']) prior[table] = (await client.query(`SELECT * FROM ${table}`)).rows;
  prior.projectOwnerNullable = (await client.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='owner_id'")).rows[0];
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  mkdirSync('imports/verification',{recursive:true});
  if (apply) writeFileSync(`imports/verification/work-plan-before-${stamp}.json`,JSON.stringify(prior,null,2),{mode:0o600});
  if (!prior.schema_migrations.some(row => row.version === 9)) {
    if (!prior.schema_migrations.some(row => row.version === 8)) throw new Error('Expected schema version 8 or later');
    await migrateProjectDepartmentOwner(client);
    await client.query('INSERT INTO schema_migrations(version) VALUES(9)');
    await writeAudit(client,{entityType:'schema_migration',entityId:'9',actorId:actor.id,action:'update',before:{project_owner_required:true},after:{project_owner_required:false},reason:'User approved department-based projects without individual owner'});
  }
  const created = { customer: null, project: null, tasks: [], skippedTasks: 0, sourceHash:hash };
  let customer = (await client.query('SELECT * FROM customers WHERE code=$1 OR name=$2',[plan.customer.code,plan.customer.name])).rows;
  if (customer.length>1) throw new Error('Ambiguous customer');
  if (!customer.length) {
    const row = (await client.query(`INSERT INTO customers(code,name,notes) VALUES($1,$2,$3) RETURNING *`,[plan.customer.code,plan.customer.name,`Theo ${plan.source}. ${plan.parties_text}. Không có thông tin liên hệ trong tài liệu.`])).rows[0];
    customer=[row]; created.customer=row.id;
    await writeAudit(client,{entityType:'customer',entityId:row.id,actorId:actor.id,action:'create',after:row,reason});
  }
  const lines = plan.phases.map(phase => `${phase.number}. ${phase.name} (${phase.duration})\n${phase.tasks.map(task=>`- ${task.title} [Đề xuất: ${mapped[task.department].name}]`).join('\n')}\nGhi chú nguyên bản: ${phase.note||'Không ghi'}`);
  const notes = `Kế hoạch thực hiện cho ${plan.customer.name}.\n${plan.parties_text}\n\nTheo tài liệu: Phòng Kế toán và Phòng Tài chính OTIS cùng thực hiện tất cả hạng mục. Hệ thống có một trường phòng phụ trách: tạm nhóm dự án ở Phòng Kế toán; đây là phân loại nhập liệu, không phải xác nhận phòng chủ trì. Các đầu việc được tách theo cả hai phòng. Chưa gán cá nhân.\n\n${lines.join('\n\n')}\n\nCẦN XÁC MINH: ngày bắt đầu và kết thúc tổng thể, tiến độ thực tế, phân bổ chủ trì/phối hợp và người thực hiện. Ngày 30/09/2026 ở ghi chú hạng mục 1–2 được giữ nguyên, chưa tự coi là hạn chót. Không suy ra ngày từ 60/90 ngày hay tháng 7–24.\n\nPHÂN TÍCH ĐỀ XUẤT: Kế toán phụ trách dữ liệu, chứng từ, công nợ, điều chỉnh và hồ sơ tài sản; Tài chính phụ trách phân tích, khoản vay, định giá, phương án vốn và hồ sơ chào bán. Kiểm toán lại cần xác minh đơn vị thực hiện; chốt sale có thể cần Kinh doanh phối hợp nhưng tài liệu chỉ giao hai phòng, chưa tự giao thêm phòng khác.`;
  let project = (await client.query('SELECT * FROM projects WHERE code=$1',[plan.project_code])).rows[0];
  if (project && (project.deleted_at || project.source_reference !== plan.source || project.customer_id !== customer[0].id)) throw new Error('Existing project conflicts with import');
  if (!project) {
    project = (await client.query(`INSERT INTO projects(code,name,customer_id,department_id,owner_id,notes,verification_status,source_reference,created_by)
      VALUES($1,$2,$3,$4,NULL,$5,'needs_verification',$6,$7) RETURNING *`,[plan.project_code,plan.project_name,customer[0].id,mapped.accounting.id,notes,plan.source,actor.id])).rows[0];
    created.project=project.id;
    await writeAudit(client,{entityType:'governance:projects',entityId:project.id,actorId:actor.id,action:'create',after:project,reason,version:1});
    await client.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES($1,$2,1,$3::jsonb,$4)',['projects',project.id,JSON.stringify(project),actor.id]);
  }
  for (const phase of plan.phases) for (const [index,task] of phase.tasks.entries()) {
    const key = `work-plan:${plan.project_code}:${phase.number}:${index+1}`;
    if ((await client.query('SELECT 1 FROM tasks WHERE source_import_key=$1',[key])).rowCount) { created.skippedTasks++; continue; }
    const description = `Nguồn: ${plan.source}, hạng mục ${phase.number}: ${phase.name}.\nNội dung nguyên bản: ${task.title}\nThời lượng hạng mục: ${phase.duration} (không phải thời lượng riêng đầu việc).\nPhòng ban theo tài liệu: ${phase.departments_source}\nGhi chú nguyên bản: ${phase.note||'Không ghi'}\nPhân tích đề xuất: ${mapped[task.department].name} thực hiện đầu việc này; phòng còn lại phối hợp theo tài liệu. Cần xác minh phân công và hạn chót; chưa gán nhân sự, chưa xác nhận tiến độ thực tế.`;
    const row = (await client.query(`INSERT INTO tasks(title,description,created_by,status,progress,customer_id,department_id,project_id,source_import_key,source_import_row)
      VALUES($1,$2,$3,'todo',0,$4,$5,$6,$7,$8) RETURNING *`,[`[${phase.number}.${index+1}] ${task.title}`,description,actor.id,customer[0].id,mapped[task.department].id,project.id,key,phase.number])).rows[0];
    created.tasks.push(row.id);
    await writeAudit(client,{entityType:'task',entityId:row.id,actorId:actor.id,action:'create',after:row,reason});
  }
  const check = (await client.query(`SELECT count(*)::int AS tasks,count(assignee_id)::int AS assigned_people FROM tasks WHERE project_id=$1 AND source_import_key LIKE $2`,[project.id,`work-plan:${plan.project_code}:%`])).rows[0];
  const expected = plan.phases.reduce((sum,phase)=>sum+phase.tasks.length,0);
  if (check.tasks !== expected || check.assigned_people !== 0) throw new Error('Import verification failed');
  const result = { mode: apply?'applied':'dry-run', projectId:project.id, ...created, verified:check };
  if (apply) writeFileSync(`imports/verification/work-plan-manifest-${stamp}.json`,JSON.stringify(result,null,2),{mode:0o600});
  await client.query(apply?'COMMIT':'ROLLBACK'); completed=true;
  console.log(JSON.stringify(result));
} finally {
  if (!completed) await client.query('ROLLBACK').catch(()=>{});
  await client.end();
}
