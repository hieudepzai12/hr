// Read-only inventory. No row contents, credentials or connection details are exported.
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';

process.loadEnvFile('.env.local');
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error('Database connection is not configured');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  const { rows: tables } = await client.query(`SELECT c.oid, c.relname AS name,
    pg_total_relation_size(c.oid)::text AS bytes,
    COALESCE(s.n_live_tup,0)::text AS estimated_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
  for (const table of tables) {
    const identifier = '"' + table.name.replaceAll('"', '""') + '"';
    const count = await client.query(`SELECT COUNT(*)::text AS count FROM public.${identifier}`);
    table.rows = count.rows[0].count;
    delete table.oid;
  }
  const { rows: dependencies } = await client.query(`SELECT conrelid::regclass::text AS child,
    confrelid::regclass::text AS parent, conname AS constraint_name
    FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
    ORDER BY parent,child`);
  const { rows: indexes } = await client.query(`SELECT tablename AS table_name,indexname AS name,indexdef AS definition
    FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`);
  await client.query('COMMIT');
  mkdirSync('imports/verification', { recursive: true });
  writeFileSync('imports/verification/database-audit.json', JSON.stringify({ generated_at: new Date().toISOString(), tables, dependencies, indexes }, null, 2));
  console.log(JSON.stringify({ tables: tables.length, inventory: tables.map(({ name, rows, bytes }) => ({ name, rows, bytes })), output: 'imports/verification/database-audit.json' }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Database audit failed:', error.code || 'connection_or_query_error');
  process.exitCode = 1;
} finally { await client.end(); }
