// Initialises the configured store (MySQL or JSON file) and seeds it if empty.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../src/db');

db.init()
  .then(async () => {
    const products = await db.list('products');
    console.log(`Store "${db.name}" ready — ${products.length} products.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
