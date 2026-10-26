import { scopeFor } from './access';

export const budgetDepartmentsSelect = (alias='r') => `ARRAY(SELECT bd.department_id FROM salary_budget_departments bd WHERE bd.budget_id=${alias}.id ORDER BY bd.department_id) AS department_ids,
  (SELECT string_agg(d.name,' + ' ORDER BY d.name) FROM salary_budget_departments bd JOIN departments d ON d.id=bd.department_id WHERE bd.budget_id=${alias}.id) AS department_ids_label`;

// A department grant must never disclose a combined payroll amount for other departments.
export function budgetScope(user,action='view',alias='r',start=1) {
  const scope=scopeFor(user,'budgets',action);
  if(scope==='all')return {sql:'TRUE',params:[]};
  if(scope==='self')return {sql:`${alias}.owner_id=$${start}`,params:[user.id]};
  if(scope==='department')return {sql:`(${alias}.department_id=$${start} AND (${alias}.budget_mode='position' OR EXISTS(SELECT 1 FROM salary_budget_departments bd WHERE bd.budget_id=${alias}.id AND bd.department_id=$${start})) AND NOT EXISTS(SELECT 1 FROM salary_budget_departments bd WHERE bd.budget_id=${alias}.id AND bd.department_id<>$${start}))`,params:[user.department_id??-1]};
  return {sql:'FALSE',params:[]};
}
export function canAccessBudget(user,action,row) {
  const scope=scopeFor(user,'budgets',action);
  if(scope==='all')return true;
  if(scope==='self')return Number(row.owner_id)===Number(user.id);
  if(scope!=='department')return false;
  const ids=row.department_ids?.length?row.department_ids:row.budget_mode==='aggregate'?[]:[row.department_id];
  return ids.length===1&&Number(ids[0])===Number(user.department_id);
}

export const aggregateBudgetFields = new Set(['name','month','department_ids','headcount','total_amount','notes','source_reference']);
