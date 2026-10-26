import { withAuth } from '@/lib/auth';
import { query } from '@/lib/db';
import { scopeFor } from '@/lib/access';
import { GOVERNANCE } from '@/lib/governance-config';
import { governanceScope } from '@/lib/governance-service';
import { governanceResponse } from '@/lib/governance-response';
import { GovernanceError } from '@/lib/governance-validation';
import { budgetScope } from '@/lib/salary-budget';
export const GET=withAuth(async(req,ctx,user)=>governanceResponse(async()=>{
  if(scopeFor(user,'activity','view')==='none')throw new GovernanceError('Không có quyền nhật ký',403);
  const searchParams=new URL(req.url).searchParams;
  const page=Number(searchParams.get('page')||1);
  const pageSize=Number(searchParams.get('pageSize')||20);
  if(![10,20,50,100].includes(pageSize))throw new GovernanceError('Số dòng không hợp lệ');
  if(!Number.isSafeInteger(page)||page<1||page>10000)throw new GovernanceError('Trang không hợp lệ');
  const args=[];const clauses=[];
  for(const [key,config] of Object.entries(GOVERNANCE)){
    if(scopeFor(user,config.module,'view')==='none')continue;
    const scope=key==='budgets'?budgetScope(user,'view','r',args.length+1):governanceScope(user,config.module,'view','r',args.length+1);args.push(...scope.params);
    const activity=governanceScope(user,'activity','view','r',args.length+1);args.push(...activity.params);
    clauses.push(`(a.entity_type='governance:${key}' AND EXISTS(SELECT 1 FROM ${config.table} r WHERE r.id::text=a.entity_id AND ${scope.sql} AND ${activity.sql}))`);
  }
  for(const [entity,module,table,owner] of [['task','tasks','tasks','assignee_id'],['report','reports','reports','employee_id'],['customer','customers','customers','owner_id']]){
    if(scopeFor(user,module,'view')==='none')continue;
    const scopes=[];
    for(const permission of [module,'activity']){
      const grant=scopeFor(user,permission,'view');
      if(grant==='all')scopes.push('TRUE');
      else if(grant==='department'){args.push(user.department_id??-1);scopes.push(`r.department_id=$${args.length}`);}
      else if(grant==='self'){args.push(user.id);scopes.push(`r.${owner}=$${args.length}`);}
      else scopes.push('FALSE');
    }
    clauses.push(`(a.entity_type='${entity}' AND EXISTS(SELECT 1 FROM ${table} r WHERE r.id::text=a.entity_id AND ${scopes.join(' AND ')}))`);
  }
  if(user.role==='admin')clauses.push("a.entity_type='role'");
  const rows=await query(`SELECT a.id,a.entity_type,a.entity_id,a.action,a.created_at,e.full_name AS actor_name FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id WHERE ${clauses.length?clauses.join(' OR '):'FALSE'} ORDER BY a.id DESC LIMIT ${pageSize+1} OFFSET $${args.length+1}`,[...args,(page-1)*pageSize]);
  return {items:rows.rows.slice(0,pageSize),hasMore:rows.rows.length>pageSize,page};
}));
