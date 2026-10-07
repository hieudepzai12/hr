const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (!email || !password) throw new Error('Set SMOKE_EMAIL and SMOKE_PASSWORD');

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const sessionHeader = login.headers.getSetCookie().find(value => value.startsWith('hr_session='));
const cookie = sessionHeader?.split(';')[0];
if (!cookie) throw new Error('Login did not set an HttpOnly session cookie');
if (!/httponly/i.test(sessionHeader) || !/samesite=lax/i.test(sessionHeader)) throw new Error('Session cookie is missing security attributes');

for (const path of ['/api/employees', '/api/tasks', '/api/reports', '/api/kpi']) {
  const response = await fetch(`${base}${path}?limit=2&offset=0`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.items) || data.items.length > 2 || typeof data.hasMore !== 'boolean') {
    throw new Error(`${path} returned an invalid page`);
  }
  if (path === '/api/reports' && data.items.some(item => 'content' in item)) {
    throw new Error('Report list returned full content');
  }
  if (path === '/api/reports' && data.items.length) {
    const detail = await fetch(`${base}/api/reports/${data.items[0].id}`, { headers: { cookie } });
    if (!detail.ok || typeof (await detail.json()).content !== 'string') throw new Error('Report detail did not return full content');
  }
  console.log(`${path}: ${data.items.length} items, hasMore=${data.hasMore}`);
}

const invalidPage = await fetch(`${base}/api/employees?limit=101`, { headers: { cookie } });
if (invalidPage.status !== 400) throw new Error('Invalid pagination was accepted');

const dashboard = await fetch(`${base}/api/dashboard/stats`, { headers: { cookie } });
if (!dashboard.ok) throw new Error(`Dashboard failed: ${dashboard.status}`);
console.log('Dashboard: OK');
