import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.MIGRATION_MODE = '1';
const { closeDb, migrateSchema } = await import('../src/lib/db.js');

try {
  await migrateSchema();
  console.log('Database migration completed');
} finally {
  await closeDb();
}
