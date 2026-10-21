import { withAuth } from '@/lib/auth';
import { query } from '@/lib/db';
import { scopeFor } from '@/lib/access';
import { GOVERNANCE } from '@/lib/governance-config';
import { governanceScope } from '@/lib/governance-service';
import { governanceResponse } from '@/lib/governance-response';
import { GovernanceError } from '@/lib/governance-validation';

export const GET = withAuth(async(req,ctx,user)=>governanceResponse(async()=>{
  if(scopeFor(user,'insights','view')==='none') throw new GovernanceError('Không có quyền báo cáo quản trị',403);
  const month=new URL(req.url).searchParams.get('month');
  if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new GovernanceError('Tháng không hợp lệ');
  const summaries=[];
  if(user.permissions.employees?.view){
    const scope=governanceScope(user,'insights');
    const args=[...scope.params];
    let where=scope.sql.replaceAll('r.owner_id','r.id');
    if(!user.permissions.employees.manage){args.push(user.department_id??-1,user.id);where+=` AND (r.department_id=$${args.length-1} OR r.id=$${args.length})`;}
    const groups=await query(`SELECT r.department_id,d.name AS department_name,NULL::text AS month,COUNT(*)::int AS count,NULL::numeric AS approved_amount FROM employees r LEFT JOIN departments d ON d.id=r.department_id WHERE r.status='active' AND r.role<>'admin' AND ${where} GROUP BY r.department_id,d.name ORDER BY d.name`,args);
    summaries.push({resource:'employees',title:'Nhân sự đang làm việc',groups:groups.rows});
  }
  for(const resource of ['positions','assignments','staffing','recruitment','projects','awards','budgets','documents']){
    const config=GOVERNANCE[resource];
    if(scopeFor(user,config.module,'view')==='none') continue;
    const scope=governanceScope(user,config.module);
    const insights=governanceScope(user,'insights','view','r',scope.params.length+1);
    const args=[...scope.params,...insights.params];
    let where=`r.deleted_at IS NULL AND ${scope.sql} AND ${insights.sql}`;
    if(resource==='staffing')where+=' AND r.position_id IS NULL';
    if(month&&['staffing','budgets'].includes(resource)){args.push(month);where+=` AND r.month=$${args.length}`;}
    const amount=resource==='budgets'?'SUM(CASE WHEN r.status=\'approved\' THEN r.total_amount ELSE 0 END)':resource==='awards'?'SUM(CASE WHEN r.status=\'approved\' THEN r.amount ELSE 0 END)':'NULL::numeric';
    const monthly=['staffing','budgets'].includes(resource);
    const groups=await query(`SELECT r.department_id,d.name AS department_name,${monthly?'r.month':'NULL::text'} AS month,COUNT(*)::int AS count,${amount} AS approved_amount ${resource==='staffing'?',SUM(r.target_count)::int AS target_count':''} FROM ${config.table} r LEFT JOIN departments d ON d.id=r.department_id WHERE ${where} GROUP BY r.department_id,d.name${monthly?',r.month':''} ORDER BY d.name${monthly?',r.month':''}`,args);
    summaries.push({resource,title:config.title,groups:groups.rows});
  }
  return {month,summaries};
}));
