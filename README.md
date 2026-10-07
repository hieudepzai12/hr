# NhanSu — Hệ thống Quản lý Nhân sự (Next.js + Postgres)

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
3. Trên máy triển khai hoặc CI, cấu hình cùng `DATABASE_URL`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` nếu DB mới, rồi chạy `npm run migrate` **trước khi nhận request production**. Lệnh migration có thể chạy lại an toàn. Nếu chưa chạy, ứng dụng sẽ tự chạy một lần khi phát hiện schema còn thiếu; bước này có thể làm request đầu tiên chậm hơn.
4. Vào [vercel.com](https://vercel.com) → **Add New Project** → chọn repo vừa đẩy → Vercel tự nhận diện Next.js, bấm **Deploy**.
5. **Bật Vercel Blob** để lưu file bền vững: vào tab **Storage** của project trên Vercel → **Create Database** → chọn **Blob** → Connect vào project. Vercel sẽ **tự động thêm** biến `BLOB_READ_WRITE_TOKEN` — không cần bạn tự nhập.
6. Redeploy lại (Vercel → Deployments → nút "Redeploy") để áp dụng biến môi trường mới.

Từ giờ, mọi ảnh đại diện và file đính kèm sẽ tự động lưu qua Vercel Blob thay vì đĩa cục bộ — ứng dụng phát hiện `BLOB_READ_WRITE_TOKEN` và chuyển chế độ tự động, không cần sửa code.

## Cấu trúc dự án

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

## Xử lý sự cố cài đặt trên Windows

- **Lỗi `EPERM: operation not permitted, rmdir ...`** khi `npm install`: đóng editor/terminal đang mở trong thư mục dự án, xoá thủ công bằng `Remove-Item -Recurse -Force node_modules` (PowerShell) rồi cài lại. Nếu dự án nằm trong thư mục OneDrive, cân nhắc chuyển ra ngoài.
- **Giải nén zip tạo thư mục lồng cấp** (`hr-nextjs\hr-nextjs\...`): dùng đúng thư mục con chứa `package.json`, hoặc copy nội dung ra ngoài rồi xoá thư mục rỗng còn lại.
