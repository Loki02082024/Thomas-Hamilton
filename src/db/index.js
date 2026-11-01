// Data store: MySQL in production (DB_HOST set), JSON file for local development.
// Both drivers expose the same async API; records are stored as JSON documents.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED = path.join(__dirname, '..', 'data', 'products.tabu.json');
// Products added after launch. Each one is inserted once per database (tracked by slug),
// so deleting it later in Admin does not bring it back on the next restart.
const EXTRA = path.join(__dirname, '..', 'data', 'products.extra.json');
const now = () => new Date().toISOString();
const extraProducts = () => (fs.existsSync(EXTRA) ? JSON.parse(fs.readFileSync(EXTRA, 'utf8')) : []);

function seedProducts() {
  const list = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  return list.map((p, i) => ({
    ...p,
    active: true,
    // the flagship pieces are highlighted on the home page
    featured: /s919|s801|s900|1800a|m2812cn|f600/i.test(p.slug),
    sort: i,
  }));
}

function orderCode() {
  const d = new Date(Date.now() + 7 * 3600e3); // Vietnam date
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  return 'TH' + ymd + crypto.randomInt(1000, 9999);
}

/* ───────────────────────── JSON file driver ───────────────────────── */
function jsonDriver() {
  const FILE = path.join(__dirname, '..', '..', 'data', 'store.json');
  let db;
  const load = () => {
    if (db) return db;
    if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    else db = { products: seedProducts(), orders: [], messages: [], seq: 0 };
    return db;
  };
  let pending = Promise.resolve();
  const save = () => {
    pending = pending.then(() => {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
      fs.renameSync(tmp, FILE);
    });
    return pending;
  };

  return {
    kind: 'json',
    async init() {
      const d = load();
      d.seeded = d.seeded || [];
      for (const p of extraProducts()) {
        if (d.seeded.includes(p.slug)) continue;
        d.seeded.push(p.slug);
        if (!d.products.some((x) => x.slug === p.slug)) d.products.push({ ...p, created_at: now() });
      }
      await save();
    },
    products: {
      async list() { return [...load().products].sort((a, b) => a.sort - b.sort); },
      async get(slug) { return load().products.find((p) => p.slug === slug) || null; },
      async save(p, oldSlug = p.slug) {
        const list = load().products;
        const i = list.findIndex((x) => x.slug === oldSlug);
        if (i >= 0) list[i] = { ...list[i], ...p, updated_at: now() };
        else list.push({ sort: list.length, ...p, created_at: now() });
        await save();
      },
      async remove(slug) { db.products = load().products.filter((p) => p.slug !== slug); await save(); },
    },
    orders: {
      async create(o) {
        const rec = { ...o, code: orderCode(), created_at: now() };
        load().orders.unshift(rec);
        await save();
        return rec;
      },
      async get(code) { return load().orders.find((o) => o.code === code) || null; },
      async list() { return load().orders; },
      async update(code, patch) {
        const o = load().orders.find((x) => x.code === code);
        if (o) Object.assign(o, patch, { updated_at: now() });
        await save();
        return o;
      },
    },
    messages: {
      async create(m) {
        const rec = { ...m, id: ++load().seq, status: 'new', created_at: now() };
        db.messages.unshift(rec);
        await save();
        return rec;
      },
      async list() { return load().messages; },
      async update(id, patch) {
        const m = load().messages.find((x) => x.id === Number(id));
        if (m) Object.assign(m, patch);
        await save();
      },
    },
  };
}

