import ExcelJS from 'exceljs';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { normalize, validIsoDate } from '../src/lib/excel-import.js';
import { writeAudit } from '../src/lib/audit.js';

// Explicit source-specific import. Dry run unless --apply is supplied.
process.loadEnvFile('.env.local');
const source = process.env.OTIS_PLAN_FILE;
if (!source) throw new Error('Set OTIS_PLAN_FILE to the reviewed workbook');
const bytes = readFileSync(source);
const digest = createHash('sha256').update(bytes).digest('hex');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, connectionTimeoutMillis: 15000 });
const cellText = cell => {
  if (cell.isMerged && cell.master.address !== cell.address) return '';
  const value = cell.value;
  return String(value?.richText?.map(part => part.text).join('') ?? value?.result ?? value?.text ?? value ?? '').trim();
};
const companyHeadings = new Set(['CHÂU CẨM:', 'TẤN KHỞI', 'TRANG KHANH', 'CHÂU CẨM', 'SEAGIFT',
  'SEAGIFT + TẤN KHỞI', 'Châu Bá Thảo', 'Châu Bá Thảo năm 2026', 'SEAGIFT 2025-2026',
  'Otis', 'Kế toán Otis', 'Đầu tư Otis', 'Tấn Khỏi'].map(normalize));

