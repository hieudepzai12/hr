import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public', 'mau-import-cong-viec.xlsx');
const workbook = new ExcelJS.Workbook();
workbook.creator = 'HR OTIS';
workbook.subject = 'Mẫu nhập công việc';
const sheet = workbook.addWorksheet('Nhap cong viec', {
  views: [{ state: 'frozen', ySplit: 1 }],
});

const columns = [
  ['Công việc', 38, 'Bắt buộc. Mỗi dòng là một công việc; tối đa 500 ký tự.'],
  ['Người thực hiện', 27, 'Bắt buộc. Ghi đúng họ tên nhân viên. Nếu có người phối hợp: Tên chính + Tên phối hợp.'],
  ['Phòng ban', 24, 'Ghi đúng tên phòng ban. Nếu để trống, hệ thống lấy phòng của người thực hiện.'],
  ['Khách hàng', 29, 'Tên hoặc mã khách hàng đang hoạt động. Có thể để trống.'],
  ['Hạn chót', 18, 'Nhập ngày dưới dạng dd/mm/yyyy, ví dụ 15/10/2026.'],
  ['Tiến độ', 16, 'Số nguyên từ 0 đến 100. Không nhập 0,5 để biểu thị 50%.'],
  ['Kết quả đã làm', 34, 'Nội dung đã hoàn thành đến thời điểm nhập. Có thể để trống.'],
  ['Vướng mắc', 30, 'Có thể để trống.'],
  ['Giải pháp', 30, 'Đề xuất giải pháp. Có thể để trống.'],
  ['KPI', 22, 'Có thể để trống. Nhập Đã hoàn thành nếu cần gửi quản lý nghiệm thu.'],
];

sheet.columns = columns.map(([header, width]) => ({ header, width }));
sheet.autoFilter = { from: 'A1', to: 'J1' };
sheet.getRow(1).height = 34;
sheet.getRow(1).eachCell((cell, columnNumber) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17375F' } };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FF8FA8C6' } } };
  cell.note = columns[columnNumber - 1][2];
});
sheet.getColumn(5).numFmt = '@';
sheet.getColumn(6).numFmt = '0';
sheet.dataValidations.add('F2:F501', {
  type: 'whole', operator: 'between', formulae: [0, 100], allowBlank: true,
  showErrorMessage: true, errorTitle: 'Tiến độ không hợp lệ', error: 'Nhập số nguyên từ 0 đến 100.',
});

await mkdir(dirname(output), { recursive: true });
await workbook.xlsx.writeFile(output);
process.stdout.write(`Đã tạo ${output}\n`);
