// Explicit maintenance only. No application runtime imports this script.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const identifier = value => '"' + value.replaceAll('"', '""') + '"';
const tableName = value => 'public.' + identifier(value);
const employeeFields = ['employee_id','assignee_id','manager_id','owner_id','actor_id','created_by','reviewed_by','accepted_by','evaluated_by','uploaded_by','updated_by','deleted_by'];

export function pgEnvironment(connectionString) {
  const url = new URL(connectionString);
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: '15',
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
    PGCHANNELBINDING: url.searchParams.get('channel_binding') || 'prefer',
  };
}

export function backupDatabase(connectionString, output, snapshot) {
  const result = spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe', [
    '--format=custom', '--schema=public', '--no-owner', '--no-acl', '--file', output,
    ...(snapshot ? ['--snapshot', snapshot] : []),
  ], { env: pgEnvironment(connectionString), encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.status !== 0) throw new Error('Database backup failed; no IDs were changed.');
}

export async function renumberEmployeeIds(client, { backup } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='45s'");
    // The dump uses this transaction's snapshot, before taking exclusive locks.
    if (backup) await backup((await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id);
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename);
    await client.query(`LOCK TABLE ${tables.map(tableName).join(',')} IN ACCESS EXCLUSIVE MODE`);
    const employees = (await client.query('SELECT id,token_version FROM employees ORDER BY id')).rows;
    if (!employees.length) throw new Error('No employees to renumber.');
    const maxId = employees.at(-1).id;
    const offset = maxId + employees.length + 1;
    const sessionVersion = Math.max(...employees.map(row => row.token_version)) + 1;
    if (offset + employees.length > 2147483647 || sessionVersion > 2147483647) throw new Error('Integer range exceeded.');
    const mapping = employees.map((row,index) => ({ old_id: row.id, new_id: index+1, temp_id: offset+index+1 }));
    const changed = mapping.filter(row => row.old_id !== row.new_id).length;
    if (!changed) { await client.query('ROLLBACK'); return { count: mapping.length, changed: 0, mapping }; }
    await client.query('CREATE TEMP TABLE employee_id_map(old_id int PRIMARY KEY,new_id int UNIQUE,temp_id int UNIQUE) ON COMMIT DROP');
    await client.query('INSERT INTO employee_id_map SELECT * FROM jsonb_to_recordset($1::jsonb) AS m(old_id int,new_id int,temp_id int)', [JSON.stringify(mapping)]);

    const constraints = (await client.query(`SELECT c.conname,cl.relname AS table_name,c.condeferrable,c.condeferred,
      a.attname AS column_name,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      WHERE c.contype='f' AND c.confrelid='public.employees'::regclass
      AND cardinality(c.conkey)=1 AND cardinality(c.confkey)=1 ORDER BY cl.relname,c.conname`)).rows;
    const allForeignKeys = Number((await client.query("SELECT COUNT(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.employees'::regclass")).rows[0].count);
    if (constraints.length !== allForeignKeys || constraints.some(row => !tables.includes(row.table_name) || !employeeFields.includes(row.column_name))) throw new Error('Unrecognized employee foreign key; stopped before modifications.');

    // Rewrite only semantic employee references. SQL JSONB preserves large money
    // numbers exactly; importing snapshots into JS would risk numeric rounding.
    await client.query(`CREATE FUNCTION pg_temp.employee_remap(value jsonb, field text DEFAULT '', employee_root boolean DEFAULT false)
      RETURNS jsonb LANGUAGE plpgsql AS $fn$
      DECLARE kind text:=jsonb_typeof(value); result jsonb; k text; v jsonb; next_field text; next_root boolean; mapped int;
      BEGIN
        IF kind='object' THEN
          result:='{}'::jsonb;
          FOR k,v IN SELECT * FROM jsonb_each(value) LOOP
            IF k IN ('source_import_row','permissions') THEN result:=result||jsonb_build_object(k,v); CONTINUE; END IF;
            next_field:=CASE WHEN k IN ('before','after') THEN field
              WHEN k='id' AND (employee_root OR field IN ('employee','employees')) THEN 'employee_id'
              WHEN k='entity_id' AND COALESCE(value->>'entity_type',value->>'resource','') IN ('employee','employees','profile','profiles') THEN 'employee_id'
              ELSE k END;
            next_root:=k IN ('changes','snapshot') AND COALESCE(value->>'entity_type',value->>'resource','') IN ('employee','employees','profile','profiles');
            result:=result||jsonb_build_object(k,pg_temp.employee_remap(v,next_field,next_root));
          END LOOP;
          RETURN result;
        ELSIF kind='array' THEN
          SELECT COALESCE(jsonb_agg(pg_temp.employee_remap(item,CASE WHEN field IN ('collaborator_ids','employee_ids') THEN 'employee_id' ELSE field END,false) ORDER BY ord),'[]'::jsonb)
          INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS a(item,ord);
          RETURN result;
        ELSIF kind IN ('number','string') AND field=ANY($1::text[]) THEN
          SELECT new_id INTO mapped FROM employee_id_map WHERE old_id::text=value#>>'{}';
          IF FOUND THEN RETURN CASE WHEN kind='string' THEN to_jsonb(mapped::text) ELSE to_jsonb(mapped) END; END IF;
        END IF;
        RETURN value;
      END $fn$`.replace('$1::text[]', `ARRAY[${employeeFields.map(field=>`'${field}'`).join(',')}]::text[]`));

    const digest = async (table, expected) => {
      let expression = expected ? `pg_temp.employee_remap(to_jsonb(t),'',${table==='employees'})` : 'to_jsonb(t)';
      if (expected && table === 'employees') expression = `jsonb_set(${expression},'{token_version}',to_jsonb(${sessionVersion}::int))`;
      return (await client.query(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(record::text,E'\n' ORDER BY record::text),'')) AS digest FROM (SELECT ${expression} AS record FROM ${tableName(table)} t) q`)).rows[0];
    };
    const expected = new Map();
    for (const table of tables) expected.set(table, await digest(table, true));
    for (const constraint of constraints) await client.query(`ALTER TABLE ${tableName(constraint.table_name)} ALTER CONSTRAINT ${identifier(constraint.conname)} DEFERRABLE INITIALLY DEFERRED`);
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const columns = new Map([['employees',new Set(['id'])]]);
    for (const constraint of constraints) {
      if (!columns.has(constraint.table_name)) columns.set(constraint.table_name,new Set());
      columns.get(constraint.table_name).add(constraint.column_name);
    }
    for (const [from,to] of [['old_id','temp_id'],['temp_id','new_id']]) {
      for (const [table,fields] of columns) {
        const assignments = [...fields].map(field => `${identifier(field)}=COALESCE((SELECT ${to} FROM employee_id_map m WHERE m.${from}=t.${identifier(field)}),t.${identifier(field)})`);
        const where = [...fields].map(field => `t.${identifier(field)} IN (SELECT ${from} FROM employee_id_map)`).join(' OR ');
        await client.query(`UPDATE ${tableName(table)} t SET ${assignments.join(',')} WHERE ${where}`);
      }
    }
    const jsonColumns = (await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='jsonb' AND column_name NOT IN ('permissions','source_import_row') ORDER BY table_name,column_name")).rows;
    for (const {table_name:table,column_name:column} of jsonColumns) {
      // Transform the containing object to preserve employee audit root context.
      await client.query(`UPDATE ${tableName(table)} t SET ${identifier(column)}=pg_temp.employee_remap(jsonb_build_object(
        'entity_type',to_jsonb(t)->'entity_type','resource',to_jsonb(t)->'resource',
        '${column}',t.${identifier(column)}))->'${column}' WHERE t.${identifier(column)} IS NOT NULL`);
    }
    await client.query("UPDATE audit_logs a SET entity_id=m.new_id::text FROM employee_id_map m WHERE a.entity_type IN ('employee','employees','profile','profiles') AND a.entity_id=m.old_id::text");
    await client.query("UPDATE attachments a SET entity_id=m.new_id FROM employee_id_map m WHERE a.entity_type IN ('employee','employees','profile','profiles') AND a.entity_id=m.old_id");
    await client.query("UPDATE governance_versions a SET entity_id=m.new_id FROM employee_id_map m WHERE a.resource IN ('employee','employees','profile','profiles') AND a.entity_id=m.old_id");
    await client.query('UPDATE employees SET token_version=$1',[sessionVersion]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    for (const constraint of constraints) {
      const definition = constraint.condeferrable ? `DEFERRABLE INITIALLY ${constraint.condeferred?'DEFERRED':'IMMEDIATE'}` : 'NOT DEFERRABLE';
      await client.query(`ALTER TABLE ${tableName(constraint.table_name)} ALTER CONSTRAINT ${identifier(constraint.conname)} ${definition}`);
    }
    for (const table of tables) {
      const actual = await digest(table, false);
      if (JSON.stringify(actual) !== JSON.stringify(expected.get(table))) throw new Error(`Verification mismatch in ${table}; all changes rolled back.`);
    }
    const ids = (await client.query('SELECT id FROM employees ORDER BY id')).rows.map(row=>row.id);
    if (ids.some((id,index)=>id!==index+1)) throw new Error('Employee IDs are not contiguous.');
    // ALTER SEQUENCE RESTART is transactional, unlike setval().
    const sequence = (await client.query("SELECT pg_get_serial_sequence('public.employees','id') AS name")).rows[0].name;
    const sequenceParts = sequence.split('.').map(part=>identifier(part.replaceAll('"',''))).join('.');
    await client.query(`ALTER SEQUENCE ${sequenceParts} RESTART WITH ${ids.length+1}`);
    await client.query('COMMIT');
    return {count: ids.length, changed, foreignKeys: constraints.length, verifiedTables: tables.length, nextId: ids.length+1, mapping};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required.');
  const envIndex = process.argv.indexOf('--env-file');
  process.loadEnvFile(envIndex>=0 ? process.argv[envIndex+1] : '.env.local');
  const connection = process.env.DATABASE_URL;
  const local = ['localhost','127.0.0.1','[::1]'].includes(new URL(connection).hostname);
  if (!local && !process.argv.includes('--allow-remote')) throw new Error('Remote database requires explicit --allow-remote.');
  const directory = `imports/private/employee-id-renumber-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
  mkdirSync(directory,{recursive:true});
  const client = new pg.Client({connectionString:connection,connectionTimeoutMillis:15000});
  try {
    await client.connect();
    const result = await renumberEmployeeIds(client,{backup:snapshot=>backupDatabase(connection,`${directory}/database.dump`,snapshot)});
    writeFileSync(`${directory}/id-map.json`,JSON.stringify(result,null,2));
    const {mapping: _mapping,...summary} = result;
    console.log(JSON.stringify({...summary,backup:directory}));
  } finally {await client.end();}
}
