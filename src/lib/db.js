import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Cache pool trên `global` để tránh mở nhiều kết nối khi Next.js hot-reload
// (dev) hoặc khi nhiều serverless function invocations dùng chung module (Vercel).
const globalForDb = globalThis;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Thiếu biến môi trường DATABASE_URL. Tạo database Postgres (khuyến nghị: neon.tech, miễn phí) ' +
      'rồi đặt DATABASE_URL trong .env.local (dev) hoặc Environment Variables trên Vercel (production). Xem README.'
    );
  }
  return new Pool({
    connectionString,
    // Hầu hết nhà cung cấp Postgres serverless (Neon, Vercel Postgres, Supabase...) yêu cầu SSL.
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: true },
    max: process.env.VERCEL ? 1 : 10, // serverless: mỗi instance chỉ nên giữ 1 kết nối
  });
}

const previousPool = globalForDb.__hrPgPool;
const pool = previousPool && !previousPool.ending && globalForDb.__hrPgPoolUrl === process.env.DATABASE_URL ? previousPool : createPool();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__hrPgPool = pool;
  globalForDb.__hrPgPoolUrl = process.env.DATABASE_URL;
}

/** Chạy một câu truy vấn SQL, trả về { rows, rowCount } giống pg gốc. */
export function query(text, params) {
  return pool.query(text, params);
}

export function closeDb() {
  return pool.end();
}

/** Lấy dòng đầu tiên, hoặc null nếu không có kết quả. */
export async function queryOne(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

let schemaReadyPromise = null;

/** Đảm bảo bảng đã được tạo & seed dữ liệu mẫu. Gọi an toàn nhiều lần — chỉ chạy thật sự một lần. */
export function ensureSchema() {
  if (!schemaReadyPromise) schemaReadyPromise = (process.env.NODE_ENV === 'production' ? verifySchema() : migrateSchema()).catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

async function verifySchema() {
  try {
    await pool.query('SELECT token_version FROM employees LIMIT 0');
  } catch {
    throw new Error('Database schema is not ready. Run npm run migrate before starting production.');
  }
}

export async function migrateSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      position TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      phone TEXT,
      join_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      avatar_color TEXT DEFAULT '#2C5F5D',
      avatar_path TEXT,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY,
      label TEXT,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'weekly',
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'submitted',
      feedback TEXT,
      period_start TEXT,
      period_end TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      start_date TEXT,
      due_date TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kpi_evaluations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      criteria JSONB NOT NULL,
      total_score REAL NOT NULL,
      rating TEXT,
      comments TEXT,
      evaluated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Postgres >= 9.6 hỗ trợ IF NOT EXISTS cho ADD COLUMN — an toàn khi chạy lại nhiều lần.
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_path TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL');
  await pool.query(`UPDATE employees AS staff SET manager_id = lead.id
      FROM employees AS lead
      WHERE lead.email = 'manager@company.vn' AND lead.role = 'manager' AND lead.status = 'active'
        AND staff.email IN ('binh@company.vn', 'ha@company.vn')
        AND staff.role = 'employee' AND staff.department_id = lead.department_id
        AND staff.manager_id IS NULL`);
  await pool.query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS label TEXT');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_label_unique ON role_permissions (LOWER(label)) WHERE label IS NOT NULL');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS employees_department_idx ON employees (department_id);
    CREATE INDEX IF NOT EXISTS employees_name_id_idx ON employees (full_name, id);
    CREATE INDEX IF NOT EXISTS employees_manager_idx ON employees (manager_id);
    CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assignee_id);
    CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date);
    CREATE INDEX IF NOT EXISTS tasks_due_date_id_idx ON tasks (due_date, id);
    CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
    CREATE INDEX IF NOT EXISTS reports_employee_idx ON reports (employee_id);
    CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
    CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
    CREATE INDEX IF NOT EXISTS reports_created_at_id_idx ON reports (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS kpi_employee_idx ON kpi_evaluations (employee_id);
    CREATE INDEX IF NOT EXISTS kpi_period_idx ON kpi_evaluations (period);
    CREATE INDEX IF NOT EXISTS kpi_created_at_id_idx ON kpi_evaluations (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments (entity_type, entity_id);
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM employees');
  if (rows[0].c === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.MIGRATION_MODE === '1') {
      const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
      const password = process.env.INITIAL_ADMIN_PASSWORD;
      if (!email || typeof password !== 'string' || password.length < 16) {
        throw new Error('Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (at least 16 characters) before first production login');
      }
      const hash = await bcrypt.hash(password, 12);
      await pool.query(`INSERT INTO employees (full_name, email, password_hash, role)
        VALUES ('Quản trị viên', $1, $2, 'admin') ON CONFLICT (email) DO NOTHING`, [email, hash]);
    } else {
      await seed();
    }
  }
}

