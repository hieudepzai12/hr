import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const targetUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!targetUrl) throw new Error('Thiếu cấu hình database');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(targetUrl).hostname) && !process.argv.includes('--allow-remote')) {
  throw new Error('Từ chối migration database ngoài local. Chỉ dùng --allow-remote sau khi sao lưu và được phê duyệt đúng môi trường.');
}
process.env.MIGRATION_MODE = '1';
const { closeDb, migrateSchema } = await import('../src/lib/db.js');

try {
  await migrateSchema();
  console.log('Database migration completed');
} finally {
  await closeDb();
}
