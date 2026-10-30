// Database upgrades 005-014. Version checks and execution order are maintained in db.js.

// Migration 005-governance
export async function migrateGovernance(client) {
  await client.query(`
    CREATE TABLE positions (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      parent_id INTEGER REFERENCES positions(id) ON DELETE RESTRICT,
      responsibilities TEXT NOT NULL, requirements TEXT,
      verification_status TEXT NOT NULL DEFAULT 'needs_verification', source_reference TEXT,
      owner_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
      created_by INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ, deleted_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(parent_id <> id)
    );
    CREATE TABLE position_assignments (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      owner_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
      start_date DATE NOT NULL, end_date DATE, notes TEXT,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(end_date IS NULL OR end_date >= start_date)
    );
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      owner_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      start_date DATE, end_date DATE, status TEXT NOT NULL DEFAULT 'planned', notes TEXT,
      verification_status TEXT NOT NULL DEFAULT 'needs_verification', source_reference TEXT,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    );
    ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT;
    CREATE INDEX tasks_project_idx ON tasks(project_id);
    CREATE TABLE project_members (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT, owner_id INTEGER REFERENCES employees(id),
      allocation INTEGER NOT NULL DEFAULT 100 CHECK(allocation BETWEEN 0 AND 100), start_date DATE, end_date DATE, notes TEXT,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    );
    CREATE UNIQUE INDEX project_member_active_unique ON project_members(project_id,employee_id) WHERE deleted_at IS NULL;
    CREATE TABLE staffing_plans (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, position_id INTEGER NOT NULL REFERENCES positions(id),
      department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER REFERENCES employees(id),
      month TEXT NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), target_count INTEGER NOT NULL CHECK(target_count>=0), notes TEXT, source_reference TEXT,
      status TEXT NOT NULL DEFAULT 'draft', feedback TEXT, reviewed_by INTEGER REFERENCES employees(id), reviewed_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX staffing_position_month_unique ON staffing_plans(position_id,month) WHERE deleted_at IS NULL;
    CREATE TABLE recruitment_requests (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, position_id INTEGER NOT NULL REFERENCES positions(id),
      department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER REFERENCES employees(id),
      quantity INTEGER NOT NULL CHECK(quantity>0), hired_count INTEGER NOT NULL DEFAULT 0 CHECK(hired_count>=0),
      target_date DATE, hiring_status TEXT NOT NULL DEFAULT 'pending', notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft', feedback TEXT, reviewed_by INTEGER REFERENCES employees(id), reviewed_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(hired_count<=quantity)
    );
    CREATE TABLE bonus_policies (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id), owner_id INTEGER REFERENCES employees(id),
      calculation TEXT NOT NULL DEFAULT 'manual', rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK(rate BETWEEN 0 AND 100),
      conditions TEXT NOT NULL, start_date DATE, end_date DATE, source_reference TEXT,
      status TEXT NOT NULL DEFAULT 'draft', feedback TEXT, reviewed_by INTEGER REFERENCES employees(id), reviewed_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE bonus_awards (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, project_id INTEGER NOT NULL REFERENCES projects(id),
      policy_id INTEGER NOT NULL REFERENCES bonus_policies(id), policy_snapshot JSONB NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees(id), department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER REFERENCES employees(id),
      basis_amount NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK(basis_amount>=0), amount NUMERIC(18,0) NOT NULL CHECK(amount>=0), notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft', feedback TEXT, reviewed_by INTEGER REFERENCES employees(id), reviewed_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE salary_budgets (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, position_id INTEGER NOT NULL REFERENCES positions(id),
      department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER REFERENCES employees(id),
      month TEXT NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), headcount INTEGER NOT NULL CHECK(headcount>=0),
      base_salary NUMERIC(18,0) NOT NULL CHECK(base_salary>=0), allowance NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK(allowance>=0),
      employer_cost NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK(employer_cost>=0), total_amount NUMERIC(18,0) NOT NULL CHECK(total_amount>=0), notes TEXT, source_reference TEXT,
      status TEXT NOT NULL DEFAULT 'draft', feedback TEXT, reviewed_by INTEGER REFERENCES employees(id), reviewed_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX salary_position_month_unique ON salary_budgets(position_id,month) WHERE deleted_at IS NULL;
    CREATE TABLE document_folders (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER REFERENCES document_folders(id),
      department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER NOT NULL REFERENCES employees(id), notes TEXT,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(parent_id <> id)
    );
    CREATE TABLE internal_documents (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, folder_id INTEGER NOT NULL REFERENCES document_folders(id),
      department_id INTEGER NOT NULL REFERENCES departments(id), owner_id INTEGER NOT NULL REFERENCES employees(id),
      url TEXT NOT NULL, instructions TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'needs_verification', source_reference TEXT,
      created_by INTEGER NOT NULL REFERENCES employees(id), version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ, deleted_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE governance_versions (
      id BIGSERIAL PRIMARY KEY, resource TEXT NOT NULL, entity_id INTEGER NOT NULL, version INTEGER NOT NULL,
      snapshot JSONB NOT NULL, actor_id INTEGER NOT NULL REFERENCES employees(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(resource,entity_id,version)
    );
  `);
  for (const table of ['positions','position_assignments','projects','project_members','staffing_plans','recruitment_requests','bonus_policies','bonus_awards','salary_budgets','document_folders','internal_documents']) {
    await client.query(`CREATE INDEX ${table}_scope_idx ON ${table}(department_id,owner_id) WHERE deleted_at IS NULL`);
  }
}

