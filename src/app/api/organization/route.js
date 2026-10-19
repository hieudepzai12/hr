import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { scopeFor } from '@/lib/access';
import { governanceScope } from '@/lib/governance-service';
import { vietnamToday } from '@/lib/deadline';

export const GET = withAuth(async (req, ctx, user) => {
  const companyWide = user.permissions.organization.scope === 'full';
  const params = companyWide ? [] : [user.id];
  const departmentFilter = companyWide ? '' : 'WHERE d.id = (SELECT department_id FROM employees WHERE id = $1)';
  const employeeFilter = companyWide ? '' : "AND (e.department_id = (SELECT department_id FROM employees WHERE id = $1) OR e.role = 'director')";
  const [departmentResult, employeeResult] = await Promise.all([
    query(`SELECT d.id, d.name FROM departments d ${departmentFilter} ORDER BY d.name`, params),
    query(`SELECT e.id, e.full_name, e.role, e.position, e.department_id, e.manager_id,
        COALESCE(r.label, CASE e.role WHEN 'director' THEN 'Giám đốc' WHEN 'manager' THEN 'Quản lý' ELSE 'Nhân viên' END) AS role_label
      FROM employees e LEFT JOIN role_permissions r ON r.role = e.role
      WHERE e.status = 'active' AND e.role <> 'admin' ${employeeFilter} ORDER BY e.full_name`, params),
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
  return NextResponse.json({ departments: departmentResult.rows, employees: employeeResult.rows, positions, companyWide });
});
