# THOMAS HAMILTON — Website ghế massage cao cấp (v2 · Sumi-e)

Website thương mại điện tử song ngữ **Tiếng Việt / 日本語** cho thương hiệu ghế massage cao cấp THOMAS HAMILTON,
phong cách **Sumi-e** (tranh mực Nhật Bản): nền mực than, giấy washi, vàng kim, con dấu hanko đỏ.

**Công nghệ:** Node.js + Express + EJS (render phía server, tốt cho SEO) · MySQL · GSAP + Lenis · VNPay · Nodemailer.

## Tính năng

| Phần | Nội dung |
|---|---|
| Trang công khai | Trang chủ kể chuyện khi cuộn, Bộ sưu tập (lọc thương hiệu / khoảng giá, sắp xếp), Chi tiết sản phẩm (gallery phóng to, chọn màu, thông số), Giỏ hàng, Đặt hàng, Trạng thái đơn, Triết lý, Showroom, Liên hệ & đặt lịch trải nghiệm, Chính sách, 404 |
| Song ngữ | URL `/vi/...` và `/ja/...`, nút chuyển ngôn ngữ giữ nguyên trang, `hreflang`, sitemap song ngữ |
| Sản phẩm | 27 mẫu lấy từ tabu.com.vn (ảnh, giá, giá gốc, màu, thông số, bài mô tả), ảnh đã tối ưu sang WebP (90 MB → 15 MB) |
| Giỏ hàng | Lưu trong cookie có chữ ký (không giả mạo giá được — giá luôn tính lại ở server), drawer trượt, vẫn chạy khi tắt JavaScript |
| Thanh toán | COD · Chuyển khoản + mã VietQR tự động · **VNPay** (có IPN, kiểm tra chữ ký, số tiền, chống xử lý lặp) |
| Email | Báo đơn mới / liên hệ mới về `ORDER_NOTIFY_EMAIL`, gửi xác nhận cho khách (nếu khách nhập email) |
| Admin `/admin` | Tổng quan doanh thu, quản lý đơn (trạng thái, thanh toán, ghi chú), CRUD sản phẩm + tải ảnh, liên hệ & đăng ký nhận tin |
| Bảo mật | Helmet + CSP, CSRF cho mọi form, cookie ký HMAC, mật khẩu bcrypt, giới hạn tần suất (đăng nhập, đặt hàng, liên hệ), honeypot chống spam |

### Hiệu ứng thị giác

1. **Tranh cuộn kakejiku** ở hero: cuộn giấy washi mở xuống, ghế hiện ra như **mực loang** trên giấy ướt (SVG turbulence mask)
2. **Vệt cọ mực vàng** đi theo con trỏ chuột (chỉ trên máy tính)
3. **Bụi vàng** lơ lửng trong hero (tự dừng khi cuộn khỏi màn hình)
4. **Chữ được "thấm mực" từng từ** khi cuộn qua đoạn tuyên ngôn 間 (Ma)
5. **Vòng Ensō** tự vẽ bằng nét cọ theo thanh cuộn
6. **Gallery cuộn ngang** được ghim trên máy tính, vuốt ngang trên điện thoại
7. **Cửa shoji** trượt đóng/mở khi chuyển trang, kèm con dấu 匠
8. Thẻ sản phẩm **nghiêng 3D + loang mực** theo con trỏ; chữ dọc (tategaki); vân giấy washi phủ toàn trang

Tất cả hiệu ứng tự tắt khi người dùng bật *Giảm chuyển động* (`prefers-reduced-motion`). Website vẫn dùng đầy đủ khi tắt JavaScript.

## Chạy ở máy cá nhân

```bash
npm install
cp .env.example .env
npm run hash-password -- "MatKhauAdminCuaBan"   # dán kết quả vào ADMIN_PASSWORD_HASH
npm run dev                                      # http://localhost:3000
```

Để trống `DB_HOST` thì dữ liệu lưu vào `data/store.json` (tự nạp 27 sản phẩm ở lần chạy đầu). Xoá file này để nạp lại từ đầu.

## Deploy lên Hostinger (gói Business / Cloud — Node.js Web App)

### 1. Tạo database MySQL
hPanel → **Databases → MySQL Databases** → tạo database + user. Ghi lại *tên database, user, mật khẩu*.
Host thường là `localhost` khi app và database cùng gói hosting.

