export async function migrateProjectDepartments(client) {
  await client.query(`CREATE TABLE project_departments (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    PRIMARY KEY(project_id,department_id)
  );
  CREATE INDEX project_departments_department_idx ON project_departments(department_id,project_id);
  INSERT INTO project_departments(project_id,department_id)
    SELECT id,department_id FROM projects
    UNION SELECT project_id,department_id FROM tasks WHERE project_id IS NOT NULL AND department_id IS NOT NULL
    UNION SELECT m.project_id,e.department_id FROM project_members m JOIN employees e ON e.id=m.employee_id
      WHERE e.department_id IS NOT NULL AND m.deleted_at IS NULL
    ON CONFLICT DO NOTHING;`);
}
