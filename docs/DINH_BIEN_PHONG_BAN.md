# Định biên theo phòng ban

1. Vào **Định biên nhân sự → Thêm mới**.
2. Chọn **Phòng ban**, tháng và nhập tổng số người cần có (gồm người phụ trách và nhân viên).
3. Nhập căn cứ, lưu và gửi duyệt theo quyền hiện tại.
4. Sau khi duyệt, **Cơ cấu công ty** hiển thị số định biên của phòng trong tháng tương ứng. Không cộng thêm nhu cầu tuyển dụng.

Mỗi phòng ban chỉ có một kế hoạch đang sử dụng trong mỗi tháng. Muốn sửa kế hoạch đã duyệt phải mở lại. Xóa mềm và khôi phục tiếp tục kiểm tra quyền, phiên bản và trùng phòng/tháng ở máy chủ.

Admin có thể gửi và duyệt cả kế hoạch định biên do chính mình lập. Các vai trò khác vẫn phải được cấp quyền Duyệt và không được tự duyệt. Ngoại lệ của Admin chỉ áp dụng cho định biên; không áp dụng cho thưởng hoặc ngân sách. Mọi lần duyệt vẫn lưu người duyệt, thời gian và nhật ký.

Người có quyền Sửa được chỉnh bản nháp, yêu cầu bổ sung và bản đang chờ duyệt trong phạm vi đã cấp. Sửa bản chờ duyệt đưa kế hoạch về nháp, tăng phiên bản và phải gửi duyệt lại; yêu cầu duyệt trên phiên bản cũ bị từ chối. Bản đã duyệt vẫn khóa cho đến khi được mở lại.

## Dữ liệu cũ

Các bản định biên theo chức vụ vẫn giữ nguyên liên kết và lịch sử. Không tự cộng hoặc chuyển đổi chúng vì chưa biết số cũ có phải tổng của phòng ban hay không. Sơ đồ và thống kê chỉ lấy các kế hoạch theo phòng ban (`position_id IS NULL`). Khi sửa bản cũ, cần nhập tổng số người của phòng; lưu sẽ chuyển bản đó sang định biên phòng ban, có lưu phiên bản trước/sau. Nếu đã tồn tại kế hoạch phòng/tháng, phải xử lý bản trùng trước.

## Migration 008

- Cho phép `staffing_plans.position_id` là NULL; giữ các giá trị cũ.
- Thêm index duy nhất `(department_id, month)` cho bản phòng ban chưa xóa.
- Không xóa nhân viên, chức vụ hoặc kế hoạch cũ; không tạo bảng mới.
- Đã áp dụng local bằng `node scripts/migrate.mjs`. Không chạy trên production trong đợt sửa này.

Trước khi áp dụng ở môi trường khác, sao lưu database, xác nhận đúng môi trường và chạy migration bằng quy trình đã được phê duyệt. Script mặc định chặn database ngoài local.

Rollback nên giữ cột nullable và bản sao dữ liệu mới; không thể khôi phục ràng buộc NOT NULL nếu còn kế hoạch phòng ban. Không xóa kế hoạch mới hoặc gán chức vụ giả để rollback. Cần điều chỉnh code đọc theo phòng ban nếu phải quay về phiên bản ứng dụng cũ.
