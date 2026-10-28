# NhanSu — Hệ thống Quản lý Nhân sự (Next.js + Postgres)

## Bản nâng cấp quản trị OTIS

Hướng dẫn chức năng mới, migration 5, kiểm thử local và rollback: [NANG_CAP_QUAN_TRI_OTIS.md](docs/NANG_CAP_QUAN_TRI_OTIS.md). Runtime không tự migrate database từ xa. Quyền các phân hệ mới mặc định chưa cấp cho vai trò ngoài Admin; cần cấu hình riêng trước khi sử dụng. Các mô tả schema phiên bản 4 bên dưới là lịch sử nền trước nâng cấp.

Ứng dụng quản lý nhân sự full-stack: quản lý nhân viên/phòng ban, gửi & duyệt báo cáo (kèm file đính kèm), theo dõi công việc theo timeline/deadline (Kanban, kèm file đính kèm), đánh giá KPI theo tiêu chí trọng số, và ảnh đại diện nhân viên. Toàn bộ frontend + backend nằm trong một dự án Next.js duy nhất — **sẵn sàng deploy lên Vercel**.

## Công nghệ sử dụng

- **Next.js 16** (App Router) — giao diện lẫn API đều chạy trong cùng một project
- **PostgreSQL** (qua package `pg`) — khuyến nghị dùng **[Neon](https://neon.tech)** (miễn phí, tương thích serverless, không cần cài đặt gì)
- **Vercel Blob** — lưu ảnh đại diện & file đính kèm khi deploy lên Vercel. Khi chạy local mà chưa cấu hình, ứng dụng **tự động lưu file vào đĩa** — không bắt buộc phải có tài khoản Vercel để phát triển local.
- **JWT + bcrypt** — xác thực đăng nhập
- **Tailwind CSS v4**, **lucide-react**, **date-fns**, **axios**

## Vì sao đổi từ SQLite sang Postgres?

Vercel (và hầu hết nền tảng serverless) chạy code trên các máy ảo tạm thời, **không có ổ đĩa bền vững** — file SQLite hay file upload lưu cục bộ sẽ mất sau khi function khởi động lại. Postgres (Neon) và Vercel Blob là dịch vụ lưu trữ bên ngoài, dữ liệu tồn tại độc lập với các lần chạy function.

## Cài đặt & chạy local

### 1. Tạo database Postgres miễn phí (Neon)

1. Vào [neon.tech](https://neon.tech), đăng ký tài khoản (miễn phí).
2. Tạo project mới → Neon tự tạo sẵn 1 database.
3. Vào **Dashboard → Connection string**, copy chuỗi kết nối dạng:
   ```
   postgres://<user>:<password>@<host>/<database>?sslmode=require
   ```

### 2. Cấu hình biến môi trường

Copy `.env.example` thành `.env.local`, dán `DATABASE_URL` vừa lấy được:
```
DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require
JWT_SECRET=mot-chuoi-ngau-nhien-it-nhat-32-byte-thay-gia-tri-nay
```
Để trống `BLOB_READ_WRITE_TOKEN` khi chạy local — file upload sẽ tự lưu vào đĩa (`uploads/`, `public/uploads/`).

### 3. Cài đặt & khởi động

```bash
npm install
npm run dev
```

Lần chạy đầu tiên (khi có người gọi API đầu tiên, ví dụ mở trang đăng nhập) sẽ tự động tạo bảng và seed dữ liệu mẫu trong Postgres.

Các danh sách nhân viên, công việc, báo cáo và KPI tải từng trang 20 mục. API nhận `limit` (1–100) và `offset`; khi dùng hai tham số này, phản hồi có dạng `{ items, hasMore }`. Nội dung đầy đủ của báo cáo được tải qua `/api/reports/{id}` khi mở chi tiết.

> **Không có sẵn Postgres cũng không sao:** bạn cũng có thể chạy Postgres bằng Docker (`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres`) và dùng `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable`.

## Deploy lên Vercel

1. **Đẩy code lên GitHub** (repo riêng hoặc trong tổ chức của bạn).
2. **Thêm biến môi trường** trong Vercel Dashboard → Project → Settings → Environment Variables:
   - `DATABASE_URL` = chuỗi kết nối Neon ở bước trên (dùng chung hoặc tạo project Neon riêng cho production)
   - `JWT_SECRET` = chuỗi ngẫu nhiên dài ít nhất 32 byte; bắt buộc ở mọi môi trường
   - `INITIAL_ADMIN_EMAIL` và `INITIAL_ADMIN_PASSWORD` = tài khoản quản trị đầu tiên khi cơ sở dữ liệu production còn trống (mật khẩu ít nhất 16 ký tự). Nếu production đang có tài khoản demo `admin@company.vn / admin123`, ứng dụng tự thay mật khẩu demo bằng `INITIAL_ADMIN_PASSWORD` trong lần chạy đầu sau khi cập nhật. Đăng nhập bằng mật khẩu mới rồi xoá biến mật khẩu này khỏi cấu hình.
3. Sao lưu database, rồi trên máy triển khai hoặc CI cấu hình cùng `DATABASE_URL`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` nếu DB mới, và chạy `npm run migrate` **trước khi nhận request production**. Ứng dụng production sẽ trả lỗi cấu hình nếu schema chưa lên phiên bản 4; không tự chạy migration trên production. Xác nhận `schema_migrations` có phiên bản 4 sau khi chạy. Lệnh migration có thể chạy lại an toàn.
4. Vào [vercel.com](https://vercel.com) → **Add New Project** → chọn repo vừa đẩy → Vercel tự nhận diện Next.js, bấm **Deploy**.
5. **Bật Vercel Blob** để lưu file bền vững: vào tab **Storage** của project trên Vercel → **Create Database** → chọn **Blob** → Connect vào project. Vercel sẽ **tự động thêm** biến `BLOB_READ_WRITE_TOKEN` — không cần bạn tự nhập.
6. Redeploy lại (Vercel → Deployments → nút "Redeploy") để áp dụng biến môi trường mới.

Từ giờ, mọi ảnh đại diện và file đính kèm sẽ tự động lưu qua Vercel Blob thay vì đĩa cục bộ — ứng dụng phát hiện `BLOB_READ_WRITE_TOKEN` và chuyển chế độ tự động, không cần sửa code.

## Cấu trúc dự án

### Migration cho danh mục khách hàng, kế hoạch tuần và quyền dữ liệu

Migration đến phiên bản 4 trong `src/lib/db.js` bổ sung bảng `customers`, `task_collaborators`, `task_updates`, `report_items`, `report_versions`, `audit_logs`, `kpi_evidence` và các cột liên kết cho công việc/báo cáo. Công việc nhập Excel lưu dấu dòng nguồn và có chỉ mục chống nhập lại cùng dòng. Các bảng và dữ liệu cũ được giữ lại; báo cáo cũ được tạo bản phiên bản 1. Chạy `npm run migrate` với `DATABASE_URL` trỏ đúng môi trường cần cập nhật, sau khi sao lưu DB. **Không chạy lệnh này với database production trong quá trình phát triển.**

Các báo cáo mới lưu bản chụp phần việc theo tuần. Khi chuyển tiếp công việc sang tuần khác, chọn lại cùng công việc trong báo cáo mới để giữ nguyên mã công việc. Báo cáo đã duyệt cần được người có quyền mở lại, sửa thành phiên bản mới và gửi duyệt lại.

Trong **Timeline & Deadline → Nhập Excel**, chọn file `.xlsx` tối đa 5 MB có cột **Công việc**. Ứng dụng tìm cột người thực hiện, khách hàng, phòng ban, hạn chót, tiến độ và KPI theo tên cột. Xem trước từng dòng, đối chiếu tên, sửa hạn, xác nhận giá trị 0.x là phần trăm, hoặc bỏ qua dòng không nhập. Dòng ghi “Đã hoàn thành” được đưa vào trạng thái chờ nghiệm thu; không tự suy ra ngày hoàn thành. Dòng trùng file hoặc trùng công việc/người/kỳ dữ liệu được bỏ qua. Giữ file nguồn để đối chiếu với tên sheet và số dòng được lưu trong công việc.

Trong **Đánh giá KPI**, người đánh giá có thể chọn công việc và báo cáo của nhân viên làm căn cứ. Hệ thống lưu bản chụp trạng thái, hạn, nghiệm thu và kỳ báo cáo tại thời điểm chấm; điểm tiêu chí vẫn do người đánh giá nhập. Có thể chạy `node scripts/verify-workflow.mjs` để kiểm tra luồng local; script chỉ chấp nhận `DATABASE_URL` trỏ `localhost` hoặc `127.0.0.1` và dọn dữ liệu thử sau khi chạy.

```
hr-nextjs/
└── src/
    ├── app/
    │   ├── api/              # Backend — Next.js Route Handlers
    │   │   ├── auth/         # login, me, change-password
    │   │   ├── employees/    # CRUD nhân viên + upload avatar
    │   │   ├── departments/  # CRUD phòng ban
    │   │   ├── reports/      # gửi & duyệt báo cáo + file đính kèm
    │   │   ├── tasks/        # timeline & deadline + file đính kèm
    │   │   ├── kpi/          # đánh giá KPI
    │   │   └── dashboard/    # thống kê tổng quan
    │   ├── login/, nhan-vien/, bao-cao/, timeline/, kpi/, ho-so/
    │   ├── page.js            # Dashboard (route gốc "/")
    │   └── layout.js
    ├── components/            # Sidebar, Layout, Modal, Badges, Avatar, Attachments...
    ├── context/AuthContext.jsx
    └── lib/
        ├── db.js               # Kết nối Postgres, tạo schema, seed dữ liệu mẫu
        ├── auth.js             # Helper xác thực JWT cho API routes
        ├── uploads.js          # Lưu file — tự chuyển giữa đĩa cục bộ và Vercel Blob
        └── api.js              # Axios client dùng cookie phiên đăng nhập
```

## Tài khoản dùng thử

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | admin@company.vn | admin123 |
| Quản lý | manager@company.vn | manager123 |
| Nhân viên | binh@company.vn | employee123 |
| Nhân viên | cam@company.vn | employee123 |
| Nhân viên | duy@company.vn | employee123 |
| Nhân viên | ha@company.vn | employee123 |

## Phân quyền

- **Nhân viên:** gửi báo cáo (kèm file), xem/cập nhật trạng thái công việc được giao (kèm file), xem KPI của bản thân, đổi ảnh đại diện của mình.
- **Quản lý:** tất cả quyền của nhân viên + tạo/sửa nhân viên (kể cả đổi ảnh đại diện hộ), giao việc, duyệt báo cáo, tạo đánh giá KPI.
- **Quản trị viên:** toàn quyền, bao gồm xoá phòng ban và vô hiệu hoá tài khoản nhân viên.

## Tính năng chính

- **Gửi báo cáo:** theo ngày/tuần/tháng/dự án; quản lý duyệt và phản hồi; đính kèm file (PDF, Word, Excel, ảnh, zip — tối đa 10MB/file).
- **Timeline & Deadline:** bảng Kanban 4 cột, hiển thị số ngày còn lại/quá hạn, thanh tiến độ, đính kèm file bằng chứng công việc.
- **Quản lý nhân viên:** hồ sơ, phòng ban, vai trò, trạng thái làm việc, ảnh đại diện.
- **Đánh giá KPI:** tiêu chí tuỳ chỉnh có trọng số, tự tính điểm tổng kết và xếp loại.
- **Phòng ban & Sơ đồ tổ chức:** quản lý/quản trị viên thêm/sửa/xoá phòng ban (trang "Phòng ban"); mọi người xem "Sơ đồ tổ chức" dạng lưới trực quan, mỗi phòng ban hiển thị người quản lý (biểu tượng vương miện) và thành viên.
- **Phân quyền theo phòng ban:** quản lý/quản trị viên xem được **toàn bộ** nhân viên và phòng ban (chế độ đầy đủ). Nhân viên thường chỉ xem được **đồng nghiệp cùng phòng ban của mình** — cả ở trang "Nhân viên" lẫn "Sơ đồ tổ chức" (giới hạn ở tầng API, không thể bỏ qua từ trình duyệt).
- **Bảo mật file đính kèm:** file báo cáo/công việc không có URL công khai — mọi lượt tải đều đi qua API có xác thực, kiểm tra đúng người liên quan (chủ báo cáo/người được giao việc, hoặc quản lý/quản trị viên) mới tải được.

## Ghi chú về bảo mật file trên Vercel Blob

Vercel Blob hiện chỉ hỗ trợ chế độ `public` (không có "private" thực sự ở tầng lưu trữ). Ứng dụng xử lý bằng cách: đường dẫn file được đặt tên ngẫu nhiên khó đoán (UUID), và **server không bao giờ trả URL Blob trực tiếp cho trình duyệt** — mọi yêu cầu tải file đều qua API route riêng, API sẽ tự tải nội dung từ Blob về rồi mới trả cho người dùng sau khi kiểm tra quyền. Cách này đủ an toàn cho hầu hết công cụ nội bộ, nhưng không phải bảo mật tuyệt đối như URL ký (signed URL) có hạn dùng ngắn của S3 — nếu công ty bạn cần mức bảo mật cao hơn cho tài liệu nhạy cảm, nên cân nhắc chuyển sang AWS S3 + signed URL.

## Dự án có nhiều phòng ban — migration 011

Đã áp dụng migration 011 trên Neon ngày 26/10/2026 theo xác nhận của chủ
hệ thống, không tạo bản sao lưu theo yêu cầu. Kiểm tra trong transaction xác
nhận dữ liệu dự án, công việc, thành viên, nhân viên và phòng ban không đổi.

Dự án chỉ chọn **các phòng ban tham gia**, không yêu cầu phòng chủ trì.
Dự án chỉ hoàn thành khi mỗi phòng có công việc thực tế và toàn bộ
công việc chưa xóa/hủy đã được nghiệm thu; 100% chờ duyệt vẫn chưa hoàn thành.
Cột `projects.department_id` cũ chỉ giữ để tương thích schema và phạm vi quyền
cũ, không hiển thị hoặc dùng để quyết định hoàn thành dự án.

Migration 011 tạo `project_departments` với khóa ngoại, giữ nguyên dự án,
công việc và nhân viên. Dữ liệu ban đầu lấy từ phòng chủ trì, phòng của công
việc đã liên kết và phòng của nhân viên đang tham gia dự án. Không lấy từ
tài liệu mẫu hoặc tự suy đoán phòng ban.

Sau khi sao lưu và xác nhận đúng database:

```powershell
npm run migrate
```

Lệnh trên chỉ cho chạy local. Với Neon, cần được phê duyệt riêng trước khi chạy
`npm run migrate -- --allow-remote`. Không deploy code yêu cầu schema 11 trước
khi migration thành công. Kiểm tra `SELECT MAX(version) FROM schema_migrations;`
phải trả về 11. Không tự chạy lệnh này vào production chỉ để thử.

Rollback: quay về bản code trước migration; có thể giữ bảng liên kết mới vì
code cũ không sử dụng nó. Không xóa bảng khi vẫn đang dùng code mới. Giữ bản
sao lưu trước migration để khôi phục đầy đủ nếu cần.

## Ngân sách tiền lương tổng — migration 012

- Bảng theo tháng gồm STT, bộ phận/nhóm phòng, số lượng, quỹ lương và ghi chú.
- Mỗi dòng cần ít nhất một phòng ban; hỗ trợ gộp nhiều phòng. Không có dòng
  thuê bằng hoặc khoản chi ngoài phòng ban trong mẫu này.
- Nhập trực tiếp tổng quỹ lương của dòng, không nhân tiếp với số lượng.
  Số lượng và ghi chú có thể để trống. Tổng cộng tính trên toàn bộ kết quả
  theo bộ lọc, không chỉ trang đang mở; dùng số nguyên VND chính xác.
- Không cho tạo dòng mới trùng phòng trong cùng tháng. Ngân sách đã duyệt
  vẫn khóa; sửa phải mở lại và duyệt lại. Xóa mềm/khôi phục giữ nguyên luồng cũ.
- Quyền theo một phòng không được xem tổng tiền của nhóm có phòng khác;
  quản lý quỹ lương gộp nhiều phòng cần quyền ngân sách toàn bộ.

Migration 012 mở rộng `salary_budgets`, thêm `salary_budget_departments`,
cho phép bỏ trống chức vụ/số lượng. Dự toán cũ giữ nguyên số tiền và đánh dấu
`budget_mode='position'`. Không tự chuyển hoặc cộng lại dữ liệu cũ. Khi người
dùng mở sửa và lưu mẫu mới, phiên bản trước vẫn được giữ trong lịch sử.

Local: `npm run migrate`. Neon chỉ chạy `npm run migrate -- --allow-remote`
sau khi được xác nhận riêng cho migration 012. Code mới cần schema 12;
Đã áp dụng migration 012 trên Neon ngày 26/10/2026 theo xác nhận,
không sao lưu. Database khi áp dụng chưa có dòng ngân sách; không nhập số liệu mẫu.
Không tự nhập số tiền trong ảnh vào Neon vì chưa có kỳ ngân sách được chọn.

Rollback giữ nguyên bảng/cột mới và dữ liệu; không DROP bảng khi quay code.
Code cũ không hỗ trợ sửa đầy đủ ngân sách gộp mới, cần trở lại code có hỗ trợ
schema 12 để thao tác các dòng này.

## Xử lý sự cố cài đặt trên Windows

- **Lỗi `EPERM: operation not permitted, rmdir ...`** khi `npm install`: đóng editor/terminal đang mở trong thư mục dự án, xoá thủ công bằng `Remove-Item -Recurse -Force node_modules` (PowerShell) rồi cài lại. Nếu dự án nằm trong thư mục OneDrive, cân nhắc chuyển ra ngoài.
- **Giải nén zip tạo thư mục lồng cấp** (`hr-nextjs\hr-nextjs\...`): dùng đúng thư mục con chứa `package.json`, hoặc copy nội dung ra ngoài rồi xoá thư mục rỗng còn lại.

## Quản lý thưởng

Hai phần chính sách và đề xuất thưởng hiển thị trên cùng một trang, không chia tab.

- Tiền cố định: chọn phòng ban khi lập chính sách; sau khi duyệt, lập tổng thưởng cho phòng trong dự án. Không chia xuống từng người.
- Phần trăm: chọn nhân sự và giá trị làm căn cứ; tiền thưởng tính theo tỷ lệ chính sách đã duyệt, làm tròn đến VND. Có thể giới hạn chính sách theo phòng hoặc áp dụng mọi phòng.
- Hai khoản lưu riêng; không cộng tổng thưởng phòng vào từng nhân sự. Dữ liệu cũ giữ nguyên và đánh dấu khoản thưởng cũ.

Cần migration **013** trước khi dùng code này. Migration chỉ bổ sung `bonus_awards.award_scope`, cho phép `employee_id` trống với thưởng phòng, thêm ràng buộc và index; không xóa hay đổi số tiền cũ. Chạy `npm run migrate` với database local đã cấu hình. Với Neon, chỉ sau khi được xác nhận: `npm run migrate -- --allow-remote`. Lưu ý `.env.local` hiện trỏ Neon; không chạy lệnh trên khi chưa chọn đúng database.

Rollback: giữ schema bổ sung và dữ liệu; không gán nhân sự giả cho thưởng phòng. Nếu cần quay về code cũ, tạm dừng phân hệ thưởng vì code cũ chưa hiểu khoản thưởng không có nhân sự. Không đặt lại NOT NULL khi đã có thưởng phòng.
### Tiến độ công việc dạng nội dung (migration 014)

Tiến độ được nhập bằng chữ tại Báo cáo công việc → phần việc đã chọn → Tiến độ. Nội dung lưu vào `tasks.progress_text`, `task_updates.progress_text` và snapshot của báo cáo. Dữ liệu phần trăm cũ được giữ nguyên để tương thích; nội dung chữ không tự quy đổi thành phần trăm hoặc tự nghiệm thu. Cảnh báo quá hạn vẫn theo ngày hạn; không so sánh nội dung chữ với mốc phần trăm dự kiến.

Áp dụng trên database local đã chọn: `npm run migrate`. Với Neon, chỉ sau khi được xác nhận thay đổi schema: `npm run migrate -- --allow-remote`. Kiểm tra đích kết nối trước khi chạy; `.env.local` hiện trỏ Neon. Migration chỉ thêm hai cột, không xóa dữ liệu. Rollback code có thể giữ hai cột này; không drop cột vì sẽ mất nội dung đã nhập. Báo cáo/phiên bản đã lưu trước migration không bị viết lại.
