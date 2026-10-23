# Kiểm thử tải 50 nhân sự — 23/10/2026

## Phạm vi

Chạy API qua Next.js production build của source hiện tại, trên máy phát triển. Hai database thử được tạo riêng: PostgreSQL local và database tạm trên cùng dịch vụ Neon đang sử dụng. Không ghi vào database nghiệp vụ `neondb`, không deploy, không push. Database thử và server thử đã được dọn sau khi chạy; server đang có ở cổng 3000 được giữ nguyên.

Mỗi database có 50 tài khoản nhân viên giả lập, 2.000 công việc, 600 báo cáo và 6.000 lần cập nhật công việc. Bài thử ghi thêm 50 cập nhật tiến độ và gửi 50 báo cáo qua API có xác thực, kiểm tra quyền sở hữu và cơ chế lưu lịch sử hiện có. Báo cáo có khoảng 1.000 ký tự nội dung. Đây không phải bản sao dữ liệu nhân sự thật.

## Kết quả

P95: 95% yêu cầu hoàn tất trong thời gian này. Đơn vị giây; đo từng yêu cầu API, không phải toàn bộ thời gian render trang.

| Kịch bản | Số yêu cầu | P95 local | P95 Neon | Lỗi local / Neon |
|---|---:|---:|---:|---:|
| 50 người đăng nhập cùng lúc | 50 | 6,146 | 14,329 | 0 / 0 |
| 10 người mở dashboard, mỗi người gọi 4 API | 40 | 0,556 | 2,769 | 0 / 0 |
| 50 người mở dashboard, mỗi người gọi 4 API | 200 | 2,017 | 13,599 | 0 / 0 |
| 50 người xem công việc, cập nhật tiến độ, gửi báo cáo, tải lại danh sách | 200 | 0,572 | 13,496 | 0 / 0 |

Tổng cộng **490 yêu cầu mỗi môi trường, 980 yêu cầu, không lỗi HTTP hoặc timeout**. Riêng gửi báo cáo trên Neon có P95 **14,935 giây**. Cả chuỗi thao tác ghi của 50 người hoàn tất sau 32,22 giây trên Neon.

## Đánh giá và giới hạn

- Hệ thống xử lý được số lượng tài khoản và dữ liệu trong bài thử; 50 người cùng thao tác dồn dập qua đường kết nối hiện tại chưa có tốc độ tốt.
- Neon được truy cập từ máy local tới vùng US East. Độ trễ mạng và nhiều truy vấn nối tiếp trong giao dịch có thể góp phần làm chậm; bài thử chưa tách riêng thời gian CPU, chờ pool và thời gian mạng để xác định nguyên nhân chính.
- Đây **không phải đo tải deployment Vercel**. Pool của server local tối đa 10 kết nối; cấu hình hiện có trên Vercel tối đa 1 kết nối mỗi instance, với cơ chế mở rộng instance khác. Không suy ra trực tiếp tốc độ production từ bảng này.
- Bài thử ngắn, một lượt mỗi kịch bản; chưa kiểm tra tải nhiều giờ, nhiều tháng lịch sử, cold start đầy đủ, chi phí compute hoặc tốc độ giao diện trên điện thoại. Đợt đăng nhập Neon diễn ra gần thời điểm kiểm thử local nên có thể chịu ảnh hưởng tải CPU máy phát triển.
- Không thay đổi code nghiệp vụ hoặc cấu hình pool chỉ từ phép đo này. Bước tiếp theo phù hợp là đo trên deployment thử đặt gần vùng Neon, rồi phân tích truy vấn chậm nếu còn chậm.
- Production build và kiểm tra cú pháp/lint của script hoàn tất thành công.

## Chạy lại

Yêu cầu: PostgreSQL user được phép tạo database, Node dependencies đã cài và file môi trường được gitignore. Không ghi chuỗi kết nối vào lệnh hoặc tài liệu.

```powershell
$env:OTIS_DIST_DIR='.next-verify'
npm run build

# File này phải chứa DATABASE_URL trỏ PostgreSQL local.
node scripts/load-test.mjs --env-file .env.load-test.local

# Tạo database thử riêng trên Neon, sử dụng cấu hình trong .env.local.
node scripts/load-test.mjs --neon
```

Script từ chối host không đúng loại, chỉ nạp dữ liệu vào database mới có tiền tố `otis_load_`, chạy server ở cổng loopback riêng, sau đó xóa database thử. Nếu tiến trình bị tắt cưỡng bức hoặc mất mạng giữa chừng, kiểm tra database có tiền tố này để dọn đúng database thử; không xóa `neondb`.

Số liệu chi tiết nằm tại `imports/verification/load-test-local.json` và `imports/verification/load-test-neon.json` (thư mục bị gitignore, không chứa mật khẩu/cookie).
