const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const site = require('../config/site');
const { formatMoney } = require('../lib/i18n');
const { formToken, verifyFormToken, setAdminCookie, clearAdminCookie, readAdmin, safeEqual } = require('../lib/security');

const router = express.Router();
const SPEC_KEYS = ['programs', 'rollers', 'track', 'zeroGravity', 'airbags', 'heat', 'dimensions', 'weight', 'power', 'warranty'];
const BOOKING_STATUSES = ['new', 'confirmed', 'done', 'cancelled'];

router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.locals.site = site;
  res.locals.admin = readAdmin(req);
  res.locals.csrf = formToken('admin');
  res.locals.money = (v) => formatMoney(v, 'vi');
  res.locals.current = req.path;
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const requireAdmin = (req, res, next) => (res.locals.admin ? next() : res.redirect('/admin/login'));
const checkCsrf = (req, res, next) =>
  verifyFormToken(req.body._csrf, 'admin', 0)
    ? next()
    : res.status(403).send('Invalid form token — please reload the page and try again.');

// ---------- Auth ----------
router.get('/login', (req, res) => {
  if (res.locals.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null, configured: Boolean(process.env.ADMIN_PASSWORD_HASH) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const user = String(req.body.username || '');
  const pass = String(req.body.password || '');
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const ok = hash && safeEqual(user, expectedUser) && (await bcrypt.compare(pass, hash));
  if (!ok) {
    return res.status(401).render('admin/login', {
      error: hash ? 'Sai tên đăng nhập hoặc mật khẩu.' : 'Chưa cấu hình ADMIN_PASSWORD_HASH trong file .env.',
      configured: Boolean(hash),
    });
  }
  setAdminCookie(res, user);
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  clearAdminCookie(res);
  res.redirect('/admin/login');
});

router.use(requireAdmin);

// ---------- Dashboard / bookings ----------
router.get('/', async (req, res, next) => {
  try {
    const [bookings, messages, products, posts] = await Promise.all([
      db.list('bookings'), db.list('messages'), db.list('products'), db.list('posts'),
    ]);
    const filter = BOOKING_STATUSES.includes(req.query.status) ? req.query.status : null;
    const sorted = bookings.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.render('admin/dashboard', {
      bookings: filter ? sorted.filter((b) => b.status === filter) : sorted,
      filter,
      statuses: BOOKING_STATUSES,
      stats: {
        newBookings: bookings.filter((b) => b.status === 'new').length,
        totalBookings: bookings.length,
        newMessages: messages.filter((m) => m.status === 'new').length,
        products: products.length,
        posts: posts.length,
      },
    });
  } catch (e) { next(e); }
});

router.post('/bookings/:id/status', checkCsrf, async (req, res, next) => {
  try {
    if (BOOKING_STATUSES.includes(req.body.status)) await db.update('bookings', req.params.id, { status: req.body.status });
    res.redirect(req.get('referer') || '/admin');
  } catch (e) { next(e); }
});

router.post('/bookings/:id/delete', checkCsrf, async (req, res, next) => {
  try {
    await db.remove('bookings', req.params.id);
    res.redirect('/admin');
  } catch (e) { next(e); }
});

// ---------- Messages ----------
router.get('/messages', async (req, res, next) => {
  try {
    const messages = (await db.list('messages')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.render('admin/messages', { messages });
  } catch (e) { next(e); }
});

router.post('/messages/:id/read', checkCsrf, async (req, res, next) => {
  try {
    await db.update('messages', req.params.id, { status: 'read' });
    res.redirect('/admin/messages');
  } catch (e) { next(e); }
});

router.post('/messages/:id/delete', checkCsrf, async (req, res, next) => {
  try {
    await db.remove('messages', req.params.id);
    res.redirect('/admin/messages');
  } catch (e) { next(e); }
});

// ---------- Products ----------
const s = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
const pair = (body, key, max) => ({ vi: s(body[`${key}_vi`], max), en: s(body[`${key}_en`], max) });
const slugify = (v) =>
  s(v, 120).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lines = (v) => s(v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function productFromForm(body) {
  const hlVi = lines(body.highlights_vi);
  const hlEn = lines(body.highlights_en);
  const specs = {};
  for (const k of SPEC_KEYS) {
    const vi = s(body[`spec_${k}_vi`], 120);
    const en = s(body[`spec_${k}_en`], 120);
    specs[k] = !en || vi === en ? vi : { vi, en };
  }
  const colors = lines(body.colors).map((l) => {
    const [vi, en, hex] = l.split('|').map((x) => x.trim());
    return { name: { vi, en: en || vi }, hex: /^#[0-9a-f]{3,8}$/i.test(hex || '') ? hex : '#888888' };
  });
  return {
    name: s(body.name, 120),
    slug: slugify(body.slug || body.name),
    series: s(body.series, 60),
    price: Number(String(body.price).replace(/\D/g, '')) || 0,
    order: Number(body.order) || 0,
    status: body.status === 'draft' ? 'draft' : 'published',
    featured: body.featured === 'on',
    accent: /^#[0-9a-f]{6}$/i.test(body.accent || '') ? body.accent : '#C9A96E',
    image: s(body.image, 500),
    badge: pair(body, 'badge', 40),
    tagline: pair(body, 'tagline', 160),
    summary: pair(body, 'summary', 400),
    description: pair(body, 'description', 6000),
    highlights: hlVi.map((vi, i) => ({ vi, en: hlEn[i] || vi })),
    specs,
    colors,
  };
}

router.get('/products', async (req, res, next) => {
  try {
    res.render('admin/products', { products: await db.list('products') });
  } catch (e) { next(e); }
});

router.get('/products/new', (req, res) => res.render('admin/product-form', { product: null, specKeys: SPEC_KEYS, error: null }));

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await db.get('products', req.params.id);
    if (!product) return res.redirect('/admin/products');
    res.render('admin/product-form', { product, specKeys: SPEC_KEYS, error: null });
  } catch (e) { next(e); }
});

async function saveProduct(req, res, id) {
  const data = productFromForm(req.body);
  const clash = (await db.list('products')).find((p) => p.slug === data.slug && p.id !== id);
  if (!data.name || !data.slug || clash) {
    return res.status(422).render('admin/product-form', {
      product: { ...data, id }, specKeys: SPEC_KEYS,
      error: clash ? 'Slug đã tồn tại, vui lòng chọn slug khác.' : 'Vui lòng nhập tên sản phẩm.',
    });
  }
  if (id) await db.update('products', id, data);
  else await db.insert('products', data);
  res.redirect('/admin/products');
}

router.post('/products', checkCsrf, (req, res, next) => saveProduct(req, res, null).catch(next));
router.post('/products/:id', checkCsrf, (req, res, next) => saveProduct(req, res, req.params.id).catch(next));
router.post('/products/:id/delete', checkCsrf, async (req, res, next) => {
  try {
    await db.remove('products', req.params.id);
    res.redirect('/admin/products');
  } catch (e) { next(e); }
});

// ---------- Posts ----------
function postFromForm(body) {
  return {
    slug: slugify(body.slug || body.title_vi),
    status: body.status === 'draft' ? 'draft' : 'published',
    date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10),
    order: Number(body.order) || 0,
    readMinutes: Number(body.readMinutes) || 4,
    image: s(body.image, 500),
    category: pair(body, 'category', 60),
    title: pair(body, 'title', 200),
    excerpt: pair(body, 'excerpt', 400),
    body: pair(body, 'body', 30000),
  };
}

