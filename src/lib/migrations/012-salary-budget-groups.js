export async function migrateSalaryBudgetGroups(client) {
  await client.query(`ALTER TABLE salary_budgets
    ADD COLUMN budget_mode TEXT NOT NULL DEFAULT 'position' CHECK(budget_mode IN ('position','aggregate')),
    ALTER COLUMN position_id DROP NOT NULL,
    ALTER COLUMN headcount DROP NOT NULL;
    CREATE TABLE salary_budget_departments (
      budget_id INTEGER NOT NULL REFERENCES salary_budgets(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      PRIMARY KEY(budget_id,department_id)
    );
    CREATE INDEX salary_budget_departments_department_idx ON salary_budget_departments(department_id,budget_id);
    INSERT INTO salary_budget_departments(budget_id,department_id)
      SELECT id,department_id FROM salary_budgets WHERE department_id IS NOT NULL;
  `);
}
