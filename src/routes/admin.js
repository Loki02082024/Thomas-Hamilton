const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, verify, requireCsrf, cookieOpts, safeEqual } = require('../lib/security');
const { money } = require('../lib/i18n');
const vi = require('../i18n/vi');

const COOKIE = 'th_admin';
const STATUSES = Object.keys(vi.order.statuses);
const PAYMENTS = ['unpaid', 'paid', 'failed', 'refunded'];

module.exports = function adminRouter({ uploadDir }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 20 },
    fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype)),
  });
  const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 10, standardHeaders: true, legacyHeaders: false });

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.locals.money = money;
    res.locals.vi = vi;
    res.locals.admin = verify(req.cookies[COOKIE]);
    next();
  });

  router.get('/login', (req, res) => res.render('admin/login', { error: null, email: '' }));

  router.post('/login', loginLimiter, requireCsrf, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const hash = process.env.ADMIN_PASSWORD_HASH || '';
    const okEmail = safeEqual(email, String(process.env.ADMIN_EMAIL || '').toLowerCase());
    const okPass = hash ? await bcrypt.compare(String(req.body.password || ''), hash) : false;
    if (!okEmail || !okPass) {
      return res.status(401).render('admin/login', { error: hash ? 'Email hoặc mật khẩu không đúng.' : 'Chưa cấu hình ADMIN_PASSWORD_HASH trong .env', email });
    }
    res.cookie(COOKIE, sign({ email, exp: Date.now() + 12 * 3600e3 }), { ...cookieOpts(req, 0.5), sameSite: 'strict', path: '/admin' });
    res.redirect(303, '/admin');
  });

  router.post('/logout', requireCsrf, (req, res) => {
    res.clearCookie(COOKIE, { path: '/admin' });
    res.redirect(303, '/admin/login');
  });

  router.use((req, res, next) => (res.locals.admin ? next() : res.redirect(303, '/admin/login')));

  /* ─────────── dashboard ─────────── */
  router.get('/', async (req, res) => {
    const [orders, products, messages] = await Promise.all([db.orders.list(), db.products.list(), db.messages.list()]);
    const live = orders.filter((o) => o.status !== 'cancelled');
    const month = new Date().toISOString().slice(0, 7);
    res.render('admin/dashboard', {
      section: 'dashboard',
      stats: {
        newOrders: orders.filter((o) => o.status === 'new').length,
        revenueMonth: live.filter((o) => o.created_at.startsWith(month) && o.payment_status === 'paid').reduce((s, o) => s + o.total, 0),
        pipeline: live.filter((o) => o.status !== 'done').reduce((s, o) => s + o.total, 0),
        products: products.length,
        newMessages: messages.filter((m) => m.status === 'new').length,
      },
      recent: orders.slice(0, 8),
    });
  });

  /* ─────────── orders ─────────── */
  router.get('/orders', async (req, res) => {
    const { status = '' } = req.query;
    let orders = await db.orders.list();
    if (status) orders = orders.filter((o) => o.status === status);
    res.render('admin/orders', { section: 'orders', orders, status, statuses: STATUSES });
  });

  router.get('/orders/:code', async (req, res, next) => {
    const order = await db.orders.get(req.params.code);
    if (!order) return next();
    res.render('admin/order', { section: 'orders', order, statuses: STATUSES, payments: PAYMENTS, saved: req.query.saved });
  });

  router.post('/orders/:code', requireCsrf, async (req, res) => {
    const patch = {};
    if (STATUSES.includes(req.body.status)) patch.status = req.body.status;
    if (PAYMENTS.includes(req.body.payment_status)) patch.payment_status = req.body.payment_status;
    patch.admin_note = String(req.body.admin_note || '').slice(0, 2000);
    await db.orders.update(req.params.code, patch);
    res.redirect(303, `/admin/orders/${req.params.code}?saved=1`);
  });

  /* ─────────── products ─────────── */
  router.get('/products', async (req, res) => {
    res.render('admin/products', { section: 'products', products: await db.products.list(), saved: req.query.saved });
  });

  const blank = { slug: '', name: '', model: '', brand: 'Thomas Hamilton', price: 0, compare: 0, available: true, active: true, featured: false, sort: 999, variants: [{ name: '', price: 0, compare: 0, available: true }], images: [], specs: [], features: [], highlights: {}, summary_vi: '', body_vi: '' };

  router.get('/products/new', (req, res) => res.render('admin/product-form', { section: 'products', p: blank, isNew: true, error: null }));

  router.get('/products/:slug', async (req, res, next) => {
    const p = await db.products.get(req.params.slug);
    if (!p) return next();
    res.render('admin/product-form', { section: 'products', p, isNew: false, error: null });
  });

  const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  const int = (v) => Math.max(0, Math.round(Number(String(v).replace(/[^\d]/g, '')) || 0));
  const lines = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  async function saveProduct(req, res) {
    const isNew = !req.params.slug;
    const old = isNew ? null : await db.products.get(req.params.slug);
    const b = req.body;
    // variants: one per line → "Tên màu | giá | giá gốc"
    const variants = lines(b.variants).map((l) => {
      const [name, price, compare] = l.split('|').map((x) => x.trim());
      return { name: name === '-' ? '' : name, price: int(price), compare: int(compare), available: true };
    });
    const uploaded = (req.files || []).map((f) => '/uploads/' + f.filename);
    const p = {
      slug: slugify(b.slug || b.name),
      name: String(b.name || '').trim().slice(0, 160),
      model: String(b.model || '').trim().slice(0, 80),
      brand: String(b.brand || '').trim().slice(0, 80),
      active: b.active === 'on', featured: b.featured === 'on', available: b.available === 'on',
      sort: int(b.sort),
      variants: variants.length ? variants : [{ name: '', price: int(b.price), compare: int(b.compare), available: true }],
      images: [...lines(b.images), ...uploaded],
      specs: lines(b.specs).map((l) => { const i = l.indexOf(':'); return i > 0 ? { k: l.slice(0, i).trim(), v: l.slice(i + 1).trim() } : null; }).filter(Boolean),
      features: [].concat(b.features || []).filter((f) => Object.keys(vi.features).includes(f)),
      highlights: {
        ...(b.h_rollers ? { rollers: String(b.h_rollers).slice(0, 4) } : {}),
        ...(int(b.h_airbags) ? { airbags: int(b.h_airbags) } : {}),
        ...(int(b.h_programs) ? { programs: int(b.h_programs) } : {}),
        ...(int(b.h_track) ? { track: int(b.h_track) } : {}),
      },
      summary_vi: String(b.summary_vi || '').trim().slice(0, 600),
      body_vi: String(b.body_vi || ''),
    };
    p.price = Math.min(...p.variants.map((v) => v.price));
    const compare = Math.max(...p.variants.map((v) => v.compare));
    p.compare = compare > p.price ? compare : 0;

    let error = null;
    if (!p.name || !p.slug) error = 'Vui lòng nhập tên sản phẩm.';
    else if (!p.price) error = 'Vui lòng nhập giá bán.';
    else if (p.slug !== req.params.slug && await db.products.get(p.slug)) error = 'Đường dẫn (slug) đã tồn tại.';
    if (error) return res.status(422).render('admin/product-form', { section: 'products', p: { ...(old || blank), ...p }, isNew, error });

    await db.products.save(p, isNew ? p.slug : req.params.slug);
    res.redirect(303, '/admin/products?saved=1');
  }

  // multer must parse multipart before the CSRF check can read _csrf
  router.post('/products/new', upload.array('uploads', 20), requireCsrf, saveProduct);
  router.post('/products/:slug', upload.array('uploads', 20), requireCsrf, saveProduct);

  router.post('/products/:slug/delete', requireCsrf, async (req, res) => {
    await db.products.remove(req.params.slug);
    res.redirect(303, '/admin/products?saved=1');
  });

  /* ─────────── messages ─────────── */
  router.get('/messages', async (req, res) => {
    res.render('admin/messages', { section: 'messages', messages: await db.messages.list() });
  });

  router.post('/messages/:id', requireCsrf, async (req, res) => {
    await db.messages.update(req.params.id, { status: req.body.status === 'done' ? 'done' : 'new' });
    res.redirect(303, '/admin/messages');
  });

  return router;
};
