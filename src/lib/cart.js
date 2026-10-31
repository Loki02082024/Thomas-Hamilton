// Cart lives in a signed cookie: [{ s: slug, v: variantIndex, q: qty }].
// Prices are always resolved server-side from the product store.
const { sign, verify, cookieOpts } = require('./security');
const site = require('../config/site');

const COOKIE = 'th_cart';
const MAX_LINES = 20;
const MAX_QTY = 10;

function read(req) {
  const data = verify(req.cookies[COOKIE]);
  return Array.isArray(data?.items) ? data.items : [];
}

function write(req, res, items) {
  const clean = items
    .filter((i) => i && typeof i.s === 'string' && i.q > 0)
    .slice(0, MAX_LINES)
    .map((i) => ({ s: i.s, v: Math.max(0, i.v | 0), q: Math.min(MAX_QTY, i.q | 0) }));
  res.cookie(COOKIE, sign({ items: clean }), cookieOpts(req, 30));
  return clean;
}

function add(items, slug, variant, qty) {
  const line = items.find((i) => i.s === slug && i.v === variant);
  if (line) line.q = Math.min(MAX_QTY, line.q + qty);
  else items.push({ s: slug, v: variant, q: qty });
  return items;
}

/** Join cookie lines with product data; drops lines whose product/variant vanished. */
async function resolve(items, db) {
  const lines = [];
  for (const i of items) {
    const p = await db.products.get(i.s);
    if (!p || p.active === false) continue;
    const variant = p.variants[i.v] || p.variants[0];
    if (!variant) continue;
    lines.push({
      slug: p.slug, name: p.name, image: p.images[0], variantIndex: i.v,
      variant: variant.name, price: variant.price, qty: i.q, total: variant.price * i.q,
      available: p.available !== false && variant.available !== false,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const shipping = lines.length ? site.shippingFee : 0;
  return { lines, count: lines.reduce((s, l) => s + l.qty, 0), subtotal, shipping, total: subtotal + shipping };
}

module.exports = { read, write, add, resolve, MAX_QTY, COOKIE };