// Migration 006-audit-entity-text
// Role keys are text; existing numeric object IDs are preserved as their text form.
export async function migrateAuditEntityText(client){
 await client.query('ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE TEXT USING entity_id::text');
}

// Migration 007-personnel-duty-project
export async function migratePersonnelDutyProject(client){
 await client.query(`ALTER TABLE position_assignments ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT;
 CREATE INDEX position_assignments_project_live ON position_assignments(project_id) WHERE deleted_at IS NULL;`);
}

// Migration 008-department-staffing
export async function migrateDepartmentStaffing(client){
 await client.query(`ALTER TABLE staffing_plans ALTER COLUMN position_id DROP NOT NULL;
 CREATE UNIQUE INDEX staffing_department_month_unique ON staffing_plans(department_id,month)
 WHERE deleted_at IS NULL AND position_id IS NULL;`);
}

// Migration 009-project-department-owner
// Department work plans do not require an individual project owner.
export async function migrateProjectDepartmentOwner(client) {
  await client.query('ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL');
}

// Migration 010-position-role-description
// Keep existing duties and requirements intact; introduce the separate role/responsibility section.
export async function migratePositionRoleDescription(client) {
  await client.query('ALTER TABLE positions ADD COLUMN IF NOT EXISTS role_description TEXT');
}

// Migration 011-project-departments
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

// Migration 012-salary-budget-groups
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

// Migration 013-department-bonuses
export async function migrateDepartmentBonuses(client) {
  await client.query(`ALTER TABLE bonus_awards
    ALTER COLUMN employee_id DROP NOT NULL,
    ADD COLUMN award_scope TEXT NOT NULL DEFAULT 'legacy'
      CHECK (award_scope IN ('legacy','department','employee')),
    ADD CONSTRAINT bonus_award_recipient_check CHECK (
      (award_scope='department' AND employee_id IS NULL AND owner_id IS NULL)
      OR (award_scope IN ('legacy','employee') AND employee_id IS NOT NULL));
    CREATE INDEX bonus_awards_department_scope_idx ON bonus_awards(department_id,award_scope)
      WHERE deleted_at IS NULL;
  `);
}

// Migration 014-task-progress-text
export async function migrateTaskProgressText(client) {
  await client.query(`ALTER TABLE tasks ADD COLUMN progress_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE task_updates ADD COLUMN progress_text TEXT NOT NULL DEFAULT '';`);
}