/* ───────────────────────────── MySQL driver ───────────────────────────── */
function mysqlDriver() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    connectionLimit: 5,
    waitForConnections: true,
  });
  const q = async (sql, params) => (await pool.query(sql, params))[0];
  const parse = (row) => (row ? { ...(typeof row.data === 'string' ? JSON.parse(row.data) : row.data) } : null);

  return {
    kind: 'mysql',
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS products (
        slug VARCHAR(160) PRIMARY KEY, sort INT NOT NULL DEFAULT 0,
        data JSON NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) DEFAULT CHARSET=utf8mb4`);
      await q(`CREATE TABLE IF NOT EXISTS orders (
        code VARCHAR(24) PRIMARY KEY, status VARCHAR(24) NOT NULL, payment_status VARCHAR(24) NOT NULL,
        total BIGINT NOT NULL, data JSON NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX (created_at)
      ) DEFAULT CHARSET=utf8mb4`);
      await q(`CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY, data JSON NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) DEFAULT CHARSET=utf8mb4`);
      const [{ n }] = await q('SELECT COUNT(*) n FROM products');
      if (!n) {
        for (const p of seedProducts()) {
          await q('INSERT INTO products (slug, sort, data) VALUES (?, ?, ?)', [p.slug, p.sort, JSON.stringify(p)]);
        }
        console.log('[db] seeded products');
      }
      await q('CREATE TABLE IF NOT EXISTS seeded (slug VARCHAR(160) PRIMARY KEY) DEFAULT CHARSET=utf8mb4');
      for (const p of extraProducts()) {
        const r = await q('INSERT IGNORE INTO seeded (slug) VALUES (?)', [p.slug]);
        if (!r.affectedRows) continue;
        const rec = { ...p, created_at: now() };
        await q('INSERT IGNORE INTO products (slug, sort, data) VALUES (?, ?, ?)', [rec.slug, rec.sort, JSON.stringify(rec)]);
        console.log('[db] added product', p.slug);
      }
    },
    products: {
      async list() { return (await q('SELECT data FROM products ORDER BY sort, slug')).map(parse); },
      async get(slug) { return parse((await q('SELECT data FROM products WHERE slug = ?', [slug]))[0]); },
      async save(p, oldSlug = p.slug) {
        const existing = await this.get(oldSlug);
        const rec = existing ? { ...existing, ...p, updated_at: now() } : { sort: 999, ...p, created_at: now() };
        if (existing) {
          await q('UPDATE products SET slug = ?, sort = ?, data = ? WHERE slug = ?', [rec.slug, rec.sort, JSON.stringify(rec), oldSlug]);
        } else {
          await q('INSERT INTO products (slug, sort, data) VALUES (?, ?, ?)', [rec.slug, rec.sort, JSON.stringify(rec)]);
        }
      },
      async remove(slug) { await q('DELETE FROM products WHERE slug = ?', [slug]); },
    },
    orders: {
      async create(o) {
        const rec = { ...o, code: orderCode(), created_at: now() };
        await q('INSERT INTO orders (code, status, payment_status, total, data) VALUES (?, ?, ?, ?, ?)',
          [rec.code, rec.status, rec.payment_status, rec.total, JSON.stringify(rec)]);
        return rec;
      },
      async get(code) { return parse((await q('SELECT data FROM orders WHERE code = ?', [code]))[0]); },
      async list() { return (await q('SELECT data FROM orders ORDER BY created_at DESC LIMIT 500')).map(parse); },
      async update(code, patch) {
        const o = await this.get(code);
        if (!o) return null;
        Object.assign(o, patch, { updated_at: now() });
        await q('UPDATE orders SET status = ?, payment_status = ?, data = ? WHERE code = ?',
          [o.status, o.payment_status, JSON.stringify(o), code]);
        return o;
      },
    },
    messages: {
      async create(m) {
        const rec = { ...m, status: 'new', created_at: now() };
        const r = await q('INSERT INTO messages (data) VALUES (?)', [JSON.stringify(rec)]);
        return { ...rec, id: r.insertId };
      },
      async list() {
        return (await q('SELECT id, data FROM messages ORDER BY id DESC LIMIT 500')).map((r) => ({ ...parse(r), id: r.id }));
      },
      async update(id, patch) {
        const row = (await q('SELECT data FROM messages WHERE id = ?', [id]))[0];
        if (!row) return;
        await q('UPDATE messages SET data = ? WHERE id = ?', [JSON.stringify({ ...parse(row), ...patch }), id]);
      },
    },
  };
}

module.exports = process.env.DB_HOST ? mysqlDriver() : jsonDriver();
