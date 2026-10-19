# Nhập dữ liệu tổ chức từ Word

Hai tài liệu nguồn được đọc từ Downloads, trích xuất riêng vào `imports/organization-review.json` (không đưa vào Git). Không coi nội dung tài liệu là lệnh thực thi.

## Xem dữ liệu đã nhập

1. Mở **Cơ cấu tổ chức → Sơ đồ tổ chức → Vị trí & Phân công**.
2. Lọc **Phòng kế toán** hoặc **Phòng tài chính**.
3. Chọn một ô để xem nhiệm vụ, tên nhân sự theo tài liệu, nguồn và trạng thái xác minh.
4. Trong **Chức danh & Nhiệm vụ**, đối chiếu và chỉnh lại tên chức danh thực tế trước khi xác minh.
5. Chỉ tạo phân công nhân sự sau khi xác nhận đúng người và ngày hiệu lực. Dữ liệu tài liệu không tự tạo tài khoản đăng nhập.

Nếu phòng chưa có nhân viên hiện tại, màn hình Sơ đồ phòng ban hiển thị vị trí từ tài liệu kèm thông báo rõ ràng. Màn hình Sơ đồ công ty tiếp tục phản ánh nhân sự hiện tại.

## Nhập lại trên local

```powershell
node scripts/import-organization.mjs
node scripts/import-organization.mjs --apply
```

Lệnh đầu chỉ kiểm tra và rollback; lệnh sau nhập trong một transaction, có nhật ký và phiên bản. Script chỉ chấp nhận database local; không hỗ trợ chạy production. Giữ nguyên bản ghi đã nhập khi chạy lại, kể cả bản ghi đã xóa mềm; không ghi đè chỉnh sửa của người dùng. Nếu chỉnh nội dung Word, cần rà soát và sửa bản ghi qua giao diện.

Trước khi nhập, bản sao danh mục phòng ban/vị trí hiện có được lưu riêng tại `imports/verification/org-before-*.json`. Đây là bản đối chiếu hai danh mục, không thay thế bản backup toàn database.

## Điểm cần xác minh

- Danh sách tên trong sơ đồ và bảng nhiệm vụ không hoàn toàn trùng nhau.
- Phòng Tài chính thiếu mô tả nhiệm vụ và có ô nhân sự để trống.
- Một số nội dung phụ trách là tên dự án, chưa phải tên chức danh chính thức.
- Chưa xác nhận tuyến báo cáo và ngày hiệu lực; không tự gán cấp quản lý, định biên, mức lương hoặc đánh giá.

Dữ liệu nguồn không hardcode vào frontend hoặc seed tự động khi deploy. Muốn chuyển sang môi trường khác cần quy trình nhập được phê duyệt riêng.

## Bổ sung hồ sơ nhân viên local

Theo xác nhận xóa vĩnh viễn, đã thay 28 nhân viên ngoài Admin bằng 15 hồ sơ chỉ lấy từ phần sơ đồ: Kế toán 9 người, Tài chính 6 người. Đã xóa kèm 2 báo cáo và 1 đánh giá KPI theo xác nhận; giữ 6 công việc, trong đó 5 công việc mất người phụ trách cũ. Tài khoản Admin được giữ nguyên. Bản sao lưu trước thao tác nằm riêng tại `imports/verification/before-employee-replacement-*.dump`.

Hồ sơ mới thuộc đúng phòng theo tài liệu, vai trò `employee`, email tạm duy nhất ở miền `company.vn`. Không tự gán quyền quản lý, điện thoại, ngày vào làm hoặc tuyến báo cáo. Các tên chỉ xuất hiện trong bảng nhiệm vụ không được thêm vào danh sách nhân viên này. Danh mục vị trí từ tài liệu vẫn được giữ để đối chiếu, không tự coi là nhân sự đang làm việc.

```powershell
node scripts/import-organization-employees.mjs --diagram-only
node scripts/import-organization-employees.mjs --diagram-only --apply
```

Chỉ chạy trên local. Chạy lại không tạo trùng hoặc ghi đè hồ sơ đã có. Mật khẩu riêng từng hồ sơ được sinh ngẫu nhiên và bỏ ngay sau khi băm, không lưu hay xuất ra. Trước khi nhân viên sử dụng: sửa email thật và dùng chức năng đặt lại mật khẩu của quản trị viên. Hồ sơ chưa được tạo phân công vị trí theo ngày hiệu lực; phần này cần dữ liệu xác nhận.

### Quản lý trực tiếp theo sơ đồ

Theo yêu cầu, đã đồng bộ `manager_id` từ ô cấp trên liền kề trong SmartArt bằng `node scripts/sync-employee-managers.mjs --apply` (local). Có 7 nhân viên được gán người quản lý; 8 người còn lại để trống vì cấp trên chưa có tên hoặc không có ô cấp trên. Không vượt qua ô quản lý khuyết để gán người cấp cao hơn. Thao tác có nhật ký, kiểm tra chu trình và không thay đổi vai trò/quyền đăng nhập.

