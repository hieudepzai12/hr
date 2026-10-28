import pg from 'pg';
import { writeAudit } from '../src/lib/audit.js';

process.loadEnvFile('.env.local');
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!new URL(url).hostname.endsWith('.neon.tech')) throw new Error('Unexpected target');
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
const source = 'b9e234d995917c4363b1925401e00c694cb95bdf01aabf1deb7616187ffb955d:%';
const codes = ['TRANG-KHANH','CHAU-CAM','TAN-KHOI','SEAGIFT','CHAU-BA-THAO'];
try {
  await db.connect(); await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'"); await db.query("SET LOCAL statement_timeout='30s'");
  await db.query('SELECT pg_advisory_xact_lock(68451207)');
  const actor = (await db.query("SELECT id FROM employees WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
  if (!actor) throw new Error('Admin missing');
  const customers = (await db.query('SELECT id,code,name FROM customers WHERE code=ANY($1::text[]) AND status=$2',[codes,'active'])).rows;
  if (customers.length !== 5) throw new Error('Customer count mismatch');
  const tasks = (await db.query('SELECT * FROM tasks WHERE source_import_key LIKE $1 AND customer_id=ANY($2::int[]) AND deleted_at IS NULL FOR UPDATE',[source,customers.map(c=>c.id)])).rows;
  if (tasks.length !== 46) throw new Error('Reviewed task count changed');
  const participants = (await db.query(`SELECT DISTINCT task_id,employee_id,e.department_id FROM (
    SELECT id AS task_id,assignee_id AS employee_id FROM tasks WHERE id=ANY($1::int[])
    UNION SELECT task_id,employee_id FROM task_collaborators WHERE task_id=ANY($1::int[])
  ) p JOIN employees e ON e.id=p.employee_id`,[tasks.map(t=>t.id)])).rows;
  if (participants.some(p=>!p.department_id)) throw new Error('Participant department missing');
  const plan = customers.map(customer => {
    const work = tasks.filter(t=>t.customer_id===customer.id);
    const people = participants.filter(p=>work.some(t=>t.id===p.task_id));
    return { customer, work, people: [...new Map(people.map(p=>[p.employee_id,p])).values()],
      departments: [...new Set(people.map(p=>p.department_id))].sort((a,b)=>a-b) };
  });
  if (!process.argv.includes('--apply')) {
    await db.query('ROLLBACK');
    console.log(JSON.stringify({dry_run:true,projects:plan.map(p=>({customer:p.customer.name,tasks:p.work.length,members:p.people.length,department_ids:p.departments}))}));
  } else {
    let created=0,linked=0,members=0;
    const summary=[];
    const saveGovernance = async (resource, row) => {
      await db.query('INSERT INTO governance_versions(resource,entity_id,version,snapshot,actor_id) VALUES ($1,$2,$3,$4::jsonb,$5)',[resource,row.id,row.version,JSON.stringify(row),actor.id]);
      await writeAudit(db,{entityType:`governance:${resource}`,entityId:row.id,actorId:actor.id,action:'create',after:row,version:row.version,reason:'User requested grouping source work plan by customer project'});
    };
    for (const item of plan) {
      const code=`${item.customer.code}-KE-HOACH`;
      let project=(await db.query('SELECT * FROM projects WHERE code=$1 FOR UPDATE',[code])).rows[0];
      if (project && (project.deleted_at || project.customer_id!==item.customer.id)) throw new Error('Project conflict');
      if (!project) {
        project=(await db.query(`INSERT INTO projects(code,name,customer_id,department_id,status,notes,source_reference,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[code,`Kế hoạch công việc ${item.customer.name}`,item.customer.id,item.departments[0],
          item.work.some(t=>['in_progress','review'].includes(t.status))?'active':'planned',
          'Gom các công việc theo khách hàng trong file kế hoạch. Các phòng ban cùng tham gia; chưa xác định hạn tổng thể và người phụ trách dự án.',
          'KẾ HOẠCH CÔNG VIỆC.xlsx',actor.id])).rows[0];
        await db.query('INSERT INTO project_departments(project_id,department_id) SELECT $1,unnest($2::int[])',[project.id,item.departments]);
        await saveGovernance('projects',{...project,department_ids:item.departments}); created++;
      } else {
        await db.query('INSERT INTO project_departments(project_id,department_id) SELECT $1,unnest($2::int[]) ON CONFLICT DO NOTHING',[project.id,item.departments]);
      }
      for (const task of item.work) {
        if (task.project_id && task.project_id!==project.id) throw new Error('Task already linked elsewhere');
        if (task.project_id===project.id) continue;
        const after=(await db.query('UPDATE tasks SET project_id=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[project.id,task.id])).rows[0];
        await writeAudit(db,{entityType:'task',entityId:task.id,actorId:actor.id,action:'update',before:task,after,reason:'Grouped work by customer project at user request'}); linked++;
      }
      for (const person of item.people) {
        const member=(await db.query(`INSERT INTO project_members(name,project_id,employee_id,department_id,notes,created_by)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (project_id,employee_id) WHERE deleted_at IS NULL DO NOTHING RETURNING *`,
        ['Thành viên thực hiện kế hoạch',project.id,person.employee_id,person.department_id,
          'Lấy từ người phụ trách / phối hợp của công việc nguồn.',actor.id])).rows[0];
        if(member){await saveGovernance('members',member);members++;}
      }
      summary.push({name:project.name,tasks:item.work.length,people:item.people.length,departments:item.departments});
    }
    const count=(await db.query('SELECT count(*)::int AS count FROM tasks WHERE id=ANY($1::int[]) AND project_id IS NOT NULL',[tasks.map(t=>t.id)])).rows[0].count;
    if(count!==46)throw new Error('Project link verification failed');
    await db.query('COMMIT');console.log(JSON.stringify({created_projects:created,linked_tasks:linked,added_members:members,projects:summary}));
  }
} catch(error) {
  await db.query('ROLLBACK').catch(()=>{});console.error('Project grouping failed; rolled back:',error.code||error.message);process.exitCode=1;
} finally { await db.end(); }
