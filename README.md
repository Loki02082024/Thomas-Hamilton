# THOMAS HAMILTON — Website ghế massage cao cấp

Website thương hiệu song ngữ (Tiếng Việt / English) cho hãng ghế massage cao cấp THOMAS HAMILTON.
Xây dựng bằng **Node.js + Express + EJS** (render phía server, tốt cho SEO), kèm trang quản trị.

## Tính năng

- **13 trang công khai**: Trang chủ (dạng kể chuyện khi cuộn), Bộ sưu tập + lọc theo dòng, Chi tiết sản phẩm (chọn màu, thông số), So sánh tối đa 3 mẫu, Công nghệ, Câu chuyện thương hiệu, Showroom (bản đồ), Đặt lịch trải nghiệm, Liên hệ, Tạp chí + bài viết, Bảo hành, FAQ, trang 404
- **Song ngữ** theo URL: `/vi/...` và `/en/...`, có `hreflang`, sitemap song ngữ, dữ liệu có cấu trúc JSON-LD (Organization, Product, Article, FAQPage)
- **Form đặt lịch / liên hệ / nhận tin**: kiểm tra lỗi ngay tại từng ô, chống spam (honeypot, token có hạn, giới hạn tần suất), vẫn hoạt động khi tắt JavaScript, có thể gửi email thông báo qua SMTP
- **Trang quản trị** `/admin`: quản lý lịch đặt (đổi trạng thái), tin nhắn, sản phẩm (CRUD song ngữ), bài viết (CRUD)
- **Lưu trữ**: MySQL khi chạy production (Hostinger); khi chạy ở máy cá nhân tự dùng file JSON `data/store.json`. Dữ liệu mẫu được nạp tự động ở lần chạy đầu tiên
- **Bảo mật**: Helmet + CSP, cookie admin ký HMAC (httpOnly, SameSite=Strict), mật khẩu bcrypt, CSRF token cho mọi thao tác admin
- **Hiệu năng & a11y**: không dùng framework phía client (~6 KB JS), nén gzip, cache tĩnh, tôn trọng `prefers-reduced-motion`, focus rõ ràng, vùng chạm ≥ 44px, tương phản đạt WCAG AA

## Chạy ở máy cá nhân

```bash
npm install
cp .env.example .env          # rồi sửa các giá trị
npm run hash-password -- "MatKhauAdminCuaBan"   # dán kết quả vào ADMIN_PASSWORD_HASH trong .env
npm run dev                   # http://localhost:3000
```

Để trống `DB_HOST` thì dữ liệu được lưu trong `data/store.json`. Muốn nạp lại dữ liệu mẫu thì xoá file này.

## Cấu trúc thư mục

```
server.js                 Điểm khởi động (Hostinger chạy file này)
src/config/site.js        Hotline, email, Zalo, mạng xã hội, tên công ty  ← SỬA TRƯỚC KHI RA MẮT
src/i18n/vi.js, en.js     Toàn bộ chữ trên giao diện
src/data/seed.json        Dữ liệu mẫu: sản phẩm, bài viết, showroom, FAQ
src/db/index.js           Kho dữ liệu MySQL / file JSON
src/routes/               public.js, admin.js, seo.js (sitemap, robots)
views/                    Template EJS (pages/, partials/, admin/)
public/                   CSS, JS, ảnh
design-system/            Design system (màu, font, quy tắc UI)
```

## Thay hình minh hoạ bằng ảnh thật

Hiện mỗi sản phẩm dùng hình minh hoạ SVG vẽ bằng code. Khi có ảnh chụp sản phẩm:

1. Đặt ảnh (khuyên dùng WebP, nền trong suốt hoặc tối, khoảng 1600×1200) vào `public/img/products/`
2. Vào `/admin` → Sản phẩm → Sửa → ô **Ảnh sản phẩm** điền `/img/products/ten-anh.webp`

Bài viết cũng có ô **Ảnh bìa** tương tự.

---

## Đẩy code lên GitHub

```bash
git remote add origin https://github.com/<tai-khoan>/thomas-hamilton.git
git push -u origin main
```

> File `.env` và `data/store.json` đã nằm trong `.gitignore`, nên không bị đẩy lên GitHub.

## Deploy lên Hostinger (gói Business / Cloud)

### 1. Tạo database MySQL
hPanel → **Websites** → chọn website → **Databases → MySQL Databases** → tạo database và user. Ghi lại *tên database, user, mật khẩu*. Host thường là `localhost`.

### 2. Tạo ứng dụng Node.js từ GitHub
hPanel → **Websites → Add website → Node.js Apps** → **Import Git repository** → kết nối GitHub và chọn repo `thomas-hamilton`.

Cấu hình build (tên các mục có thể hơi khác tuỳ phiên bản hPanel):

| Mục | Giá trị |
|---|---|
| Framework | Express / Other |
| Node.js version | 20.x hoặc 22.x |
| Root directory | `/` |
| Entry file | `server.js` |
| Build command | `npm install` |
| Start command | `npm start` |

### 3. Khai báo biến môi trường
Trong phần **Environment variables** của ứng dụng, thêm các biến sau (xem `.env.example`):

```
NODE_ENV=production
SITE_URL=https://ten-mien-cua-ban.vn
SESSION_SECRET=<chuỗi ngẫu nhiên dài>
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=<kết quả của npm run hash-password>
DB_HOST=localhost
DB_PORT=3306
DB_USER=<user MySQL>
DB_PASSWORD=<mật khẩu MySQL>
DB_NAME=<tên database>
# Tuỳ chọn, để nhận email khi có lịch đặt mới:
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=concierge@ten-mien.vn
SMTP_PASS=<mật khẩu email>
NOTIFY_EMAIL=sales@ten-mien.vn
```

Không cần đặt `PORT`, Hostinger tự cấp. Ở lần chạy đầu, ứng dụng tự tạo bảng `th_documents` và nạp dữ liệu mẫu.

### 4. Tên miền & SSL
Trỏ tên miền vào ứng dụng, sau đó bật **SSL** (miễn phí) trong hPanel.

### 5. Cập nhật về sau
Mỗi lần `git push` lên nhánh `main`, Hostinger sẽ tự build lại (nếu bật auto-deploy), hoặc bạn bấm **Redeploy** trong hPanel.

### Phương án thay thế: VPS
```bash
git clone https://github.com/<tai-khoan>/thomas-hamilton.git && cd thomas-hamilton
npm ci --omit=dev && cp .env.example .env && nano .env
npm i -g pm2 && pm2 start server.js --name thomas-hamilton && pm2 save
```
Sau đó cấu hình Nginx reverse proxy tới cổng 3000 và cài SSL bằng Certbot.

## Checklist trước khi ra mắt

- [ ] Sửa `src/config/site.js`: hotline, email, Zalo, mạng xã hội, mã số thuế
- [ ] Thay địa chỉ showroom thật trong admin hoặc `src/data/seed.json` (trước lần chạy đầu)
- [ ] Thay giá, thông số và ảnh sản phẩm thật
- [ ] Thay lời chứng thực khách hàng (trong `src/i18n/*.js`) bằng nội dung thật và được khách đồng ý
- [ ] Đặt `SESSION_SECRET` và mật khẩu admin mạnh
- [ ] Thêm ảnh chia sẻ mạng xã hội `public/img/og.png` (1200×630) và khai báo lại thẻ `og:image` trong `views/partials/head.ejs`
- [ ] Gửi `https://ten-mien/sitemap.xml` lên Google Search Console
