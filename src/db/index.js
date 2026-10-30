// Document store with two interchangeable backends:
//   - MySQL (production, when DB_HOST is set) — one table holding JSON documents
//   - JSON file (local development fallback) — data/store.json
// Collections: products, posts, showrooms, faqs, bookings, messages
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'store.json');
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed.json');

const newId = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();
const sortDocs = (docs) =>
  docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(b.createdAt).localeCompare(String(a.createdAt)));

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
}

// ---------- JSON file backend ----------
function fileBackend() {
  let cache = null;
  const read = () => {
    if (cache) return cache;
    if (!fs.existsSync(STORE_FILE)) {
      fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
      const seed = loadSeed();
      cache = {};
      for (const [col, docs] of Object.entries(seed)) {
        cache[col] = docs.map((d) => ({ id: d.id || newId(), createdAt: now(), ...d }));
      }
      fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));
    } else {
      cache = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    }
    return cache;
  };
  const write = () => fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));

  return {
    name: 'json-file',
    async init() { read(); },
    async list(col) { return sortDocs([...(read()[col] || [])]); },
    async get(col, id) { return (read()[col] || []).find((d) => d.id === id) || null; },
    async insert(col, data) {
      const store = read();
      const doc = { id: newId(), createdAt: now(), updatedAt: now(), ...data };
      (store[col] ||= []).push(doc);
      write();
      return doc;
    },
    async update(col, id, data) {
      const docs = read()[col] || [];
      const i = docs.findIndex((d) => d.id === id);
      if (i < 0) return null;
      docs[i] = { ...docs[i], ...data, id, updatedAt: now() };
      write();
      return docs[i];
    },
    async remove(col, id) {
      const store = read();
      store[col] = (store[col] || []).filter((d) => d.id !== id);
      write();
    },
  };
}

// ---------- MySQL backend ----------
function mysqlBackend() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
  });
  const parse = (row) => {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return { ...data, id: row.id, createdAt: row.created_at?.toISOString?.() ?? row.created_at };
  };

  return {
    name: 'mysql',
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS th_documents (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        collection VARCHAR(32) NOT NULL,
        data JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_collection (collection)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM th_documents');
      if (n === 0) {
        const seed = loadSeed();
        for (const [col, docs] of Object.entries(seed)) {
          for (const d of docs) {
            const { id = newId(), ...rest } = d;
            await pool.query('INSERT INTO th_documents (id, collection, data) VALUES (?, ?, ?)', [id, col, JSON.stringify(rest)]);
          }
        }
      }
    },
    async list(col) {
      const [rows] = await pool.query('SELECT * FROM th_documents WHERE collection = ?', [col]);
      return sortDocs(rows.map(parse));
    },
    async get(col, id) {
      const [rows] = await pool.query('SELECT * FROM th_documents WHERE collection = ? AND id = ?', [col, id]);
      return rows[0] ? parse(rows[0]) : null;
    },
    async insert(col, data) {
      const id = newId();
      const { id: _ignored, createdAt, ...rest } = data;
      await pool.query('INSERT INTO th_documents (id, collection, data) VALUES (?, ?, ?)', [id, col, JSON.stringify(rest)]);
      return this.get(col, id);
    },
    async update(col, id, data) {
      const current = await this.get(col, id);
      if (!current) return null;
      const { id: _i, createdAt, ...rest } = { ...current, ...data };
      await pool.query('UPDATE th_documents SET data = ? WHERE collection = ? AND id = ?', [JSON.stringify(rest), col, id]);
      return this.get(col, id);
    },
    async remove(col, id) {
      await pool.query('DELETE FROM th_documents WHERE collection = ? AND id = ?', [col, id]);
    },
  };
}

const db = process.env.DB_HOST ? mysqlBackend() : fileBackend();

// Convenience lookups
db.findBy = async (col, field, value) => (await db.list(col)).find((d) => d[field] === value) || null;

module.exports = db;
