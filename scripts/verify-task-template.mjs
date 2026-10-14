import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { parseExcelTasks } from '../src/lib/excel-import.js';

const path = resolve('public/mau-import-cong-viec.xlsx');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await readFile(path));
const sheet = workbook.getWorksheet('Nhap cong viec');
assert.ok(sheet, 'Thiếu sheet nhập dữ liệu');
assert.equal(sheet.getCell('A1').value, 'Công việc');
assert.equal(sheet.getCell('E1').value, 'Hạn chót');
assert.equal(sheet.getCell('F1').value, 'Tiến độ');

sheet.getRow(2).values = [
  'Kiểm tra mẫu import', 'Nguyễn Văn A + Trần Thị B', 'Kế toán', 'KH-001',
  '15/10/2026', 50, 'Đã xử lý', 'Thiếu tài liệu', 'Bổ sung tài liệu', '',
];
const rows = await parseExcelTasks(Buffer.from(await workbook.xlsx.writeBuffer()));
assert.equal(rows.length, 1);
assert.equal(rows[0].title, 'Kiểm tra mẫu import');
assert.equal(rows[0].assignee_name, 'Nguyễn Văn A + Trần Thị B');
assert.equal(rows[0].due_date, '2026-10-15');
assert.equal(rows[0].progress, 50);
assert.equal(rows[0].customer_name, 'KH-001');
process.stdout.write('Mẫu Excel đọc đúng các cột, ngày và tiến độ.\n');
