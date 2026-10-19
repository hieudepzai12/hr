# Profile nhân sự và quyền truy cập

## Xem hồ sơ

Bấm tài khoản ở góc phải → **Thông tin cá nhân → Hồ sơ nhân sự**, chọn **Xem hồ sơ**. Không có menu Profile riêng ở sidebar hoặc nút xem trong danh sách Nhân viên. Tab Thông tin cá nhân vẫn giữ cập nhật ảnh/thông tin tài khoản. Tab Hồ sơ nhân sự chỉ xuất hiện khi có quyền Profile; quyền bản thân/toàn bộ vẫn được kiểm tra ở API. Đường dẫn cũ `/profile-nhan-su` chuyển về `/ho-so`.

Profile gồm thông tin hồ sơ, phòng ban, quản lý trực tiếp, chức danh/nhiệm vụ được phân công còn hiệu lực. Phần nhiệm vụ vẫn tuân thủ quyền Chức danh & Phân công; không tự ghép nội dung theo tên chức vụ.

## Cấp quyền

1. Admin vào **Vai trò và phân quyền**, chọn bộ quyền.
2. Trong **Phạm vi quyền dữ liệu → Profile nhân sự → Xem**, chọn **Bản thân**, **Phòng ban**, **Toàn bộ** hoặc **Không có**.
3. Bấm **Lưu bộ quyền**. Quyền áp dụng cho mọi người mang vai trò đó và được API kiểm tra ở mỗi yêu cầu.
4. Nếu chỉ cấp toàn bộ cho một người: tạo bộ quyền riêng, cấu hình các quyền cần thiết, rồi gán vai trò đó trong hồ sơ Nhân viên. Không đổi bộ quyền chung của tất cả nhân viên nếu chỉ muốn cấp riêng.

Mặc định Quản lý xem phòng ban của mình, các vai trò khác xem bản thân; Admin xem toàn bộ. Vai trò tùy chỉnh mới chưa được cấp quyền. Phạm vi Phòng ban dựa trên phòng ban của tài khoản đăng nhập, không theo giá trị bộ lọc gửi từ trình duyệt. Người chưa có phòng ban không được xem hồ sơ theo phạm vi Phòng ban. Không có lựa chọn một nhân viên bất kỳ. Các bộ quyền đã được Admin cấu hình riêng tiếp tục giữ phạm vi đã lưu; có thể đổi sang Phòng ban tại màn hình phân quyền.

Quyền Profile độc lập với menu Nhân viên. Quyền sửa hồ sơ và quản lý tài khoản vẫn theo cơ chế Nhân viên hiện có; Profile là màn hình chỉ đọc.

## Database

Quyền mới lưu trong JSON phân quyền hiện có, không thêm bảng hồ sơ trùng lặp. Migration **6** đổi `audit_logs.entity_id` sang `TEXT` để ghi được mã vai trò và giữ nguyên ID số dưới dạng chữ. Đã áp dụng trên database local, không áp dụng production.

Sau khi sao lưu và phê duyệt đúng môi trường, migration dùng quy trình hiện có (`npm run migrate`; database ngoài local cần cờ `--allow-remote` theo hướng dẫn triển khai). Không dùng bản code yêu cầu schema 6 với database production chưa cập nhật. Không đổi ngược cột thành số sau khi đã có nhật ký vai trò; rollback database cần bản sao lưu tương ứng.

Kiểm tra local:

```powershell
node scripts/verify-profile-access.mjs
```

Script tạo tài khoản/bộ quyền kiểm thử tạm trên local, kiểm tra bản thân, chặn xem người khác, xem toàn bộ, thu hồi, từ chối phạm vi không hỗ trợ và truy cập ẩn danh; sau đó dọn bản ghi tạm. Không in token hoặc mật khẩu.