try {
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='30s'");
  await db.query('SELECT pg_advisory_xact_lock(68451207)');
  const employees = (await db.query(`SELECT e.id,e.full_name,e.department_id,d.name AS department,e.role
    FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.status='active'`)).rows;
  const admin = employees.find(person => person.role === 'admin');
  if (!admin) throw new Error('Admin not found');
  const resolvePerson = (name, section) => {
    const n = normalize(name);
    const exact = employees.filter(person => normalize(person.full_name) === n);
    if (exact.length === 1) return exact[0];
    const matches = employees.filter(person => normalize(person.full_name).endsWith(` ${n}`));
    const inSection = matches.filter(person => normalize(person.department) === normalize(section));
    return inSection.length === 1 ? inSection[0] : matches.length === 1 ? matches[0] : null;
  };
  const pending = [], prepared = [], duplicates = [], headings = [];
  const seen = new Map();
  const existing = (await db.query('SELECT id,title,assignee_id,description,source_import_key FROM tasks')).rows;
  for (const sheet of workbook.worksheets) {
    let section = '', group = '', company = '', assigneeLabel = '', companyNotes = '';
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < 6) return;
      const values = Array.from({ length: 7 }, (_, index) => cellText(row.getCell(index + 1)));
      const [who, title, progress, blockers, solution, leaderOpinion, kpi] = values;
      if (!title) return;
      const fullSection = /^PHÒNG\s+/iu.test(title);
      if (fullSection) { section = title; group = company = assigneeLabel = companyNotes = ''; headings.push(rowNumber); return; }
      if (/^[A-D]$/.test(who)) { group = title; company = assigneeLabel = companyNotes = ''; headings.push(rowNumber); return; }
      if (/^\d+$/.test(who)) {
        assigneeLabel = title; company = ''; companyNotes = '';
        if (progress) {
          // This source's staff heading carries a merged general summary.
          prepared.push({ sheet: sheet.name, row: rowNumber, title: progress.split('\n')[0].replace(/:$/, ''),
            description: progress, assigneeLabel, section, group, company: '', progress_text: '', blockers: '', solution: '', leader_opinion: '', kpi: '', source: values });
        }
        headings.push(rowNumber); return;
      }
      if (companyHeadings.has(normalize(title))) {
        company = title; companyNotes = [blockers, solution, leaderOpinion].filter(Boolean).join('\n');
        if (who) assigneeLabel = who;
        else if (normalize(section).includes('tai chinh')) assigneeLabel = '';
        headings.push(rowNumber); return;
      }
      if (who) assigneeLabel = who;
      // Parent heading groups the two explicitly assigned Tuấn sub-items.
      if (rowNumber === 28 && /^1\. Xem xét cập nhật tiến độ/.test(title)) { group = `${group} / ${title}`; headings.push(rowNumber); return; }
      let progressText = progress;
      const cell = row.getCell(3);
      if (typeof cell.value === 'number' && cell.value > 0 && cell.value <= 1) progressText = `${cell.value * 100}%`;
      prepared.push({ sheet: sheet.name, row: rowNumber, title, description: companyNotes,
        assigneeLabel, section, group, company, progress_text: progressText, blockers, solution,
        leader_opinion: leaderOpinion, kpi, source: values });
    });
  }
  const accepted = [];
  for (const row of prepared) {
    const labels = row.assigneeLabel.split('+').map(value => value.trim()).filter(Boolean);
    const people = labels.map(label => resolvePerson(label, row.section));
    if (!labels.length || people.some(person => !person) || /bộ phận/iu.test(row.assigneeLabel)) {
      pending.push({ row: row.row, title: row.title, assignee: row.assigneeLabel || '(không ghi)', reason: 'Chưa xác định được cá nhân trong hệ thống' }); continue;
    }
    row.assignee_id = people[0].id;
    row.department_id = people[0].department_id;
    row.collaborators = [...new Set(people.slice(1).map(person => person.id))].filter(id => id !== row.assignee_id);
    row.employee_name = people[0].full_name;
    row.source_key = `${digest}:${row.sheet}:${row.row}`;
    row.description = [row.description, row.section, row.group, row.company && `Khách hàng / đơn vị theo file: ${row.company}`,
      row.kpi && `Đánh giá KPI theo file: ${row.kpi}`].filter(Boolean).join('\n');
    row.due_date = null;
    const deadline = /deadline[^\n]*?(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/iu.exec(row.progress_text);
    if (deadline) {
      const date = `${deadline[3]}-${deadline[2].padStart(2, '0')}-${deadline[1].padStart(2, '0')}`;
      if (!validIsoDate(date)) throw new Error(`Invalid deadline at row ${row.row}`);
      row.due_date = date;
    }
    row.status = /^(đã hoàn thành|đã hoàn thiện|hoàn thành|100%)$/iu.test(row.progress_text) || /^(đã hoàn thành)$/iu.test(row.kpi) ? 'review' : row.progress_text ? 'in_progress' : 'todo';
    if (row.title.length > 500 || [row.description,row.progress_text,row.blockers,row.solution,row.leader_opinion].some(value => value.length > 10000)) throw new Error(`Content too long at row ${row.row}`);
    const identity = JSON.stringify([row.assignee_id,normalize(row.title),normalize(row.company),normalize(row.group)]);
    const prior = seen.get(identity);
    if (prior) {
      for (const field of ['progress_text','blockers','solution','leader_opinion']) {
        if (!prior[field]) prior[field] = row[field];
        else if (row[field] && prior[field] !== row[field]) throw new Error(`Conflicting repeated rows ${prior.row},${row.row}`);
      }
      duplicates.push({ row: row.row, kept_row: prior.row }); continue;
    }
    if (existing.some(task => task.source_import_key === row.source_key)) { duplicates.push({ row: row.row, existing: true }); continue; }
    seen.set(identity,row); accepted.push(row);
  }
  const summary = { source_sha256: digest, candidates: prepared.length, ready: accepted.length, pending, duplicates,
    by_employee: [...new Set(accepted.map(row => row.employee_name))].map(name => ({ name, tasks: accepted.filter(row => row.employee_name === name).length })),
    deadlines: accepted.filter(row => row.due_date).map(({row,due_date}) => ({row,due_date})) };
  mkdirSync('.next-verify/import-review', { recursive: true });
  writeFileSync('.next-verify/import-review/october-plan.json', JSON.stringify({ summary, tasks: accepted },null,2));
  if (process.argv.includes('--apply')) {
    if (!new URL(process.env.DATABASE_URL || process.env.POSTGRES_URL).hostname.endsWith('.neon.tech')) throw new Error('Unexpected target');
    const expected = Number(process.env.OTIS_EXPECTED_TASK_COUNT);
    if (!Number.isInteger(expected) || accepted.length !== expected) throw new Error('Reviewed task count mismatch');
    const ids = [];
    for (const row of accepted) {
      const inserted = await db.query(`INSERT INTO tasks
        (title,description,assignee_id,created_by,department_id,status,progress_text,blockers,proposed_solution,leader_opinion,due_date,source_import_key,source_import_row)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
      [row.title,row.description,row.assignee_id,admin.id,row.department_id,row.status,row.progress_text,row.blockers,row.solution,row.leader_opinion,row.due_date,row.source_key,
        JSON.stringify({sheet:row.sheet,row:row.row,values:row.source})]);
      for (const employeeId of row.collaborators) await db.query('INSERT INTO task_collaborators(task_id,employee_id) VALUES ($1,$2)',[inserted.rows[0].id,employeeId]);
      await writeAudit(db,{entityType:'task',entityId:inserted.rows[0].id,actorId:admin.id,action:'import',after:inserted.rows[0],reason:`Workbook ${digest.slice(0,12)} ${row.sheet}!${row.row}`});
      ids.push(inserted.rows[0].id);
    }
    const verified = (await db.query('SELECT count(*)::int AS count FROM tasks WHERE id=ANY($1::int[])',[ids])).rows[0].count;
    if (verified !== accepted.length) throw new Error('Inserted count mismatch');
    await db.query('COMMIT');
    summary.imported = verified;
  } else await db.query('ROLLBACK');
  console.log(JSON.stringify(summary));
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Import stopped; rolled back:', error.code || error.message); process.exitCode = 1;
} finally { await db.end(); }
