// Shared field definitions are an allowlist, never accept table/column names from requests.
const text = (key, label, required = false) => ({ key, label, type: 'text', required });
const ref = (key, label, resource, required = false) => ({ key, label, type: 'reference', resource, required });
const number = (key, label, required = false) => ({ key, label, type: 'number', required });
const date = (key, label, required = false) => ({ key, label, type: 'date', required });
const notes = (key, label, required = false) => ({ key, label, type: 'textarea', required });
const choice = (key, label, options) => ({ key, label, type: 'select', options });
export const REVIEW_STATES = { draft: 'Bản nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Yêu cầu bổ sung' };
export const VERIFICATION_STATES = { needs_verification: 'Cần xác minh', verified: 'Đã xác minh' };
const verification = choice('verification_status', 'Xác minh dữ liệu', VERIFICATION_STATES);
const source = text('source_reference', 'Nguồn tài liệu / căn cứ');

export const GOVERNANCE = {
  positions: { title: 'Chức vụ', path: '/chuc-danh', table: 'positions', module: 'positions',
    description: 'Mỗi chức vụ gồm hai phần: vai trò, trách nhiệm và nhiệm vụ chính. Nội dung dùng chung cho người giữ chức vụ trong phòng ban.',
    fields: [text('code', 'Mã chức vụ', true), ref('department_id', 'Phòng ban', 'departments', true), text('name', 'Chức vụ', true), ref('parent_id', 'Chức vụ quản lý', 'positions'), notes('role_description', 'Phần 1. Vai trò, trách nhiệm'), notes('responsibilities', 'Phần 2. Nhiệm vụ chính', true), notes('requirements', 'Yêu cầu / quyền hạn bổ sung'), verification, source] },
  assignments: { title: 'Phân công nhiệm vụ', path: '/chuc-danh', table: 'position_assignments', module: 'positions',
    description: 'Giao nhiệm vụ cho từng nhân sự theo dự án. Chọn nhân viên và dự án; chức vụ tự lấy từ hồ sơ. Phân công cũ chưa liên kết dự án vẫn được giữ nguyên.',
    fields: [text('name', 'Tên phân công', true), ref('employee_id', 'Nhân viên', 'employees', true), ref('project_id', 'Dự án', 'projects'), ref('position_id', 'Chức vụ', 'positions', true), date('start_date', 'Từ ngày', true), date('end_date', 'Đến ngày'), notes('notes', 'Nhiệm vụ của nhân sự', true)] },
  staffing: { title: 'Định biên nhân sự', path: '/dinh-bien', table: 'staffing_plans', module: 'staffing', workflow: true,
    description: 'Định biên tổng số người theo phòng ban và tháng, bao gồm người phụ trách và nhân viên. Mỗi phòng ban có một kế hoạch trong mỗi tháng.',
    fields: [text('name', 'Tên kế hoạch định biên', true), ref('department_id', 'Phòng ban', 'departments', true), { key: 'month', label: 'Tháng', type: 'month', required: true }, number('target_count', 'Tổng số người định biên', true), notes('notes', 'Căn cứ / ghi chú', true), source] },
  recruitment: { title: 'Nhu cầu tuyển dụng', path: '/tuyen-dung', table: 'recruitment_requests', module: 'recruitment', workflow: true,
    description: 'Theo dõi nhu cầu tuyển theo vị trí; chỉ ghi nhận đã tuyển khi có nhân sự thực tế.',
    fields: [text('name', 'Tên nhu cầu', true), ref('position_id', 'Vị trí', 'positions', true), number('quantity', 'Số lượng cần tuyển', true), number('hired_count', 'Số lượng đã tuyển'), date('target_date', 'Ngày cần nhân sự'), choice('hiring_status', 'Tình trạng tuyển', { pending: 'Chưa tuyển', recruiting: 'Đang tuyển', filled: 'Đã đủ', cancelled: 'Tạm dừng' }), notes('notes', 'Lý do và yêu cầu', true)] },
  projects: { title: 'Dự án', path: '/du-an', table: 'projects', module: 'projects',
    description: 'Dự án dùng chung danh mục khách hàng và liên kết với công việc hiện có.',
    fields: [text('code', 'Mã dự án', true), text('name', 'Tên dự án', true), ref('customer_id', 'Khách hàng', 'customers'), { key: 'department_ids', label: 'Phòng ban tham gia', type: 'references', resource: 'departments', required: true }, ref('owner_id', 'Người phụ trách (nếu có)', 'employees'), date('start_date', 'Ngày bắt đầu'), date('end_date', 'Hạn dự án'), choice('status', 'Trạng thái', { planned: 'Chưa bắt đầu', active: 'Đang thực hiện', on_hold: 'Tạm dừng', completed: 'Hoàn thành' }), notes('notes', 'Mô tả'), verification, source] },
  members: { title: 'Nhân sự dự án', path: '/nhan-su-du-an', table: 'project_members', module: 'projects',
    description: 'Phân công nhân sự tham gia dự án và vai trò công việc, độc lập với quyền hệ thống.',
    fields: [text('name', 'Vai trò trong dự án', true), ref('project_id', 'Dự án', 'projects', true), ref('employee_id', 'Nhân viên', 'employees', true), number('allocation', 'Tỷ lệ tham gia (%)'), date('start_date', 'Từ ngày'), date('end_date', 'Đến ngày'), notes('notes', 'Ghi chú')] },
  policies: { title: 'Chính sách thưởng', path: '/thuong-du-an', table: 'bonus_policies', module: 'bonuses', workflow: true,
    description: 'Chỉ dùng chính sách đã được duyệt. Không tự suy ra tỷ lệ từ tài liệu tổ chức.',
    fields: [ref('department_id', 'Phòng ban áp dụng', 'departments'), text('code', 'Mã chính sách', true), text('name', 'Tên chính sách', true), choice('calculation', 'Cách tính', { manual: 'Tiền cố định', percentage: 'Phần trăm', combined: 'Tiền cố định + phần trăm' }), number('rate', 'Tỷ lệ thưởng (%)'), notes('conditions', 'Điều kiện và căn cứ áp dụng', true), date('start_date', 'Hiệu lực từ'), date('end_date', 'Hiệu lực đến'), source] },
  awards: { title: 'Thưởng dự án', path: '/thuong-du-an', table: 'bonus_awards', module: 'bonuses', workflow: true,
    description: 'Đề xuất, kiểm tra căn cứ và duyệt tiền thưởng. Đây là phê duyệt thưởng, chưa phải xác nhận chi tiền.',
    fields: [text('name', 'Nội dung thưởng', true), ref('project_id', 'Dự án', 'projects', true), ref('policy_id', 'Chính sách đã duyệt', 'policies', true), ref('department_id', 'Phòng ban nhận thưởng', 'departments'), ref('employee_id', 'Người nhận', 'employees'), { key:'fixed_amount', label:'Tiền cố định (VND)', type:'money' }, { key:'basis_amount', label:'Giá trị làm căn cứ (VND)', type:'money' }, { key:'amount', label:'Tổng thưởng (VND)', type:'money' }, notes('notes', 'Căn cứ đánh giá / ghi chú', true)] },
  budgets: { title: 'Ngân sách tiền lương', path: '/ngan-sach-luong', table: 'salary_budgets', module: 'budgets', workflow: true,
    description: 'Bảng quỹ lương theo tháng. Mỗi dòng là một phòng, nhóm phòng ban; tổng cộng tự tính.',
    fields: [choice('budget_mode', 'Cách nhập', { aggregate: 'Quỹ lương tổng', position: 'Dự toán cũ theo vị trí' }), text('name', 'Bộ phận', true), { key: 'department_ids', label: 'Phòng ban', type: 'references', resource: 'departments' }, { key: 'total_amount', label: 'Quỹ lương (VND)', type: 'money', required: true }, ref('position_id', 'Vị trí', 'positions', true), { key: 'month', label: 'Tháng', type: 'month', required: true }, number('headcount', 'Số lượng'), number('base_salary', 'Lương dự toán/người (VND)', true), number('allowance', 'Phụ cấp/người (VND)'), number('employer_cost', 'Chi phí doanh nghiệp/người (VND)'), notes('notes', 'Ghi chú'), source] },
  folders: { title: 'Sơ đồ dữ liệu', path: '/so-do-luu-tru', table: 'document_folders', module: 'documents',
    description: 'Cây thư mục và đơn vị phụ trách; quyền truy cập kho bên ngoài do kho lưu trữ kiểm soát thêm.',
    fields: [text('name', 'Tên thư mục', true), ref('department_id', 'Phòng phụ trách', 'departments', true), ref('owner_id', 'Người phụ trách', 'employees', true), ref('parent_id', 'Thư mục cha', 'folders'), notes('notes', 'Mô tả / quy tắc lưu trữ')] },
  documents: { title: 'Tài liệu & Hướng dẫn truy cập', path: '/tai-lieu', table: 'internal_documents', module: 'documents',
    description: 'Lưu danh mục và đường dẫn HTTPS. Không lưu mật khẩu, khóa truy cập hoặc chuỗi kết nối vào nội dung.',
    fields: [text('name', 'Tên tài liệu', true), ref('folder_id', 'Thư mục', 'folders', true), text('url', 'Đường dẫn HTTPS', true), notes('instructions', 'Hướng dẫn truy cập', true), verification, source] },
};
export const NEW_MODULES = [['positions', 'Chức vụ & Nhiệm vụ'], ['staffing', 'Định biên'], ['recruitment', 'Tuyển dụng'], ['projects', 'Dự án'], ['bonuses', 'Quản lý thưởng'], ['budgets', 'Ngân sách tiền lương'], ['documents', 'Tài liệu nội bộ'], ['insights', 'Báo cáo quản trị'], ['activity', 'Nhật ký hoạt động']];
export function moduleActions(module) {
  if(module==='profiles')return ['view'];
  if(['insights','activity'].includes(module))return ['view'];
  if(['positions','projects','documents'].includes(module))return ['view','create','edit','delete','restore'];
  if(['staffing','recruitment','bonuses','budgets'].includes(module))return ['view','create','edit','approve','delete','restore'];
  return ['view','create','edit','approve','delete','restore','print'];
}
export const vnd = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(BigInt(String(value || 0).split('.')[0]));