router.get('/posts', async (req, res, next) => {
  try {
    res.render('admin/posts', { posts: await db.list('posts') });
  } catch (e) { next(e); }
});
router.get('/posts/new', (req, res) => res.render('admin/post-form', { post: null, error: null }));
router.get('/posts/:id', async (req, res, next) => {
  try {
    const post = await db.get('posts', req.params.id);
    if (!post) return res.redirect('/admin/posts');
    res.render('admin/post-form', { post, error: null });
  } catch (e) { next(e); }
});

async function savePost(req, res, id) {
  const data = postFromForm(req.body);
  const clash = (await db.list('posts')).find((p) => p.slug === data.slug && p.id !== id);
  if (!data.title.vi || !data.slug || clash) {
    return res.status(422).render('admin/post-form', {
      post: { ...data, id }, error: clash ? 'Slug đã tồn tại.' : 'Vui lòng nhập tiêu đề tiếng Việt.',
    });
  }
  if (id) await db.update('posts', id, data);
  else await db.insert('posts', data);
  res.redirect('/admin/posts');
}

router.post('/posts', checkCsrf, (req, res, next) => savePost(req, res, null).catch(next));
router.post('/posts/:id', checkCsrf, (req, res, next) => savePost(req, res, req.params.id).catch(next));
router.post('/posts/:id/delete', checkCsrf, async (req, res, next) => {
  try {
    await db.remove('posts', req.params.id);
    res.redirect('/admin/posts');
  } catch (e) { next(e); }
});

module.exports = router;
