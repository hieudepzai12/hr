export async function migrateDepartmentStaffing(client){
 await client.query(`ALTER TABLE staffing_plans ALTER COLUMN position_id DROP NOT NULL;
 CREATE UNIQUE INDEX staffing_department_month_unique ON staffing_plans(department_id,month)
 WHERE deleted_at IS NULL AND position_id IS NULL;`);
}
