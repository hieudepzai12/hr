# Nâng cấp quản trị OTIS Minh Châu

## Phạm vi và mốc quay lại

- Nhánh phát triển: `upgrade/otis-governance`.
- Source trước nâng cấp: `13d30db0a1f86d2e1db3359c8db22d478b548063`.
- Giữ các route cũ, đăng nhập, vai trò cũ, công việc, báo cáo, khách hàng và KPI.
- Quyền các phân hệ mới mặc định **Không có** với mọi vai trò ngoài Admin. Admin cấp riêng trong **Vai trò và phân quyền**; thay đổi áp dụng theo vai trò.
- Không tự seed dữ liệu tổ chức, dự án, tỷ lệ thưởng hoặc lương vào database.
- Không chạy migration production trong quá trình phát triển.

## Các màn hình bổ sung

| Màn hình | Quy trình |
| --- | --- |
| Chức danh & Nhiệm vụ | Thêm vị trí, chọn phòng/quản lý, nhập nhiệm vụ, nguồn tài liệu và trạng thái xác minh. |
| Phân công & Biến động | Chọn nhân viên và vị trí, ngày bắt đầu/kết thúc, lý do. Giữ lịch sử phân công; không đổi tài khoản đăng nhập. |
| Định biên | Chọn vị trí, tháng và số người; gửi duyệt. Thực tế là số người có phân công giao với tháng kế hoạch; người kiêm nhiệm được đếm riêng theo từng vị trí. |
| Nhu cầu tuyển dụng | Nhập số cần tuyển, số đã tuyển và tình trạng, căn cứ và hạn cần người; gửi duyệt. |
| Dự án | Dùng khách hàng có sẵn; chọn phòng/người phụ trách. Chi tiết có số công việc nghiệm thu trong phạm vi người xem. |
| Nhân sự dự án | Phân công người tham gia, vai trò, tỷ lệ và khoảng thời gian. |
| Chính sách thưởng | Nhập điều kiện, hiệu lực và cách tính. Tỷ lệ chỉ do người có thẩm quyền nhập; không suy từ sơ đồ tổ chức. |
| Thưởng dự án | Chọn chính sách đã duyệt, dự án, người nhận và căn cứ. Với chính sách tỷ lệ, máy chủ tính tiền và chụp phiên bản chính sách. |
| Ngân sách tiền lương | Chọn vị trí/tháng, số người và chi phí cho một người/tháng; gửi duyệt. Tổng = số người × (lương + phụ cấp + chi phí doanh nghiệp). Đây là dự toán, không phải bảng lương thực nhận. |
| Sơ đồ lưu trữ | Tạo thư mục cha/con và đơn vị chủ quản. Mở từng nhánh hoặc chọn thư mục để xem chi tiết. |
| Tài liệu & Truy cập | Chọn thư mục, nhập đường dẫn HTTPS và hướng dẫn. Quyền kho bên ngoài vẫn do hệ thống lưu trữ đó kiểm soát. Không nhập mật khẩu hoặc token vào đường dẫn/nội dung. |
| Báo cáo quản trị | Tổng hợp từ dữ liệu thật; lọc tháng cho định biên/ngân sách. Tiền chỉ tổng hợp bản đã duyệt. |
| Nhật ký hoạt động | Tra cứu chỉ đọc theo quyền; chi tiết giá trị trước/sau ở từng bản ghi. |

Mọi danh sách mới có tìm kiếm, lọc phòng ban/trạng thái, sắp xếp, phân trang 20 dòng, dạng thẻ trên mobile và bảng trên desktop. Các mục liên quan tháng có lọc tháng. Header có tìm chức năng đã được cấp quyền. Sơ đồ tổ chức có hai góc nhìn nhân sự hiện tại và vị trí/phân công, lọc phòng, tìm kiếm, thu/mở nhánh và xem nhiệm vụ.

Trong **Công việc & Kế hoạch**, chọn **Phần việc của tôi** để lọc cả việc phụ trách lẫn phối hợp. Có thể liên kết dự án và lọc theo dự án; bản in kế hoạch sử dụng cùng bộ lọc này.

## Gửi duyệt, khóa nội dung và khôi phục

