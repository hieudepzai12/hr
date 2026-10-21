# Kiểm tra menu và liên kết HR OTIS

Ngày kiểm tra: 21/10/2026. Môi trường: source hiện tại, server `localhost:3000`, database local schema 8. Không push, deploy hoặc thay đổi Neon/production.

## Kết quả

| Phạm vi | Kết quả |
| --- | --- |
| 23 đường dẫn trong sidebar | Có trang tương ứng, mở được |
| 63 lượt GET tới trang, API, danh sách lựa chọn và chi tiết hiện có | Không có HTTP lỗi hoặc JSON không hợp lệ với Admin |
| 46 lần mở trang trong trình duyệt (23 menu × rộng 390/1440 px) | Không ghi nhận API lỗi, JavaScript exception hoặc tràn ngang toàn trang |
| Form Tuyển dụng và Ngân sách lương tại 390/1440 px | Chọn được chức vụ dự kiến, hiện phòng ban, không tràn ngang |
| Build production bằng `.next-verify` | Đạt, không dùng thư mục của dev server |
| Lint toàn dự án | Sau đợt dọn code tiếp theo: 0 lỗi, 0 cảnh báo; xử lý hết phiên dùng router |
| Nâng cấp database tạm từ schema 4 lên 8 | Đạt; giữ dữ liệu/ID cũ, chạy lại migration không trùng, đã dọn database thử |

Kiểm tra trang bằng Admin là kiểm tra mở trang và tải dữ liệu; không thay thế kiểm thử mọi thao tác của mọi tổ hợp quyền.

## Liên kết giữa các menu

| Nhóm | Nguồn và liên kết đã kiểm tra |
| --- | --- |
| Tổng quan | Công việc, cảnh báo, báo cáo; đường dẫn có bộ lọc tới danh sách |
| Cơ cấu công ty | Phòng ban, nhân viên và định biên phòng ban đã duyệt theo tháng |
| Chi tiết nhân sự | Phòng ban, chức vụ trong hồ sơ, quản lý trực tiếp; dữ liệu theo phạm vi được cấp |
| Sơ đồ nhân sự dự án | Dự án và bản ghi Nhân sự dự án; người phụ trách dự án |
| Nhân viên / Thông tin cá nhân | Hồ sơ, phòng ban, chức vụ, quản lý trực tiếp; hồ sơ có phạm vi bản thân/phòng ban/toàn bộ |
| Định biên | Phòng ban + tháng; duyệt, sửa chờ duyệt, khóa sau duyệt; không cộng lẫn bản cũ theo chức vụ |
| Phân công nhiệm vụ | Nhân viên + dự án; nội dung riêng từng người; dự án có đường dẫn tới danh sách đã lọc |
| Tuyển dụng | Chức vụ + phòng ban; số cần tuyển/đã tuyển; không tự tạo nhân viên |
| Khách hàng / Dự án / Công việc | Dùng ID khách hàng và dự án chung; lọc công việc theo dự án; không xóa dự án còn nhiệm vụ/công việc liên quan |
| Báo cáo công việc | Liên kết công việc; giữ snapshot, khóa khi duyệt, phiên bản và khôi phục |
| KPI | Nhân viên, tiêu chí và căn cứ đánh giá |
| Chính sách thưởng / Thưởng dự án | Chính sách đã duyệt, dự án, người nhận; giữ phiên bản chính sách, tính tiền tại máy chủ |
| Ngân sách lương | Chức vụ/phòng ban + tháng; chi phí và tổng tiền tính tại máy chủ |
| Sơ đồ dữ liệu / Tài liệu | Cây thư mục và liên kết tài liệu; chặn xóa thư mục còn nội dung |
| Báo cáo quản trị / Nhật ký | Tổng hợp theo module/phạm vi; không đưa dữ liệu ngân sách/thưởng vào kết quả của người không có quyền |
| Vai trò và phân quyền | Admin quản lý; quyền truy cập dữ liệu được kiểm tra ở API |

