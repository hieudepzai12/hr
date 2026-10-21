# Sắp xếp menu và dọn code

Cập nhật 21/10/2026, kiểm tra trên local. Giữ đủ 23 màn hình và phân quyền hiện có; không đổi URL/API hoặc cấu trúc database trong đợt này.

## Sidebar mới

| Nhóm | Menu |
| --- | --- |
| Tổng quan | Tổng quan điều hành |
| Tổ chức & Nhân sự | Phòng ban; Nhân viên; Sơ đồ tổ chức (Cơ cấu công ty, Chi tiết nhân sự, Nhân sự dự án); Định biên; Tuyển dụng; KPI |
| Dự án & Công việc | Khách hàng; Dự án; Nhân sự dự án; Phân công nhiệm vụ; Công việc & Kế hoạch |
| Tài chính & Thưởng | Ngân sách tiền lương; Chính sách thưởng; Thưởng dự án |
| Tài liệu nội bộ | Sơ đồ dữ liệu; Tài liệu & Truy cập |
| Báo cáo & Thống kê | Báo cáo công việc; Báo cáo quản trị |
| Quản trị hệ thống | Vai trò và phân quyền; Nhật ký hoạt động |

Sidebar và tìm kiếm chức năng cùng dùng `navigation.js`. Người dùng vẫn chỉ nhìn thấy menu được cấp quyền. Menu con có ID riêng phục vụ bàn phím/trình đọc màn hình, không dùng ID cố định có thể bị trùng.

## Code đã dọn

- Tách `GovernanceFields` dùng chung cho form các phân hệ. Gom xử lý cập nhật trường, trường liên kết, số, văn bản, ngày và tháng; bỏ đoạn JSX và xử lý `onChange` bị lặp trong workspace.
- Gom thao tác tìm/tạo liên kết chức vụ, lưu phiên bản và audit vào một hàm nội bộ. Vẫn giữ kiểm tra quyền và chủ sở hữu riêng của từng luồng.
- Xóa component `PersonnelDutyTitle` không còn được import sau khi bỏ chọn chức vụ trong phân công nhiệm vụ.
- Xóa CSS của bố cục sơ đồ dọc và viewport cũ không còn được component nào sử dụng. Giữ bố cục ngang, kéo và thu phóng hiện tại.
- Chuyển xử lý hết phiên sang sự kiện dùng chung và `router.replace` trong AuthProvider, thay cho gán `window.location.href`. AuthProvider gỡ listener khi unmount.
- Sửa sơ đồ bị đứng ở trạng thái tải khi chọn lại cùng tháng. Cho phép xóa năm để nhập lại; khi thiếu tháng/năm hiển thị lời nhắc, không gửi yêu cầu với bộ lọc thiếu.

Rút gọn bằng cách tái sử dụng logic; không nén code hoặc bỏ kiểm tra quyền, lịch sử, xác thực dữ liệu để giảm số dòng.

## Kiểm tra sau thay đổi

- Lint toàn dự án: **0 lỗi, 0 cảnh báo**.
- Build production với `.next-verify`: **đạt**.
- 23 menu / 63 lượt GET trang và API: **đạt**.
- 46 lần mở menu ở 390/1440 px: không ghi nhận HTTP lỗi, JavaScript exception hoặc tràn ngang toàn trang.
- Trình duyệt: sửa/xóa/chọn lại tháng và hết phiên tự về đăng nhập: **đạt**.
- Trình duyệt: lưu nhu cầu tuyển dụng qua form đã tách, gồm chức vụ dự kiến, phòng ban, số lượng và ghi chú: **đạt**; dữ liệu thử đã được dọn.
- Các bài kiểm tra `verify-governance`, `verify-personnel-duties`, `verify-workflow`, `verify-profile-access`: **đạt**. Bao gồm phạm vi quyền, liên kết dự án/công việc, định biên, duyệt, khóa, phiên bản, xóa/khôi phục, import Excel và KPI.
- `git diff --check`: **đạt**.

Không chạy migration mới, không push/deploy và không sửa production. Các kết quả này xác nhận những luồng đã kiểm tra trên local; không cam kết mọi nhánh dữ liệu và mọi tổ hợp quyền đều không có lỗi.
