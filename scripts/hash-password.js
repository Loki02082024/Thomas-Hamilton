// usage: npm run hash-password -- "YourPassword"
const bcrypt = require('bcryptjs');

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Mật khẩu cần ít nhất 10 ký tự. Ví dụ: npm run hash-password -- "MatKhauRatManh2026"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
console.log('\nDán dòng trên vào ADMIN_PASSWORD_HASH trong .env (hoặc biến môi trường trên Hostinger).');
