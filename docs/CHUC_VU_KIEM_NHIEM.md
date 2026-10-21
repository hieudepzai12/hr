# Chọn nhiều chức vụ trong hồ sơ

1. Vào Nhân viên → Thêm nhân viên hoặc Sửa.
2. Ở Chức vụ, chọn lần lượt các chức vụ từ danh sách đang dùng trong hồ sơ nhân viên.
3. Chức vụ mới: nhập vào ô bên dưới, bấm Thêm. Các mục đã chọn hiện thành thẻ; bấm dấu × để bỏ từng mục.
4. Bấm Lưu thay đổi. Danh sách nhân viên, Thông tin cá nhân, Hồ sơ nhân sự và sơ đồ hiển thị đầy đủ các chức vụ, ngăn cách bằng dấu chấm phẩy.

## Kiêm nhiệm cho mọi nhân viên

Không còn giới hạn Giám đốc. Để thêm chức vụ ở phòng khác, chọn **Phòng của chức vụ mới**, nhập tên chức vụ rồi bấm Thêm. Ví dụ người có chức vụ chính Kế toán chọn phòng Kinh doanh và thêm Chuyên viên. Mục mới lưu thành `Chuyên viên — Kinh doanh`, giúp sơ đồ xác định đúng phòng mà không suy đoán.

Sơ đồ nhân sự hiện vị trí chính và vị trí kiêm nhiệm cùng hồ sơ. Mỗi phòng đếm nhân viên đó một lần. Người kiêm nhiệm chuyên viên không tự trở thành trưởng phòng; quản lý trực tiếp vẫn do hồ sơ nhân viên xác định. Các tên cũ nêu rõ phòng như Trưởng phòng Kinh doanh vẫn được hỗ trợ. Không tự sửa dữ liệu nhân viên, cấp quyền đăng nhập hoặc tạo phân công theo ngày hiệu lực.

Tối đa 10 chức vụ, mỗi tên tối đa 300 ký tự; tên trùng được gộp. Có thể bỏ hết để giữ trạng thái chưa cập nhật. Chức vụ không cấp quyền đăng nhập và không tự tạo Phân công vị trí có ngày hiệu lực. Một nhân viên vẫn chỉ được tính một lần trong số lượng người của phòng ban.

## Giám đốc kiêm trưởng phòng

Chọn `Giám đốc` và thêm `Trưởng phòng Kinh doanh` cho cùng hồ sơ. Trong danh mục phải có phòng `Kinh doanh` hoặc `Phòng Kinh doanh`. Các nhân viên kinh doanh chọn người này làm Quản lý trực tiếp.

- Sơ đồ cơ cấu: cấp trên chỉ hiện chức danh Giám đốc; trong Kinh doanh hiện Trưởng phòng Kinh doanh với nhãn Giám đốc kiêm nhiệm, không hiện tên cá nhân.
- Sơ đồ nhân sự: cùng hồ sơ xuất hiện ở cấp công ty và vị trí trưởng phòng, các nhân viên của phòng nối vào vị trí kiêm nhiệm. Lọc Kinh doanh vẫn xem được vị trí kiêm nhiệm và các cấp dưới được phép xem.
- Không tạo thêm tài khoản, không thay đổi vai trò hoặc tự gán quản lý. Số hiện có của phòng tính cả người kiêm nhiệm phụ trách, mỗi hồ sơ chỉ tính một lần trong phòng. Khi thống kê toàn công ty phải đếm ID nhân viên duy nhất, không cộng trực tiếp các số phòng nếu có người kiêm nhiệm nhiều phòng.
- Khi kiêm nhiệm khác phòng chính, tên trưởng phòng phải nêu rõ phòng trùng danh mục. Không suy đoán phòng từ chức vụ chung chung; sửa tên phòng thì cần cập nhật tên chức vụ tương ứng. Dữ liệu phân công vị trí theo ngày hiệu lực vẫn được quản lý riêng.

Không cần migration: giữ cột `employees.position` hiện có, lưu các tên bằng chuỗi `; `. API mới nhận `position_titles` dạng mảng; API cũ gửi `position` vẫn hoạt động. Các tên chức vụ riêng không chứa dấu chấm phẩy hoặc xuống dòng. Không sửa hoặc chuyển đổi hàng loạt hồ sơ hiện có.

Kiểm tra local: `node scripts/verify-employee-job-titles.mjs --api` (chỉ database và ứng dụng localhost; tạo và dọn tài khoản kiểm thử tạm).