1. Lưu bản nháp, mở chi tiết và chọn **Gửi duyệt**.
2. Người khác có quyền duyệt chọn **Duyệt** hoặc **Yêu cầu bổ sung**. Không được tự duyệt đề xuất mình tạo.
3. Bản đã gửi hoặc duyệt khóa nội dung. Bản bị yêu cầu bổ sung được sửa và gửi lại.
4. Muốn chỉnh bản đã duyệt: người có quyền duyệt chọn **Mở lại**, nhập lý do; sửa, gửi và duyệt lại.
5. Chọn **Xóa** và nhập lý do để xóa mềm. Bật **Đã xóa**, mở bản ghi và chọn **Khôi phục** khi có quyền. Bản đã duyệt phải mở lại trước khi xóa.
6. Mỗi lần thay đổi tạo phiên bản và nhật ký trong cùng transaction. Nếu người khác vừa sửa, ứng dụng yêu cầu mở lại bản mới thay vì ghi đè.

Thư mục còn tài liệu/thư mục con và dự án còn công việc liên kết được bảo vệ khỏi xóa. Dữ liệu còn liên kết không được đổi phòng ban tùy ý. Vai trò đăng nhập không đồng nghĩa chức danh tổ chức.

## Nguồn tài liệu đang cần xác minh

Đã trích xuất phần bảng và SmartArt từ hai file Kế toán và Tài chính. Có chênh lệch tên trưởng nhóm giữa sơ đồ và bảng nhiệm vụ; danh sách người của sơ đồ Tài chính khác bảng, còn vị trí/dòng nhiệm vụ chưa điền. Chưa có sơ đồ tổng thể công ty được duyệt, định biên, mức lương, chính sách thưởng và đường dẫn kho chính thức.

Bản trích xuất cục bộ ở `imports/organization-review.json` và được loại khỏi Git. Không nhập bản này tự động vào database. Cần người phụ trách xác nhận người, vị trí, cấp quản lý, nhiệm vụ và ngày hiệu lực; sau đó nhập dữ liệu xác nhận qua màn hình. Có thể tạo lại bản đối chiếu:

```powershell
python -X utf8 scripts/extract-org-sources.py "C:\duong-dan\SO_DO_KE_TOAN.docx" "C:\duong-dan\SO_DO_TAI_CHINH.docx"
```

## Migration 5 trên môi trường phát triển

Migration mới ở `src/lib/migrations/005-governance.js`, được gọi từ runner hiện có. Bổ sung 11 bảng nghiệp vụ, bảng phiên bản dùng chung cho nghiệp vụ mới và `tasks.project_id` nullable. Không thay ID hoặc xóa bảng/cột cũ. Migration 5 chạy trong transaction, có khóa tránh chạy đồng thời và chỉ đánh dấu phiên bản khi thành công.

Runtime chỉ tự migrate khi hostname database là localhost/127.0.0.1; database từ xa chỉ kiểm tra phiên bản. Vì vậy bản mới cần schema 5 trước khi dùng với Neon. **Chưa thực hiện thao tác này trên Neon.**

1. Sao lưu database và tệp; xác nhận database phát triển tách biệt production.
2. Đặt kết nối local trong terminal. Giá trị môi trường terminal được ưu tiên; không in chuỗi kết nối thật ra log.
3. Chạy `npm run migrate`. Với DB trống, runner yêu cầu `INITIAL_ADMIN_EMAIL` và mật khẩu ban đầu ít nhất 16 ký tự.
4. Kiểm tra bảng `schema_migrations` có version 5.
5. Khởi động ứng dụng. Nếu đang có server dev khác, có thể dùng thư mục build riêng để kiểm thử:

```powershell
$env:DATABASE_URL = 'postgres://tai_khoan_local@127.0.0.1:5432/otis_dev?sslmode=disable'
$env:OTIS_DIST_DIR = '.next-verify'
npm run dev -- --port 3101 --hostname 127.0.0.1
```

Lệnh migration từ chối database ngoài local trừ khi có `--allow-remote`. Cờ này chỉ dành cho người vận hành sau khi duyệt đúng môi trường và có sao lưu; không dùng như bước phát triển mặc định.

## Kiểm tra

