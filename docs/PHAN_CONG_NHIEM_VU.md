# Chức vụ và phân công nhiệm vụ

Chức danh và chức vụ dùng cùng tên lấy từ trường **Chức vụ** trong hồ sơ nhân viên. Không cần nhập lại danh mục chức danh để giao nhiệm vụ.

## Thao tác

1. Vào **Nhân viên → Sửa**, cập nhật chức vụ và phòng ban của nhân viên, rồi lưu.
2. Vào **Quản lý nhân sự → Phân công nhiệm vụ → Thêm mới**.
3. Chọn nhân viên. Không cần chọn chức vụ; máy chủ tự dùng chức vụ đầu tiên trong hồ sơ để giữ liên kết kỹ thuật. Nếu hồ sơ chưa có chức vụ, dùng “Nhân viên”.
4. Chọn dự án, nhập tên phân công, thời gian hiệu lực và nội dung nhiệm vụ riêng của nhân sự.
5. Lưu. Hồ sơ nhân sự hiển thị các nhiệm vụ đang hiệu lực theo quyền được cấp.

Hai người cùng chức vụ có thể có nội dung nhiệm vụ khác nhau. Sửa nhiệm vụ của người này không thay nội dung của người kia.

### Định biên phòng ban

Định biên lập theo phòng ban và tháng, không chọn chức vụ. Xem docs/DINH_BIEN_PHONG_BAN.md.

Một nhân viên có thể được giao nhiệm vụ đồng thời ở nhiều dự án. Có bộ lọc dự án; trong chi tiết dự án, chọn **Phân công nhiệm vụ** để mở danh sách đã lọc. Hồ sơ nhân sự hiển thị dự án nếu người xem có quyền xem dự án đó. Danh sách chọn dự án và API đều kiểm tra quyền `projects:view` độc lập với quyền phân công `positions`. Không tự thêm bản ghi thành viên dự án hay công việc trùng lặp.

## Tương thích dữ liệu

- Tái sử dụng bảng `position_assignments`; nội dung nhiệm vụ riêng lưu ở `notes`.
- Bảng `positions` vẫn giữ vai trò liên kết kỹ thuật với định biên, tuyển dụng và ngân sách. Khi giao nhiệm vụ, máy chủ tìm chức vụ cùng tên trong cùng phòng ban, chỉ tạo liên kết nếu chưa có. Không khôi phục các chức danh đã xóa trước đó.
- Dữ liệu phân công cũ vẫn mở và sửa được; chức vụ cũ có lựa chọn “đã lưu”. Không tự thay lịch sử khi chức vụ trong hồ sơ thay đổi.
- Đường dẫn `/bien-dong-nhan-su` chuyển về `/chuc-danh`; sidebar chỉ còn một mục Phân công nhiệm vụ.
- Giữ quyền module `positions`, lịch sử, xóa mềm và khôi phục. Không thay đổi quyền đăng nhập.
- Migration 007 bổ sung `position_assignments.project_id` (nullable, khóa ngoại không xóa dây chuyền) và index. Các phân công cũ giữ nguyên với dự án trống, có thể liên kết khi sửa. Không thực hiện thay đổi production.

## Áp dụng database

Sau khi sao lưu database đúng môi trường, chạy `node scripts/migrate.mjs` cho local. Migration 007 đã được áp dụng local khi phát triển. Script mặc định chặn database ngoài local; production cần được phê duyệt và sao lưu riêng trước khi chạy migration. Không chạy lệnh remote trong đợt chỉnh sửa này.

Rollback ưu tiên giữ cột mới và quay về code cũ vì cột cho phép NULL, không ảnh hưởng câu truy vấn cũ. Nếu buộc phải bỏ cột, cần xuất bản sao các liên kết dự án trước; bỏ index và cột sẽ mất các liên kết mới. Không xóa bản ghi nhân viên, dự án hay phân công để rollback.

## Kiểm tra local

Chạy dev server tại `http://localhost:3000`, sau đó:

```sh
node scripts/verify-personnel-duties.mjs
```

Script chỉ chấp nhận database local, tạo dữ liệu kiểm tra riêng và dọn sau khi chạy; không dùng nhân sự thật để thử lưu.
