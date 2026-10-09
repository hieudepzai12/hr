import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/auth';

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
  return NextResponse.json({ departments: departmentResult.rows, employees: employeeResult.rows, companyWide });
});
