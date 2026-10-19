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
