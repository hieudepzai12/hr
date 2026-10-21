export async function migratePersonnelDutyProject(client){
 await client.query(`ALTER TABLE position_assignments ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT;
 CREATE INDEX position_assignments_project_live ON position_assignments(project_id) WHERE deleted_at IS NULL;`);
}
