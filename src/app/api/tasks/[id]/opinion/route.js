import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { withAuth, forbidden } from '@/lib/auth';
import { scopeAllows, scopeFor } from '@/lib/access';
import { canViewTask } from '@/lib/task-access';
import { writeAudit } from '@/lib/audit';

export const POST=withAuth(async(req,{params},user)=>{
  const {id}=await params;
  const body=await req.json().catch(()=>null);
  if(typeof body?.opinion!=='string'||!body.opinion.trim()||body.opinion.length>10000)return NextResponse.json({error:'Nhập ý kiến lãnh đạo, tối đa 10.000 ký tự'},{status:400});
  return transaction(async client=>{
    const {rows}=await client.query('SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
    const before=rows[0];
    if(!before)return NextResponse.json({error:'Không tìm thấy công việc'},{status:404});
    if(!scopeAllows(user,'tasks','approve',{ownerId:before.assignee_id,departmentId:before.department_id})||!await canViewTask(before,user))return forbidden();
    const reportScope=scopeFor(user,'reports','view');
    const reportAccess=reportScope==='all'?'TRUE':reportScope==='self'?'r.employee_id=$2':reportScope==='department'?'COALESCE(r.department_id,e.department_id)=$2':'FALSE';
    const reportParams=[id];
    if(reportScope==='self'||reportScope==='department')reportParams.push(reportScope==='self'?user.id:user.department_id??-1);
    const submitted=await client.query(`SELECT 1 FROM report_items ri JOIN reports r ON r.id=ri.report_id
      JOIN employees e ON e.id=r.employee_id WHERE ri.task_id=$1 AND r.deleted_at IS NULL
      AND r.status IN ('submitted','reviewed','approved') AND ${reportAccess} LIMIT 1`,reportParams);
    if(!submitted.rowCount)return NextResponse.json({error:'Công việc chưa có báo cáo đã gửi trong phạm vi bạn được xem.'},{status:409});
    if(body.opinion.trim()===(before.leader_opinion||'').trim())return NextResponse.json(before);
    const {rows:updated}=await client.query('UPDATE tasks SET leader_opinion=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[body.opinion.trim(),id]);
    await writeAudit(client,{entityType:'task',entityId:Number(id),actorId:user.id,action:'leader_opinion',before,after:updated[0]});
    return NextResponse.json(updated[0]);
  });
});