```powershell
npm run lint
npm run build
node scripts/verify-task-print.mjs
node scripts/verify-task-template.mjs
# Nâng schema 4 -> 5 và kiểm tra rollback trên database thử riêng:
node scripts/verify-governance-migration.mjs
# Chỉ với database kiểm thử local, server trỏ cùng database:
$env:VERIFY_BASE_URL = 'http://127.0.0.1:3101'
node scripts/verify-governance.mjs
# Có Python + websocket-client và Chromium để chụp giao diện:
node scripts/verify-governance.mjs --browser
```

Script không đọc `.env.local`; yêu cầu DATABASE_URL được đặt rõ ràng và chỉ chấp nhận database/API loopback. Dữ liệu thử dùng tên/mã riêng và được dọn theo ID. Ảnh và số đo desktop/mobile ở `imports/verification/`, loại khỏi Git. Không ghi cookie hoặc mật khẩu thử ra log.

## Rollback

- Code cũ chỉ yêu cầu schema >= 4; schema 5 giữ nguyên các bảng/cột cũ nên có thể quay lại bản code trước nâng cấp. Các bản ghi mới được giữ lại để triển khai lại sau.
- Không tự động chạy down migration hoặc DROP các bảng mới vì có thể mất dữ liệu đã nhập sau triển khai.
- Để xem bản cũ local, dùng bản archive/source ở commit mốc trong thư mục riêng; không dùng reset/clean cưỡng bức trên workspace có thay đổi chưa commit.
- Trước triển khai thật cần sao lưu cả DB lẫn kho tệp, thử phục hồi vào DB riêng, đối chiếu version, số bản ghi và một số quan hệ dữ liệu. Chỉ phục hồi đè sau khi đã đánh giá giao dịch phát sinh kể từ lúc sao lưu.
- Bản patch tài liệu trước nâng cấp nằm trong thư mục TEMP của phiên phát triển, tên `otis-before-governance-13d30db.patch`; tài liệu gốc chưa bị ghi đè.

## Giới hạn cần dữ liệu nghiệp vụ

Không tự tạo dữ liệu công ty từ tên người chưa khớp; chưa thể có số ngân sách/thưởng thực nếu chưa nhập căn cứ được duyệt. Tuyển dụng hiện theo dõi nhu cầu và tình trạng, chưa bao gồm hồ sơ ứng viên/phỏng vấn. Kho tài liệu hiện quản lý cây và đường dẫn, chưa đồng bộ nội dung từ Google Drive/SharePoint. Quỹ lương là dự toán, chưa thực hiện trả lương/chuyển khoản. Các nghiệp vụ mở rộng này cần quy trình được xác nhận riêng.

## Kết quả kiểm tra local ngày 19/10/2026

- Build thành công. Lint không có lỗi, còn cảnh báo điều hướng đã có từ trước trong `src/lib/api.js`.
- Kiểm tra API: mặc định từ chối quyền mới, cách ly phòng ban, không tự duyệt, khóa bản đã duyệt, xử lý phiên bản cũ, xóa/khôi phục, cây không vòng lặp, tiền VND chính xác, lọc tổng hợp và luồng công việc/báo cáo cũ.
- Kiểm tra deadline theo giờ Việt Nam, trước hạn 3/1 ngày, hôm nay, quá hạn và chờ nghiệm thu; bản in giữ bộ lọc dự án; mẫu Excel vẫn đọc đúng.
- Migration thử từ source/schema 4 lên 5 giữ nguyên dòng và ID cũ, chạy lại được; code mốc cũ kiểm tra được schema mới.
- Đã sao lưu và phục hồi database kiểm thử sang database local khác; phục hồi được schema 5 và 12 bảng mở rộng.
- Trình duyệt kiểm tra 7 trang × 2 kích thước (390px/1440px), 4 biểu mẫu, menu mobile và nút sidebar desktop. Không phát hiện trang/thẻ/form tràn ngang. 18 ảnh chụp ở `imports/verification/` chỉ chứa dữ liệu kiểm thử.
- Bản archive source mốc ở `imports/verification/baseline-13d30db.zip`. Đã đối chiếu thay đổi tài liệu chưa commit với patch trước nâng cấp: giữ nguyên.
- Chưa push, deploy hoặc migrate Neon/production.
