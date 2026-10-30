// Usage: npm run hash-password -- "YourStrongPassword"
const bcrypt = require('bcryptjs');

const pwd = process.argv[2];
if (!pwd || pwd.length < 10) {
  console.error('Please provide a password of at least 10 characters:\n  npm run hash-password -- "YourStrongPassword"');
  process.exit(1);
}
const hash = bcrypt.hashSync(pwd, 12);
console.log('\nAdd this line to your .env (or Hostinger environment variables):\n');
// Escape $ for dotenv-expand-safe usage inside double quotes
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
