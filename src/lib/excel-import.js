import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';

export const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

const HEADERS = {
  title: ['cong viec', 'noi dung cong viec', 'ten cong viec', 'nhiem vu'],
  assignee: ['nguoi thuc hien', 'nguoi phu trach', 'phu trach chinh', 'nhan vien'],
  customer: ['khach hang', 'ten khach hang', 'ma khach hang'],
  department: ['phong ban', 'bo phan', 'don vi'],
  business_group: ['nhom nghiep vu', 'nhom cong viec'],
  data_period: ['ky du lieu', 'ky du lieu xu ly', 'thang du lieu'],
  due_date: ['han chot', 'deadline', 'han hoan thanh', 'ngay den han'],
  progress: ['tien do', 'phan tram hoan thanh', 'hoan thanh %'],
  result: ['ket qua', 'ket qua da lam', 'da lam'],
  blockers: ['vuong mac', 'kho khan'],
  solution: ['giai phap', 'de xuat giai phap'],
  kpi: ['kpi', 'danh gia kpi'],
};

function cellValue(cell) {
  const value = cell?.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('result' in value) return String(value.result ?? '');
    if ('text' in value) return String(value.text ?? '');
  }
  return String(value ?? '').trim();
}

export function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function dateValue(value) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (iso) return validIsoDate(value) ? value : null;
  const vn = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(value);
  if (vn) {
    const converted = `${vn[3]}-${vn[2].padStart(2, '0')}-${vn[1].padStart(2, '0')}`;
    return validIsoDate(converted) ? converted : null;
  }
  const number = Number(value);
  if (Number.isInteger(number) && number > 30000 && number < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + number * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

function headerMap(values) {
  const found = {};
  values.forEach((value, index) => {
    const heading = normalize(value);
    for (const [key, aliases] of Object.entries(HEADERS)) {
      if (!found[key] && aliases.some((alias) => heading === alias || heading.includes(alias))) found[key] = index + 1;
    }
  });
  return found.title ? found : null;
}

export async function parseExcelTasks(buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new Error('File Excel tối đa 5 MB');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const digest = createHash('sha256').update(buffer).digest('hex');
  const rows = [];
  for (const sheet of workbook.worksheets) {
    let columns = null;
    let previousAssignee = '';
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = Array.from({ length: Math.min(row.cellCount, 30) }, (_, index) => cellValue(row.getCell(index + 1)));
      if (!columns) { columns = headerMap(values); return; }
      const freshHeader = headerMap(values);
      if (freshHeader) { columns = freshHeader; previousAssignee = ''; return; }
      const get = (key) => columns[key] ? cellValue(row.getCell(columns[key])) : '';
      const title = get('title');
      const assignee = get('assignee');
      if (!title) { if (!assignee) previousAssignee = ''; else previousAssignee = assignee; return; }
      if (rows.length >= 500) throw new Error('Chỉ nhập tối đa 500 công việc mỗi file');
      if (assignee) previousAssignee = assignee;
      const progressRaw = get('progress');
      const progressNumber = Number(progressRaw.replace('%', '').replace(',', '.'));
      const fraction = progressRaw && !progressRaw.includes('%') && progressNumber > 0 && progressNumber < 1;
      const kpi = normalize(get('kpi'));
      const completed = kpi.includes('da hoan thanh') || normalize(get('result')).includes('da hoan thanh');
      rows.push({ sheet: sheet.name, row: rowNumber, source_key: `${digest}:${sheet.name}:${rowNumber}`,
        source: values, title, assignee_name: assignee || previousAssignee,
        customer_name: get('customer'), department_name: get('department'), business_group: get('business_group'),
        data_period: get('data_period'), due_date: dateValue(get('due_date')),
        invalid_due_date: Boolean(get('due_date') && !dateValue(get('due_date'))),
        progress: !progressRaw || !Number.isFinite(progressNumber) ? null : fraction ? Math.round(progressNumber * 100) : progressNumber,
        progress_text: progressRaw && !Number.isFinite(progressNumber) ? progressRaw : '',
        confirm_fraction: fraction, result: get('result'), blockers: get('blockers'), solution: get('solution'),
        status: completed ? 'review' : 'todo',
      });
    });
  }
  if (!rows.length) throw new Error('Không tìm thấy dòng công việc hoặc cột Công việc trong file');
  return rows;
}
