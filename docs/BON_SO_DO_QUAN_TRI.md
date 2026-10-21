# Bốn sơ đồ quản trị

Trong sidebar, mở **Cơ cấu tổ chức → Các sơ đồ quản trị**:

1. **Cơ cấu công ty**: các phòng trong danh mục, chức danh từ hồ sơ nhân viên đang hoạt động và nhánh cấp dưới theo Quản lý trực tiếp. Không hiển thị tên cá nhân, không tạo sẵn hai tầng Trưởng phòng/Nhân viên. Phòng trống và hồ sơ thiếu chức danh được ghi rõ. Chỉ hiện chức danh Giám đốc khi có hồ sơ lãnh đạo đang hoạt động; nếu chưa có thì hiện tên công ty và thông báo thiếu hồ sơ. Với danh mục local hiện tại có năm phòng Kỹ thuật, Kinh doanh, Nhân sự, Kế toán và Tài chính; Ban Giám đốc không tính là một phòng.
2. **Chi tiết nhân sự**: hiển thị nhân viên hiện tại, có tên và quan hệ quản lý trực tiếp; mặc định tất cả phòng ban được xem. Có lọc phòng, tìm kiếm, xem toàn bộ và toàn màn hình. Đã bỏ chế độ theo tài liệu tổ chức; dữ liệu nguồn vẫn được giữ trong database.
3. **Nhân sự dự án**: dự án, người phụ trách chính và nhân sự tham gia với vai trò, thời gian và tỷ lệ phân bổ. Dùng chung danh mục Dự án và Nhân sự dự án. Có phân trang; không tạo dữ liệu mẫu khi chưa có phân công.
4. **Sơ đồ dữ liệu**: dùng lại cây thư mục và màn hình quản lý kho dữ liệu hiện có, liên kết danh mục tài liệu/hướng dẫn truy cập. Không phải sơ đồ nhân sự.

Các sơ đồ sử dụng quyền `organization`, `projects` hoặc `documents` tương ứng. Mục cha không yêu cầu quyền tổ chức để người chỉ được xem dự án/tài liệu vẫn truy cập được đúng sơ đồ của mình. API tiếp tục kiểm soát phạm vi dữ liệu. Đường dẫn cũ được giữ tương thích; không có migration database cho thay đổi này.

Sơ đồ nhân sự dùng bố cục ngang và tự thu vừa chiều rộng/chiều cao còn lại của màn hình. Nút Vừa khung trở về mức tự động; dấu +/− dùng để đọc chi tiết, có thể cuộn khi phóng lớn. Nhấn thẻ để mở thông tin. Trên màn hình nhỏ, chế độ vừa khung ưu tiên nhìn toàn cảnh nên chữ sẽ nhỏ; dùng phóng to hoặc lọc phòng để đọc rõ.

## Cập nhật dữ liệu để sơ đồ thay đổi

**Số trên sơ đồ cơ cấu công ty = số người hiện đang làm việc trong phòng + số người cần tuyển còn lại** (tổng nhân sự dự kiến). Số hiện có bao gồm người phụ trách phòng. Dưới tổng có hai số thành phần để đối chiếu. Phần cần tuyển lấy từ Nhu cầu tuyển dụng đã duyệt, tình trạng Chưa tuyển/Đang tuyển; tổng `quantity - hired_count` (không âm) theo phòng ban. Không tính bản nháp, chờ duyệt, từ chối, tạm dừng, đã tuyển đủ hoặc xóa mềm. Không có nhu cầu phù hợp thì phần cần tuyển bằng 0. Không có quyền Tuyển dụng thì báo chưa đủ quyền tính tổng, không tự coi là 0. Sơ đồ nhân sự chi tiết tiếp tục hiển thị nhân viên đang làm việc.

1. Vào **Nhân viên**, chọn **Sửa** hoặc **Thêm nhân viên**.
2. Nhập **Chức vụ** thực tế; chọn **Phòng ban**, **Quản lý trực tiếp** và trạng thái **Đang làm việc**.
3. Lưu rồi mở lại sơ đồ. Vai trò là quyền sử dụng phần mềm, không dùng thay chức vụ. Ví dụ chức vụ Giám đốc không tự cấp quyền quản trị.
4. Sơ đồ dự án lấy dữ liệu từ **Dự án** và **Nhân sự dự án**; cập nhật phân công tại hai màn hình đó.
5. Sơ đồ dữ liệu lấy từ **Sơ đồ dữ liệu** và **Tài liệu & Truy cập**, không lấy từ hồ sơ nhân viên.

Đối chiếu local sau khi nhập Word: 15 hồ sơ đang hoạt động, 7 hồ sơ có quản lý trực tiếp, 12 hồ sơ chưa có chức vụ cụ thể trong phần sơ đồ nguồn. Không tự biến tên dự án hoặc vai trò đăng nhập thành chức vụ cho các hồ sơ thiếu thông tin. Chưa có phân công dự án được nhập. Các mục chưa rõ cần xác nhận nghiệp vụ trước khi điền.
