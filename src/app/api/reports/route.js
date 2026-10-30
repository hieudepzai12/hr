import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeFor, scopeAllows } from '@/lib/access';
import { parsePagination, pagedResult, appendPagination } from '@/lib/pagination';
import { replaceReportItems, saveReportVersion } from '@/lib/report-service';
import { writeAudit } from '@/lib/audit';

export const GET = withAuth(async (req, ctx, user) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  if (pagination === false) return NextResponse.json({ error: 'Phân trang không hợp lệ' }, { status: 400 });
  const scope = scopeFor(user, 'reports', 'view');
  if (scope === 'none') return forbidden();
  const deleted = searchParams.get('deleted') === '1';
  if (deleted && scopeFor(user, 'reports', 'restore') === 'none') return forbidden();
  const params = [];
  let sql = `SELECT ${pagination ? `r.id, r.title, LEFT(r.content, 240) AS excerpt, r.type, r.employee_id,
    r.department_id, r.customer_id, r.status, r.feedback, r.period_start, r.period_end, r.created_at,
    r.updated_at, r.submitted_at, r.deleted_at, r.version` : 'r.*'},
    e.full_name AS employee_name, d.name AS department_name, c.name AS customer_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id',ri.task_id,'title',ri.snapshot->>'title','description',ri.snapshot->>'description','project_id',ri.snapshot->'project_id','project_name',ri.snapshot->>'project_name','customer_id',ri.snapshot->'customer_id','customer_name',ri.snapshot->>'customer_name',
      'progress_text',ri.snapshot->>'progress_text','progress',ri.snapshot->'progress','due_date',ri.snapshot->>'due_date',
      'blockers',ri.snapshot->>'blockers','solution',ri.snapshot->>'solution') ORDER BY ri.id)
      FROM report_items ri WHERE ri.report_id=r.id),'[]'::jsonb) AS task_summaries
    FROM reports r JOIN employees e ON e.id=r.employee_id
    LEFT JOIN departments d ON d.id=COALESCE(r.department_id,e.department_id)
    LEFT JOIN customers c ON c.id=r.customer_id
    WHERE r.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'}`;
  if (scope === 'self') { params.push(user.id); sql += ` AND r.employee_id=$${params.length}`; }
  if (scope === 'department') { params.push(user.department_id ?? -1); sql += ` AND COALESCE(r.department_id,e.department_id)=$${params.length}`; }
  const taskId = searchParams.get('task_id');
  if (taskId) {
    if (!/^[1-9]\d*$/.test(taskId) || Number(taskId)>2147483647) return NextResponse.json({error:'Mã công việc không hợp lệ'},{status:400});
    params.push(Number(taskId)); sql += ` AND EXISTS (SELECT 1 FROM report_items ri WHERE ri.report_id=r.id AND ri.task_id=$${params.length})`;
  }
  const projectId=searchParams.get('project_id');
  if(projectId){
    if(!/^[1-9]\d*$/.test(projectId)||Number(projectId)>2147483647)return NextResponse.json({error:'Mã dự án không hợp lệ'},{status:400});
    params.push(projectId);sql+=` AND EXISTS(SELECT 1 FROM report_items ri WHERE ri.report_id=r.id AND ri.snapshot->>'project_id'=$${params.length}::text)`;
  }
  for (const [key, column] of Object.entries({ employee_id: 'r.employee_id', department_id: 'COALESCE(r.department_id,e.department_id)', customer_id: 'r.customer_id', status: 'r.status', type: 'r.type' })) {
    const value = searchParams.get(key);
    if(value&&key==='status'&&['draft','submitted'].includes(value)){params.push(value==='submitted'?['submitted','reviewed','approved']:['draft','reopened','rejected']);sql+=` AND ${column}=ANY($${params.length}::text[])`;}
    else if (value) { params.push(value); sql += ` AND ${column}=$${params.length}`; }
  }
  if (searchParams.get('from')) { params.push(searchParams.get('from')); sql += ` AND r.period_end >= $${params.length}`; }
  if (searchParams.get('to')) { params.push(searchParams.get('to')); sql += ` AND r.period_start <= $${params.length}`; }
  sql = appendPagination(sql + ' ORDER BY r.created_at DESC, r.id DESC', params, pagination);
  const { rows } = await query(sql, params);
  return NextResponse.json(pagedResult(rows, pagination));
});

export const POST = withAuth(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 500 ||
    typeof body.content !== 'string' || body.content.length > 100000 ||
    !['daily', 'weekly', 'monthly', 'project'].includes(body.type || 'weekly') ||
    (body.status && !['draft', 'submitted'].includes(body.status))) {
    return NextResponse.json({ error: 'Thông tin báo cáo không hợp lệ' }, { status: 400 });
  }
  if (!scopeAllows(user, 'reports', 'create', { ownerId: user.id, departmentId: user.department_id })) return forbidden();
  if (body.period_start && body.period_end && body.period_start > body.period_end) {
    return NextResponse.json({ error: 'Kỳ báo cáo không hợp lệ' }, { status: 400 });
  }
  try {
    const report = await transaction(async (client) => {
      const status = body.status || 'submitted';
      const { rows } = await client.query(`INSERT INTO reports
        (title, content, type, employee_id, department_id, customer_id, status, period_start, period_end, submitted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [body.title.trim(), body.content, body.type || 'weekly', user.id, user.department_id,
        body.customer_id || null, status, body.period_start || null, body.period_end || null,
        status === 'submitted' ? new Date() : null]);
      await replaceReportItems(client, rows[0].id, body.task_ids || [], user.id);
      await saveReportVersion(client, rows[0].id, user.id);
      await writeAudit(client, { entityType: 'report', entityId: rows[0].id, actorId: user.id,
        action: status === 'submitted' ? 'submit' : 'create', after: rows[0], version: 1 });
      return rows[0];
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    if (['INVALID_TASKS', 'TASK_ACCESS'].includes(error.code)) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});
