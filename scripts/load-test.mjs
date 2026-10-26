// Runs only against a newly created disposable database. Never seeds the source database.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const remote = process.argv.includes('--neon');
const envArg = process.argv.indexOf('--env-file');
const envFile = envArg >= 0 ? process.argv[envArg + 1] : (remote ? '.env.local' : '.env.local.before-neon-20261021162923');
const source = parseEnv(readFileSync(envFile, 'utf8'));
const sourceUrl = new URL(source.DATABASE_URL);
if (remote ? !sourceUrl.hostname.endsWith('.neon.tech') : !['localhost', '127.0.0.1'].includes(sourceUrl.hostname)) throw new Error('Unexpected database host');
const database = `otis_load_${Date.now()}_${randomBytes(3).toString('hex')}`;
const connection = new URL(sourceUrl);
connection.pathname = `/${database}`;
const config = (url) => ({ connectionString: String(url), ssl: url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? false : { rejectUnauthorized: true } });
const admin = new pg.Client(config(sourceUrl));
let db, server, created = false;
let serverOutput = '';
const password = randomBytes(24).toString('hex');
const env = { ...process.env, DATABASE_URL: String(connection), NODE_ENV: 'production', JWT_SECRET: randomBytes(48).toString('hex'), INITIAL_ADMIN_EMAIL: 'load-admin@example.invalid', INITIAL_ADMIN_PASSWORD: password, OTIS_DIST_DIR: '.next-verify' };
const run = (args, overrides = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { env: { ...env, ...overrides }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Setup failed (${code}): ${output.replace(/postgres(?:ql)?:\/\/\S+/gi, '[hidden]')}`)));
});
const phases = [];
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  console.log('Created isolated test database');
  await run(['scripts/migrate.mjs', ...(remote ? ['--allow-remote'] : [])]);
  db = new pg.Client(config(connection));
  await db.connect();
  const hash = await bcrypt.hash(password, 10);
  await db.query("INSERT INTO departments(name) SELECT 'Load department ' || g FROM generate_series(1,5) g");
  const departments = (await db.query('SELECT id FROM departments ORDER BY id LIMIT 5')).rows.map(r => r.id);
  const users = [];
  for (let i = 0; i < 50; i++) {
    const row = (await db.query(`INSERT INTO employees(full_name,email,password_hash,role,department_id,status) VALUES($1,$2,$3,'employee',$4,'active') RETURNING id,email`, [`Test employee ${i + 1}`, `load${i + 1}@example.invalid`, hash, departments[i % 5]])).rows[0];
    row.taskId = (await db.query(`INSERT INTO tasks(title,assignee_id,created_by,department_id,status,progress,due_date) SELECT 'Test task ' || g,$1,$1,$2,'in_progress',30,'2026-10-26' FROM generate_series(1,40) g RETURNING id`, [row.id, departments[i % 5]])).rows[0].id;
    await db.query(`INSERT INTO reports(title,content,employee_id,department_id,status,type,period_start,period_end) SELECT 'Test report ' || g,repeat('Progress, obstacles and proposed solution. ',25),$1,$2,'submitted','weekly','2026-10-19','2026-10-25' FROM generate_series(1,12) g`, [row.id, departments[i % 5]]);
    users.push(row);
  }
  await db.query(`INSERT INTO task_updates(task_id,employee_id,progress,result,next_step,blockers,solution) SELECT t.id,t.assignee_id,30,'Completed preliminary work','Next step','','' FROM tasks t CROSS JOIN generate_series(1,3)`);
  const fixture = (await db.query(`SELECT (SELECT count(*) FROM employees WHERE role='employee') employees,(SELECT count(*) FROM tasks) tasks,(SELECT count(*) FROM reports) reports,(SELECT count(*) FROM task_updates) updates,pg_database_size(current_database()) bytes`)).rows[0];
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  env.BETTER_AUTH_URL = base;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { serverOutput += data; });
  server.stderr.on('data', data => { serverOutput += data; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const res = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(3000) }); if ([200,401].includes(res.status)) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Test server did not start');
  if (process.argv.includes('--verify-workflow')) {
    if (remote) throw new Error('Workflow verification is local only');
    await run(['scripts/verify-workflow.mjs'], { VERIFY_BASE_URL: base });
    if(process.argv.includes('--verify-migration'))await run(['scripts/verify-governance-migration.mjs']);
    await run(['scripts/verify-governance.mjs', ...(process.argv.includes('--browser-duties')?['--browser-duties']:[]), ...(process.argv.includes('--browser-chart')?['--browser-chart']:[]), ...(process.argv.includes('--browser-tasks')?['--browser-tasks']:[]), ...(process.argv.includes('--browser-menus')?['--browser-menus']:[]), ...(process.argv.includes('--browser-feedback')?['--browser-feedback']:[])], { VERIFY_BASE_URL: base });
    if (process.argv.includes('--verify-menus')) await run(['scripts/verify-menu-links.mjs'], { VERIFY_BASE_URL: base });
    console.log('Workflow verification passed (scope, snapshots, lock, versions, restore, Excel, KPI)');
  }
  let samples = [];
  async function request(user, path, body) {
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(user.cookie ? { Cookie: user.cookie } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
      status = response.status;
      if (path === '/api/auth/login' && response.ok) user.cookie = response.headers.get('set-cookie')?.split(';')[0];
      await response.arrayBuffer();
    } catch { /* Recorded as status 0: network error or timeout. */ }
    samples.push({ path: path.replace(/\/\d+/g, '/:id'), ms: performance.now() - started, status });
  }
  async function phase(name, action) {
    samples = [];
    const started = performance.now();
    await action();
    const seconds = (performance.now() - started) / 1000;
    const summarize = rows => {
      const times = rows.map(r => r.ms).sort((a,b) => a-b);
      const percentile = fraction => Math.round(times[Math.min(times.length - 1, Math.ceil(times.length * fraction) - 1)]);
      return { requests: rows.length, errors: rows.filter(r => r.status < 200 || r.status >= 300).length, p50ms: percentile(.5), p95ms: percentile(.95), maxMs: Math.round(times.at(-1)), statuses: rows.reduce((out,r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}) };
    };
    const result = { name, seconds: +seconds.toFixed(2), ...summarize(samples), endpoints: Object.fromEntries([...new Set(samples.map(r => r.path))].map(path => [path,summarize(samples.filter(r => r.path === path))])) };
    phases.push(result);
    console.log(JSON.stringify(result));
  }
  await phase('50 simultaneous logins', () => Promise.all(users.map(user => request(user, '/api/auth/login', { email: user.email, password }))));
  if (users.some(user => !user.cookie)) throw new Error('Login failed; refusing unauthenticated workload');
  const reads = ['/api/dashboard/stats', '/api/tasks?limit=20&offset=0', '/api/reports?limit=20&offset=0', '/api/tasks/alerts'];
  await phase('10 users opening dashboard', () => Promise.all(users.slice(0,10).map(user => Promise.all(reads.map(path => request(user,path))))));
  await phase('50 users opening dashboard', () => Promise.all(users.map(user => Promise.all(reads.map(path => request(user,path))))));
  await phase('50 users updating work and submitting reports', () => Promise.all(users.map(async user => {
    await request(user, `/api/tasks/${user.taskId}`);
    await request(user, `/api/tasks/${user.taskId}/updates`, { progress: 40, result: 'Load test progress', next_step: 'Continue work', blockers: '', solution: '', submit_for_review: false });
    await request(user, '/api/reports', { title: 'Load test weekly report', content: 'Progress updated during isolated load test.', type: 'weekly', status: 'submitted', period_start: '2026-10-19', period_end: '2026-10-25', task_ids: [user.taskId] });
    await request(user, '/api/reports?limit=20&offset=0');
  })));
  const report = { timestamp: new Date().toISOString(), target: remote ? 'Isolated Neon database, local Next production server' : 'Isolated local PostgreSQL, local Next production server', poolMax: 10, fixture, phases };
  mkdirSync('imports/verification', { recursive: true });
  writeFileSync(`imports/verification/load-test-${remote ? 'neon' : 'local'}.json`, JSON.stringify(report,null,2));
  if (phases.some(phase => phase.errors > 0)) process.exitCode = 1;
  console.log('Results saved; removing disposable database');
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => { server.once('exit',resolve); setTimeout(resolve,5000); }); }
  await db?.end().catch(() => {});
  if (created) {
    if (!/^otis_load_\d+_[a-f0-9]{6}$/.test(database) || database === sourceUrl.pathname.slice(1)) throw new Error('Cleanup guard failed');
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    console.log('Disposable database removed');
  }
  await admin.end();
}
