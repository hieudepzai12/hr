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
  const actorName="COALESCE(NULLIF(a.changes->'_record'->'after'->>'actor_name',''),e.full_name)";
  const recordName="COALESCE(a.changes->'_record'->'after'->>'name',a.changes->'title'->>'after',a.changes->'title'->>'before',a.changes->'name'->>'after',a.changes->'name'->>'before',a.changes->'label'->>'after')";
  const filters=[];
  const action=searchParams.get('action');
  if(action){
    if(!/^[a-z_]{1,40}$/.test(action))throw new GovernanceError('Hành động không hợp lệ');
    const aliases={approve:['approve','approved'],review:['review','reviewed'],reject:['reject','rejected'],edit:['edit','update']};
    args.push(aliases[action]||[action]);filters.push(`a.action=ANY($${args.length}::text[])`);
  }
  const entity=searchParams.get('entity_type');
  if(entity){
    if(!['task','report','customer','role',...Object.keys(GOVERNANCE).map(key=>`governance:${key}`)].includes(entity))throw new GovernanceError('Mục chức năng không hợp lệ');
    args.push(entity);filters.push(`a.entity_type=$${args.length}`);
  }
  const from=searchParams.get('from');const to=searchParams.get('to');
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new GovernanceError('Khoảng ngày không hợp lệ');
  if(from){args.push(from);filters.push(`a.created_at>=($${args.length}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);}
  if(to){args.push(to);filters.push(`a.created_at<(($${args.length}::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);}
  const search=searchParams.get('search')?.trim();
  if(search){
    if(search.length>200)throw new GovernanceError('Từ khóa quá dài');
    args.push(`%${search}%`);filters.push(`(${actorName} ILIKE $${args.length} OR ${recordName} ILIKE $${args.length} OR a.entity_id ILIKE $${args.length})`);
  }
  const rows=await query(`SELECT a.id,a.entity_type,a.entity_id,a.action,a.created_at,a.actor_id,COALESCE(NULLIF(a.changes->'_record'->'after'->>'actor_name',''),e.full_name) AS actor_name,COALESCE(a.changes->'_record'->'after'->>'name',a.changes->'title'->>'after',a.changes->'title'->>'before',a.changes->'name'->>'after',a.changes->'name'->>'before',a.changes->'label'->>'after') AS record_name FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id WHERE (${clauses.length?clauses.join(' OR '):'FALSE'})${filters.length?' AND '+filters.join(' AND '):''} ORDER BY a.id DESC LIMIT ${pageSize+1} OFFSET $${args.length+1}`,[...args,(page-1)*pageSize]);
  return {items:rows.rows.slice(0,pageSize),hasMore:rows.rows.length>pageSize,page};
}));