async function seed() {
  const deptRows = [
    ['Ban Giám đốc', 'Điều hành chiến lược công ty'],
    ['Kỹ thuật', 'Phát triển sản phẩm và hạ tầng'],
    ['Kinh doanh', 'Bán hàng và phát triển khách hàng'],
    ['Nhân sự', 'Quản lý con người và văn hoá công ty'],
  ];
  const deptIds = {};
  for (const [name, description] of deptRows) {
    const { rows } = await pool.query(
      'INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING id',
      [name, description]
    );
    deptIds[name] = rows[0].id;
  }

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const colors = ['#2C5F5D', '#C97B4A', '#5B5F97', '#8A9B6E', '#B85C5C', '#4A7B8C'];
  const seedEmployees = [
    ['Quản trị viên', 'admin@company.vn', 'admin123', 'admin', 'Quản trị hệ thống', deptIds['Ban Giám đốc'], '0901000000', '2024-01-01'],
    ['Trần Minh Anh', 'manager@company.vn', 'manager123', 'manager', 'Trưởng phòng Kỹ thuật', deptIds['Kỹ thuật'], '0901000001', '2024-02-15'],
    ['Nguyễn Văn Bình', 'binh@company.vn', 'employee123', 'employee', 'Lập trình viên', deptIds['Kỹ thuật'], '0901000002', '2024-03-01'],
    ['Lê Thị Cẩm', 'cam@company.vn', 'employee123', 'employee', 'Chuyên viên Kinh doanh', deptIds['Kinh doanh'], '0901000003', '2024-04-10'],
    ['Phạm Đức Duy', 'duy@company.vn', 'employee123', 'employee', 'Chuyên viên Nhân sự', deptIds['Nhân sự'], '0901000004', '2024-05-20'],
    ['Hoàng Thu Hà', 'ha@company.vn', 'employee123', 'employee', 'Thiết kế UI/UX', deptIds['Kỹ thuật'], '0901000005', '2024-06-01'],
  ];

  const empIds = {};
  for (let i = 0; i < seedEmployees.length; i++) {
    const e = seedEmployees[i];
    const { rows } = await pool.query(
      `INSERT INTO employees (full_name, email, password_hash, role, position, department_id, phone, join_date, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [e[0], e[1], hash(e[2]), e[3], e[4], e[5], e[6], e[7], colors[i % colors.length]]
    );
    empIds[e[1]] = rows[0].id;
  }
  await pool.query('UPDATE employees SET manager_id = $1 WHERE id = ANY($2::int[])',
    [empIds['manager@company.vn'], [empIds['binh@company.vn'], empIds['ha@company.vn']]]);

  const tasks = [
    ['Hoàn thiện module đăng nhập', 'Xây dựng luồng xác thực JWT cho hệ thống', empIds['binh@company.vn'], empIds['manager@company.vn'], 'in_progress', 'high', '2026-09-01', '2026-09-15', 60],
    ['Thiết kế giao diện Dashboard', 'Wireframe và UI cho trang tổng quan', empIds['ha@company.vn'], empIds['manager@company.vn'], 'review', 'medium', '2026-09-03', '2026-09-12', 85],
    ['Ký hợp đồng khách hàng ABC', 'Hoàn tất đàm phán và ký kết', empIds['cam@company.vn'], empIds['admin@company.vn'], 'todo', 'urgent', '2026-09-08', '2026-09-18', 10],
    ['Tổ chức onboarding nhân viên mới', 'Chuẩn bị tài liệu và lịch trình đào tạo', empIds['duy@company.vn'], empIds['manager@company.vn'], 'todo', 'medium', '2026-09-10', '2026-09-25', 0],
    ['Báo cáo tài chính quý 3', 'Tổng hợp số liệu chi tiêu và doanh thu', empIds['admin@company.vn'], empIds['admin@company.vn'], 'in_progress', 'high', '2026-09-01', '2026-09-30', 30],
  ];
  for (const t of tasks) {
    await pool.query(
      `INSERT INTO tasks (title, description, assignee_id, created_by, status, priority, start_date, due_date, progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      t
    );
  }

  await pool.query(
    `INSERT INTO reports (title, content, type, employee_id, status, period_start, period_end) VALUES
     ('Báo cáo tuần 36', 'Đã hoàn thành 60% module đăng nhập, dự kiến xong tuần sau.', 'weekly', $1, 'submitted', '2026-09-01', '2026-09-07'),
     ('Báo cáo tuần 36', 'Hoàn thành wireframe Dashboard, đang chờ feedback.', 'weekly', $2, 'reviewed', '2026-09-01', '2026-09-07')`,
    [empIds['binh@company.vn'], empIds['ha@company.vn']]
  );

  await pool.query(
    `INSERT INTO kpi_evaluations (employee_id, period, criteria, total_score, rating, comments, evaluated_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
    [
      empIds['binh@company.vn'], '2026-Q2',
      JSON.stringify([{ name: 'Chất lượng công việc', weight: 40, score: 8.5 }, { name: 'Đúng deadline', weight: 30, score: 7.5 }, { name: 'Thái độ làm việc', weight: 30, score: 9 }]),
      8.3, 'Tốt', 'Hoàn thành tốt các nhiệm vụ được giao.', empIds['manager@company.vn'],
    ]
  );

  console.log('✓ Database seeded with sample data');
}
