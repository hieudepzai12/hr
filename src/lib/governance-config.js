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
  positions: { title: 'Chức danh & Nhiệm vụ', path: '/chuc-danh', table: 'positions', module: 'positions',
    description: 'Vị trí tổ chức độc lập với vai trò đăng nhập. Giữ dữ liệu chưa thống nhất ở trạng thái cần xác minh.',
    fields: [text('code', 'Mã vị trí', true), text('name', 'Tên chức danh', true), ref('department_id', 'Phòng ban', 'departments', true), ref('parent_id', 'Vị trí quản lý', 'positions'), notes('responsibilities', 'Chức năng và nhiệm vụ', true), notes('requirements', 'Yêu cầu / quyền hạn'), verification, source] },
  assignments: { title: 'Phân công & Biến động nhân sự', path: '/bien-dong-nhan-su', table: 'position_assignments', module: 'positions',
    description: 'Lưu lịch sử đảm nhiệm vị trí theo ngày hiệu lực; không thay đổi tài khoản đăng nhập.',
    fields: [text('name', 'Nội dung phân công', true), ref('position_id', 'Vị trí', 'positions', true), ref('employee_id', 'Nhân viên', 'employees', true), date('start_date', 'Từ ngày', true), date('end_date', 'Đến ngày'), notes('notes', 'Lý do / ghi chú', true)] },
  staffing: { title: 'Định biên nhân sự', path: '/dinh-bien', table: 'staffing_plans', module: 'staffing', workflow: true,
    description: 'Định biên theo vị trí và tháng. Nhân sự thực tế được tính từ phân công còn hiệu lực.',
    fields: [text('name', 'Tên kế hoạch', true), ref('position_id', 'Vị trí', 'positions', true), { key: 'month', label: 'Tháng', type: 'month', required: true }, number('target_count', 'Số người định biên', true), notes('notes', 'Căn cứ / ghi chú', true), source] },
  recruitment: { title: 'Nhu cầu tuyển dụng', path: '/tuyen-dung', table: 'recruitment_requests', module: 'recruitment', workflow: true,
    description: 'Theo dõi nhu cầu tuyển theo vị trí; chỉ ghi nhận đã tuyển khi có nhân sự thực tế.',
    fields: [text('name', 'Tên nhu cầu', true), ref('position_id', 'Vị trí', 'positions', true), number('quantity', 'Số lượng cần tuyển', true), number('hired_count', 'Số lượng đã tuyển'), date('target_date', 'Ngày cần nhân sự'), choice('hiring_status', 'Tình trạng tuyển', { pending: 'Chưa tuyển', recruiting: 'Đang tuyển', filled: 'Đã đủ', cancelled: 'Tạm dừng' }), notes('notes', 'Lý do và yêu cầu', true)] },
  projects: { title: 'Dự án', path: '/du-an', table: 'projects', module: 'projects',
    description: 'Dự án dùng chung danh mục khách hàng và liên kết với công việc hiện có.',
    fields: [text('code', 'Mã dự án', true), text('name', 'Tên dự án', true), ref('customer_id', 'Khách hàng', 'customers'), ref('department_id', 'Phòng phụ trách', 'departments', true), ref('owner_id', 'Người phụ trách', 'employees', true), date('start_date', 'Ngày bắt đầu'), date('end_date', 'Hạn dự án'), choice('status', 'Trạng thái', { planned: 'Chưa bắt đầu', active: 'Đang thực hiện', on_hold: 'Tạm dừng', completed: 'Hoàn thành' }), notes('notes', 'Mô tả'), verification, source] },
  members: { title: 'Nhân sự dự án', path: '/nhan-su-du-an', table: 'project_members', module: 'projects',
    description: 'Phân công nhân sự tham gia dự án và vai trò công việc, độc lập với quyền hệ thống.',
    fields: [text('name', 'Vai trò trong dự án', true), ref('project_id', 'Dự án', 'projects', true), ref('employee_id', 'Nhân viên', 'employees', true), number('allocation', 'Tỷ lệ tham gia (%)'), date('start_date', 'Từ ngày'), date('end_date', 'Đến ngày'), notes('notes', 'Ghi chú')] },
  policies: { title: 'Chính sách thưởng', path: '/chinh-sach-thuong', table: 'bonus_policies', module: 'bonuses', workflow: true,
    description: 'Chỉ dùng chính sách đã được duyệt. Không tự suy ra tỷ lệ từ tài liệu tổ chức.',
    fields: [text('code', 'Mã chính sách', true), text('name', 'Tên chính sách', true), choice('calculation', 'Cách tính', { manual: 'Số tiền được đề xuất', percentage: 'Tỷ lệ trên giá trị làm căn cứ' }), number('rate', 'Tỷ lệ thưởng (%)'), notes('conditions', 'Điều kiện và căn cứ áp dụng', true), date('start_date', 'Hiệu lực từ'), date('end_date', 'Hiệu lực đến'), source] },
  awards: { title: 'Thưởng dự án', path: '/thuong-du-an', table: 'bonus_awards', module: 'bonuses', workflow: true,
    description: 'Đề xuất, kiểm tra căn cứ và duyệt tiền thưởng. Đây là phê duyệt thưởng, chưa phải xác nhận chi tiền.',
    fields: [text('name', 'Nội dung thưởng', true), ref('project_id', 'Dự án', 'projects', true), ref('policy_id', 'Chính sách đã duyệt', 'policies', true), ref('employee_id', 'Người nhận', 'employees', true), number('basis_amount', 'Giá trị làm căn cứ (VND)'), number('amount', 'Tiền đề xuất (VND)'), notes('notes', 'Căn cứ đánh giá / ghi chú', true)] },
  budgets: { title: 'Ngân sách tiền lương', path: '/ngan-sach-luong', table: 'salary_budgets', module: 'budgets', workflow: true,
    description: 'Dự toán theo phòng, vị trí và tháng; không phải bảng lương thực nhận. Mỗi thành phần là chi phí cho một người/tháng.',
    fields: [text('name', 'Tên dự toán', true), ref('position_id', 'Vị trí', 'positions', true), { key: 'month', label: 'Tháng', type: 'month', required: true }, number('headcount', 'Số nhân sự', true), number('base_salary', 'Lương dự toán/người (VND)', true), number('allowance', 'Phụ cấp/người (VND)'), number('employer_cost', 'Chi phí doanh nghiệp/người (VND)'), notes('notes', 'Căn cứ dự toán', true), source] },
  folders: { title: 'Sơ đồ dữ liệu', path: '/so-do-luu-tru', table: 'document_folders', module: 'documents',
    description: 'Cây thư mục và đơn vị phụ trách; quyền truy cập kho bên ngoài do kho lưu trữ kiểm soát thêm.',
    fields: [text('name', 'Tên thư mục', true), ref('department_id', 'Phòng phụ trách', 'departments', true), ref('owner_id', 'Người phụ trách', 'employees', true), ref('parent_id', 'Thư mục cha', 'folders'), notes('notes', 'Mô tả / quy tắc lưu trữ')] },
  documents: { title: 'Tài liệu & Hướng dẫn truy cập', path: '/tai-lieu', table: 'internal_documents', module: 'documents',
    description: 'Lưu danh mục và đường dẫn HTTPS. Không lưu mật khẩu, khóa truy cập hoặc chuỗi kết nối vào nội dung.',
    fields: [text('name', 'Tên tài liệu', true), ref('folder_id', 'Thư mục', 'folders', true), text('url', 'Đường dẫn HTTPS', true), notes('instructions', 'Hướng dẫn truy cập', true), verification, source] },
};
export const NEW_MODULES = [['positions', 'Chức danh & Phân công'], ['staffing', 'Định biên'], ['recruitment', 'Tuyển dụng'], ['projects', 'Dự án'], ['bonuses', 'Chính sách & Thưởng'], ['budgets', 'Ngân sách tiền lương'], ['documents', 'Tài liệu nội bộ'], ['insights', 'Báo cáo quản trị'], ['activity', 'Nhật ký hoạt động']];
export function moduleActions(module) {
  if(module==='profiles')return ['view'];
  if(['insights','activity'].includes(module))return ['view'];
  if(['positions','projects','documents'].includes(module))return ['view','create','edit','delete','restore'];
  if(['staffing','recruitment','bonuses','budgets'].includes(module))return ['view','create','edit','approve','delete','restore'];
  return ['view','create','edit','approve','delete','restore','print'];
}
export const vnd = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(BigInt(String(value || 0).split('.')[0]));
