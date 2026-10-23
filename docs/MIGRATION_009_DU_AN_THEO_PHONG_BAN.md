# Migration 009 — Dự án theo phòng ban

- Cho phép `projects.owner_id` để trống; giữ phòng phụ trách bắt buộc.
- Không thay đổi dữ liệu hoặc khóa ngoại hiện có. Dự án theo quyền bản thân vẫn chỉ được xem khi có người phụ trách khớp tài khoản; không mở rộng phân quyền.
- Form/API cho phép tạo dự án không gán cá nhân.
- Dữ liệu tài liệu và các bản sao lưu nhập liệu ở thư mục `imports/` bị gitignore. Script nhập có dry-run mặc định, khóa giao dịch, audit, phiên bản dự án và mã đầu việc chống trùng.

## Áp dụng

Local: `npm run migrate` với cấu hình database local. Chỉ chạy trên database production khi đã được xác nhận cho đúng môi trường.

Trong lần nhập kế hoạch ngày 23/10/2026, người dùng đã xác nhận áp dụng riêng migration 009 trên Neon; thay đổi và nhập dữ liệu đã chạy cùng một giao dịch. Không cần chạy lại migration này trên Neon.

## Khôi phục

Code cũ vẫn đọc được dự án có `owner_id=NULL`; giao diện cũ còn yêu cầu chọn người khi sửa. Muốn khôi phục ràng buộc `NOT NULL`, phải kiểm tra các dự án chưa có người phụ trách và xác nhận người thật trước; không tự gán Admin. Chỉ sau khi không còn NULL mới chạy `ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL` và đối chiếu sổ migration.

Bản sao trước nhập và manifest ID được lưu trong `imports/verification/work-plan-before-*.json` và `work-plan-manifest-*.json`. Không tự xóa các bản ghi theo manifest nếu đã có báo cáo hoặc phát sinh cập nhật; cần kiểm tra liên kết và bảo toàn lịch sử trước.