### 2. Tạo email gửi thông báo (tuỳ chọn nhưng nên có)
hPanel → **Emails** → tạo hộp thư, ví dụ `no-reply@tenmien.vn`. SMTP: `smtp.hostinger.com`, cổng `465`.
> Chưa có tên miền thì có thể dùng tạm Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=` địa chỉ Gmail, `SMTP_PASS=` **App Password** (Google Account → Security → App passwords).

### 3. Tạo Node.js app từ GitHub
hPanel → **Websites → Add website → Node.js Apps** → **Import Git repository** → kết nối GitHub → chọn repo
`Thomas-Hamilton` và nhánh chứa bản này. Cấu hình:

| Mục | Giá trị |
|---|---|
| Framework | Express (hoặc Other) |
| Node version | 20 hoặc 22 |
| Entry file | `server.js` |
| Build / install | `npm install` |
| Start command | `npm start` |

### 4. Khai báo biến môi trường
Trong phần **Environment variables** của app, nhập các biến trong `.env.example`. Bắt buộc:

```
NODE_ENV=production
SITE_URL=https://<ten-mien-tam-hoac-that>
SESSION_SECRET=<chuỗi ngẫu nhiên dài>
ADMIN_EMAIL=quangcaohoanganh6688@gmail.com
ADMIN_PASSWORD_HASH=<kết quả npm run hash-password>
DB_HOST=localhost
DB_USER=... DB_PASSWORD=... DB_NAME=...
UPLOAD_DIR=/home/<user>/th-uploads
```

Bấm **Deploy**. Lần chạy đầu, app tự tạo bảng MySQL và nạp 27 sản phẩm. Kiểm tra: `https://<domain>/healthz` → `{"ok":true,"db":"mysql"}`.

Chưa có tên miền: Hostinger cấp tên miền tạm dạng `xxx.hostingersite.com` — dùng nó cho `SITE_URL`, khi gắn tên miền thật chỉ cần sửa lại biến này.

### 5. Bật VNPay
1. Đăng ký sandbox miễn phí: https://sandbox.vnpayment.vn/devreg/ → nhận `TMN Code` + `Hash Secret` qua email.
2. Điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` → redeploy. Lựa chọn VNPay tự xuất hiện ở trang đặt hàng.
3. Trong cổng quản trị merchant của VNPay, khai báo **IPN URL**: `https://<domain>/payment/vnpay/ipn`
4. Thẻ test sandbox: ngân hàng **NCB**, số thẻ `9704198526191432198`, tên `NGUYEN VAN A`, ngày phát hành `07/15`, OTP `123456`.
5. Khi ký hợp đồng chính thức: đổi sang key thật và `VNPAY_URL=https://pay.vnpay.vn/vpcpay.html`.

### 6. Chuyển khoản / VietQR
Điền `BANK_BIN` (mã BIN ngân hàng, ví dụ Vietcombank `970436`, Techcombank `970407`, MB `970422`),
`BANK_NAME`, `BANK_ACCOUNT`, `BANK_HOLDER` → lựa chọn "Chuyển khoản" xuất hiện, trang đơn hàng hiện mã QR có sẵn số tiền + mã đơn.

## Cấu trúc thư mục

```
server.js                   Điểm khởi động (Hostinger chạy file này)
src/config/site.js          Hotline, email, địa chỉ, showroom, mạng xã hội  ← sửa thông tin liên hệ ở đây
src/i18n/vi.js, ja.js       Toàn bộ chữ trên giao diện (Việt / Nhật)
src/data/products.tabu.json Dữ liệu sản phẩm gốc (chỉ dùng để nạp lần đầu)
src/db/index.js             MySQL (production) / file JSON (máy cá nhân)
src/lib/                    cart, vnpay, mailer, security, i18n
src/routes/                 public.js, shop.js (giỏ hàng, đặt hàng, VNPay), admin.js, seo.js
views/                      Template EJS: pages/, partials/, admin/
public/css, public/js       main.css (design system), main.js (hiệu ứng), boot.js
public/img/products/        272 ảnh sản phẩm WebP
design-system/              Design system Sumi-e (màu, font, hiệu ứng, quy tắc a11y)
scripts/                    hash-password.js, optimize-images.js
```

## Ghi chú

- Mô tả chi tiết sản phẩm (bài viết dài) hiện chỉ có tiếng Việt; trang tiếng Nhật hiển thị tóm tắt tiếng Nhật tự sinh từ
  thông số (con lăn, túi khí, trục SL, số chương trình) và ghi chú rằng phần chi tiết đang là tiếng Việt.
- Ảnh tải lên từ Admin lưu ở `UPLOAD_DIR` — đặt ngoài thư mục app để redeploy không làm mất ảnh.
- Thêm ảnh mới vào `public/img/products/` rồi chạy `npm run optimize-images` để chuyển sang WebP.
