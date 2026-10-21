import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { governanceScope } from '@/lib/governance-service';
import { vietnamToday } from '@/lib/deadline';
import {summarizeRecruitment} from '@/lib/recruitment-summary';
import {visibleOrganizationEmployees} from '@/lib/company-structure';

export const GET = withAuth(async (req, ctx, user) => {
  const month = new URL(req.url).searchParams.get('month') || vietnamToday().slice(0,7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({error:'Tháng không hợp lệ'},{status:400});
  const companyWide = user.permissions.organization.scope === 'full';
  const params = companyWide ? [] : [user.id];
  const departmentFilter = companyWide ? '' : 'WHERE d.id = (SELECT department_id FROM employees WHERE id = $1)';
  const [departmentResult, employeeResult] = await Promise.all([
    query(`SELECT d.id, d.name FROM departments d ${departmentFilter} ORDER BY d.name`, params),
    query(`SELECT e.id, e.full_name, e.role, e.position, e.department_id, e.manager_id,
        COALESCE(r.label, CASE e.role WHEN 'director' THEN 'Giám đốc' WHEN 'manager' THEN 'Quản lý' ELSE 'Nhân viên' END) AS role_label
      FROM employees e LEFT JOIN role_permissions r ON r.role = e.role
      WHERE e.status = 'active' AND e.role <> 'admin' ORDER BY e.full_name`),
  ]);
  let positions = [];
  if (scopeFor(user,'positions','view') !== 'none') {
    const scope = governanceScope(user,'positions');
    const args = [...scope.params,vietnamToday()];
    let where = scope.sql;
    if (!companyWide) { args.push(user.department_id ?? -1); where += ` AND r.department_id=$${args.length}`; }
    positions = (await query(`SELECT r.id,r.code,r.name,r.parent_id,r.department_id,r.responsibilities,r.requirements,r.verification_status,r.source_reference,
      COALESCE((SELECT string_agg(e.full_name, ', ' ORDER BY e.full_name) FROM position_assignments a JOIN employees e ON e.id=a.employee_id WHERE a.position_id=r.id AND a.deleted_at IS NULL AND a.start_date<=$${scope.params.length+1}::date AND (a.end_date IS NULL OR a.end_date>=$${scope.params.length+1}::date)), '') AS holders
      FROM positions r WHERE r.deleted_at IS NULL AND ${where} ORDER BY r.name`,args)).rows;
  }
  let recruitment=null;
  if(scopeFor(user,'recruitment','view')!=='none'){
    const scope=governanceScope(user,'recruitment');
    const args=[...scope.params];let where=scope.sql;
    if(!companyWide){args.push(user.department_id??-1);where+=` AND r.department_id=$${args.length}`;}
    const rows=await query(`SELECT r.department_id,r.quantity,r.hired_count,r.status,r.hiring_status
      FROM recruitment_requests r WHERE r.deleted_at IS NULL AND r.status='approved'
      AND r.hiring_status IN ('pending','recruiting') AND ${where}`,args);
    recruitment=summarizeRecruitment(rows.rows);
  }
  const employees=visibleOrganizationEmployees(employeeResult.rows,departmentResult.rows,user,companyWide);
  let staffing=null;
  if(scopeFor(user,'staffing','view')!=='none'){
    const scope=governanceScope(user,'staffing');
    const args=[...scope.params,month];
    let where=`${scope.sql} AND r.month=$${args.length}`;
    if(!companyWide){args.push(user.department_id??-1);where+=` AND r.department_id=$${args.length}`;}
    staffing=(await query(`SELECT r.department_id,SUM(r.target_count)::int AS target_count
      FROM staffing_plans r WHERE r.deleted_at IS NULL AND r.position_id IS NULL AND r.status='approved' AND ${where}
      GROUP BY r.department_id`,args)).rows;
  }
  return NextResponse.json({ departments: departmentResult.rows, employees, positions, companyWide, recruitment, staffing, month });
});
