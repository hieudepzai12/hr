# Tối ưu source — 23/10/2026

## Thay đổi

- `src/app/api/dashboard/stats/route.js`: gộp 4 truy vấn thành 1 lần gọi database, tái sử dụng tập công việc/báo cáo đã lọc quyền. Chỉ lấy các cột cần hiển thị cho danh sách hạn chót, tránh tải toàn bộ nội dung công việc. Giữ nguyên phạm vi bản thân/phòng ban/toàn bộ.
- `src/lib/report-service.js`: bỏ vòng lặp truy vấn từng công việc. Lấy công việc và cập nhật mới nhất của chính người gửi theo lô, kiểm tra đủ quyền cho tất cả công việc, chèn snapshot theo lô. Số truy vấn thay thế nội dung báo cáo từ `1 + 3 × số công việc` xuống 3 với danh sách không rỗng. Vẫn giữ thứ tự, loại trùng ID, phân biệt phần việc người phối hợp và từ chối toàn bộ giao dịch nếu có công việc ngoài quyền.
- Lưu phiên bản báo cáo bằng 1 truy vấn thay cho 3; vẫn lưu nội dung công việc tại thời điểm gửi, không tham chiếu nội dung thay đổi về sau.
- `src/lib/api.js`, `src/components/Layout.jsx`, `src/app/page.js`: dùng chung yêu cầu cảnh báo đang chạy khi Tổng quan và header gọi đồng thời, phân biệt theo tài khoản. Không cache dữ liệu đã trả về và không cache quyết định phân quyền. Tab bị ẩn không gọi polling cảnh báo định kỳ; khi tab hoạt động lại, lịch polling tiếp tục.
- Bổ sung kiểm tra hồi quy trong `scripts/verify-workflow.mjs`; hỗ trợ cổng server thử riêng. `scripts/load-test.mjs --verify-workflow` chạy kiểm tra trên database local tạm rồi tự dọn.

Không đổi database/schema, không cần migration. Không đổi pool hoặc giảm chi phí băm mật khẩu. Không thay đổi dữ liệu nghiệp vụ, không deploy/push.

## Kiểm tra

- `npm run lint`: đạt, không lỗi/cảnh báo ESLint.
- Production build với `OTIS_DIST_DIR=.next-verify`: đạt, giữ server cổng 3000 hiện có.
- Hồi quy trên database local tạm: đạt. Kiểm tra đăng nhập, thống kê đúng người, từ chối công việc ngoài quyền và rollback báo cáo, snapshot nhiều công việc có ID trùng, cập nhật riêng của người phối hợp, phiên bản cũ không đổi sau khi công việc đổi tiến độ, khóa báo cáo đã duyệt, mở lại/sửa/tăng phiên bản, xóa/khôi phục, nhập Excel và chống nhập trùng, căn cứ KPI.
- Kiểm thử tải sau tối ưu: 490 yêu cầu local và 490 yêu cầu Neon, không lỗi HTTP/timeout. Database thử và server thử đã được dọn.

## So sánh Neon trước/sau

Cùng kịch bản 50 tài khoản giả lập, 2.000 công việc, 600 báo cáo, 6.000 cập nhật. Next production chạy trên máy phát triển, kết nối database thử riêng trên Neon US East. P95 tính trên từng API, đơn vị giây.

| Kịch bản | Trước | Sau |
|---|---:|---:|
| 10 người mở dashboard (40 yêu cầu) | 2,769 | 2,132 |
| 50 người mở dashboard (200 yêu cầu) | 13,599 | 10,161 |
| Chuỗi xem việc/cập nhật/gửi báo cáo/tải lại (200 yêu cầu) | 13,496 | 12,095 |
| Riêng API gửi báo cáo trong chuỗi trên | 14,935 | 12,306 |

Lần đo này giảm khoảng 25% P95 cho đợt mở dashboard và 18% cho gửi báo cáo. Đây là quan sát một lượt trước/sau, có biến động mạng/CPU; không phải bảo đảm mức cải thiện cố định. Đăng nhập chưa được tối ưu: P95 sau là 14,136 giây so với trước 14,329 giây.

Chạy local sau tối ưu: P95 mở dashboard với 50 người là 1,711 giây, gửi báo cáo là 0,442 giây. Dữ liệu đo chi tiết nằm trong `imports/verification/load-test-*.json` và bản trước thay đổi có hậu tố `-before-optimization` (gitignore, không chứa cookie/mật khẩu).

## Giới hạn và bước tiếp theo

Đây là tối ưu các đường chạy chính có số liệu, không phải khẳng định mọi lỗi trong toàn bộ hệ thống đã được loại bỏ. Chưa đo render bằng trình duyệt hoặc kích thước bundle trước/sau; không tuyên bố giảm dung lượng JavaScript.

Neon vẫn chậm trong đợt 50 người thao tác dồn dập từ máy local. Chưa đo trực tiếp deployment Vercel, tải kéo dài, cold start và chi phí compute. Cấu hình pool trên Vercel khác server local. Cần đo trên deployment thử gần vùng Neon trước khi quyết định sửa pool/hạ tầng hoặc kết luận đáp ứng production.

Không cần thao tác database để áp dụng code. Có thể chạy lại an toàn bằng:

```powershell
$env:OTIS_DIST_DIR='.next-verify'
npm run build
node scripts/load-test.mjs --verify-workflow --env-file .env.load-test.local
```

File môi trường thử chứa `DATABASE_URL` của PostgreSQL local và phải được gitignore; script chỉ ghi vào database tạm mới tạo. Không đưa chuỗi kết nối vào Git.