Đường dẫn cũ `/profile-nhan-su` và `/bien-dong-nhan-su` tiếp tục chuyển tới màn hình tương ứng để giữ tương thích.

## Lỗi đã sửa trong đợt kiểm tra này

### Tuyển dụng và Ngân sách lương thiếu nguồn chức vụ

Sau khi xóa danh mục chức danh và gộp sang hồ sơ nhân viên, hai biểu mẫu vẫn chỉ đọc bảng liên kết cũ, có thể không chọn được gì khi chưa có bản ghi mới.

Đã sửa:

- Bổ sung các chức vụ thực tế trong hồ sơ nhân viên theo phạm vi quyền.
- Cho phép nhập chức vụ dự kiến và chọn phòng ban ngay trong form, kể cả vị trí chưa có người.
- Chỉ tạo liên kết khi lưu hợp lệ; dùng lại chức vụ cùng tên/phòng, không khôi phục danh mục cũ đã xóa, không tạo nhân viên giả.
- API kiểm tra quyền theo module và phòng ban, ghi lịch sử và rollback toàn bộ nếu dữ liệu không hợp lệ.
- Không thay đổi cấu trúc database trong đợt kiểm tra này.

### Bài kiểm tra cũ không còn khớp nghiệp vụ

Đã cập nhật kiểm tra schema 8, định biên theo phòng ban, cách đếm người thực tế và ngoại lệ Admin duyệt định biên của mình. Bài kiểm tra tương thích phân quyền chỉ sửa vai trò thử nghiệm, không ghi đè vai trò Quản lý thật.

## Các bộ kiểm tra đã chạy

```text
node scripts/verify-menu-links.mjs
node --env-file=.env.local scripts/verify-governance.mjs
  (VERIFY_BASE_URL=http://localhost:3000)
node --env-file=.env.local scripts/verify-governance-migration.mjs
node scripts/verify-workflow.mjs
node scripts/verify-profile-access.mjs
node scripts/verify-personnel-duties.mjs
node scripts/verify-company-structure.mjs
node scripts/verify-recruitment-summary.mjs
node scripts/verify-task-print.mjs
node scripts/verify-task-template.mjs
node scripts/verify-employee-job-titles.mjs
```

Các bài kiểm tra ghi dữ liệu tạo fixture riêng trên local và dọn sau khi chạy. Kiểm tra trình duyệt và ảnh lưu trong thư mục private được bỏ qua bởi Git: `imports/verification/`.

## Những phần chưa tự đồng bộ

- **Phân công nhiệm vụ**, **Nhân sự dự án** và **Công việc & Kế hoạch** dùng chung dự án nhưng vẫn là ba loại bản ghi riêng. Thêm nhiệm vụ không tự tạo thành viên dự án, công việc hoặc tiến độ. Sơ đồ nhân sự dự án hiện lấy từ Nhân sự dự án.
- **Định biên** không tự tạo nhu cầu tuyển dụng hoặc ngân sách; kế hoạch đã duyệt dùng làm căn cứ, không tự phát sinh dữ liệu tài chính.
- Bản định biên cũ theo chức vụ được giữ để tra cứu, không tự cộng vào định biên phòng ban.

Đây là ranh giới nghiệp vụ hiện tại, chưa thay đổi tự động trong đợt rà soát để tránh tạo bản ghi trùng hoặc tự đổi quy trình.

## Giới hạn

- Chưa kiểm tra bản deploy Vercel/Neon và cấu hình production.
- Chưa truy cập kho tài liệu bên ngoài hoặc upload file thật lên dịch vụ lưu trữ. Quyền của kho bên ngoài vẫn phụ thuộc dịch vụ đó.
- Kết quả đạt áp dụng cho dữ liệu và các luồng đã kiểm tra; không khẳng định mọi trường hợp dữ liệu hoặc mọi tổ hợp quyền đều đã được bao phủ.
