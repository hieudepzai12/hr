import { GOVERNANCE } from './governance-config.js';

export class GovernanceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validId(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647; }
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function safeDocumentUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch { return false; }
}
export function validateGovernanceInput(resource, body) {
  const config = GOVERNANCE[resource];
  if (!config || !body || typeof body !== 'object' || Array.isArray(body)) throw new GovernanceError('Dữ liệu không hợp lệ');
  const fields = {};
  for (const field of config.fields) {
    let value = body[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required || resource === 'assignments' && field.key === 'start_date') throw new GovernanceError(`Cần nhập ${field.label}`);
      fields[field.key] = field.type === 'number' ? 0 : field.type === 'select' ? Object.keys(field.options)[0] : null;
      continue;
    }
    if (field.type === 'reference') {
      if (!validId(value)) throw new GovernanceError(`${field.label} không hợp lệ`);
      value = Number(value);
    } else if (field.type === 'number') {
      const numeric = Number(value);
      if(field.key==='rate'&&!/^\d+(\.\d{1,4})?$/.test(String(value)))throw new GovernanceError('Tỷ lệ dùng tối đa 4 chữ số thập phân');
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 999999999999999 || (field.key !== 'rate' && !Number.isSafeInteger(numeric))) throw new GovernanceError(`${field.label} phải là số không âm hợp lệ`);
      value = numeric;
    } else {
      if (typeof value !== 'string' || value.length > (field.type === 'textarea' ? 20000 : 2000)) throw new GovernanceError(`${field.label} không hợp lệ hoặc quá dài`);
      value = value.trim();
      if (field.required && !value) throw new GovernanceError(`Cần nhập ${field.label}`);
      if (field.type === 'date' && !validDate(value)) throw new GovernanceError(`${field.label} không hợp lệ`);
      if (field.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new GovernanceError('Tháng phải theo định dạng yyyy-mm');
      if (field.type === 'select' && !Object.hasOwn(field.options, value)) throw new GovernanceError(`${field.label} không hợp lệ`);
    }
    fields[field.key] = value;
  }
  if (fields.end_date && fields.start_date && fields.end_date < fields.start_date) throw new GovernanceError('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  if (fields.allocation > 100 || fields.rate > 100) throw new GovernanceError('Tỷ lệ phải từ 0 đến 100');
  if (resource === 'recruitment' && (!fields.quantity || fields.hired_count > fields.quantity)) throw new GovernanceError('Số đã tuyển không được vượt số cần tuyển');
  if (resource === 'documents' && !safeDocumentUrl(fields.url)) throw new GovernanceError('Chỉ chấp nhận đường dẫn HTTPS không chứa tài khoản/mật khẩu');
  if (fields.code) fields.code = fields.code.toLocaleUpperCase('vi');
  if(fields.verification_status==='verified'&&!fields.source_reference)throw new GovernanceError('Cần nguồn tài liệu/căn cứ trước khi đánh dấu đã xác minh');
  return fields;
}
export function budgetTotal(fields) {
  const total = BigInt(fields.headcount) * (BigInt(fields.base_salary) + BigInt(fields.allowance) + BigInt(fields.employer_cost));
  if (total > 999999999999999999n) throw new GovernanceError('Tổng dự toán vượt giới hạn');
  return total.toString();
}
export function awardTotal(policy, fields) {
  if (policy.calculation !== 'percentage') return String(fields.amount);
  const rateUnits = BigInt(Math.round(Number(policy.rate) * 10000));
  return ((BigInt(fields.basis_amount) * rateUnits + 500000n) / 1000000n).toString();
}
export function assertTransition(before, action, actorId, context = {}) {
  if (action === 'submit' && ['draft', 'rejected'].includes(before.status)) return 'submitted';
  if (['approve', 'reject'].includes(action) && before.status === 'submitted') {
    const adminStaffing=context.role==='admin'&&context.resource==='staffing';
    if (Number(before.created_by) === Number(actorId)&&!adminStaffing) throw new GovernanceError('Không được tự duyệt đề xuất của mình', 403);
    return action === 'approve' ? 'approved' : 'rejected';
  }
  if (action === 'reopen' && before.status === 'approved') return 'draft';
  throw new GovernanceError('Trạng thái đã thay đổi hoặc không cho phép thao tác này', 409);
}
