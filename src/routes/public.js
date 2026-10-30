const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { formToken, verifyFormToken } = require('../lib/security');
const { notify } = require('../lib/mailer');

const router = express.Router();
const L = ':lang(vi|en)';

const published = (docs) => docs.filter((d) => d.status !== 'draft');
const wantsJson = (req) => (req.get('accept') || '').includes('application/json');

const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

// Every page gets a fresh form token for the footer newsletter + forms
router.use((req, res, next) => {
  res.locals.formToken = formToken();
  next();
});

router.get('/', (req, res) => {
  const prefersEn = /^en/i.test(req.get('accept-language') || '') && !/vi/i.test(req.get('accept-language') || '');
  res.redirect(302, prefersEn ? '/en' : '/vi');
});

router.get(`/${L}`, async (req, res, next) => {
  try {
    const [products, posts] = await Promise.all([db.list('products'), db.list('posts')]);
    res.render('pages/home', {
      products: published(products),
      featured: published(products).filter((p) => p.featured).slice(0, 3),
      posts: published(posts).slice(0, 3),
      bodyClass: 'is-home',
    });
  } catch (e) { next(e); }
});

// ---------- Collection ----------
router.get(`/${L}/collection`, async (req, res, next) => {
  try {
    const all = published(await db.list('products'));
    const series = [...new Set(all.map((p) => p.series))];
    const active = series.includes(req.query.series) ? req.query.series : null;
    res.render('pages/collection', {
      pageTitle: res.locals.t.nav.collection,
      products: active ? all.filter((p) => p.series === active) : all,
      series,
      active,
    });
  } catch (e) { next(e); }
});

router.get(`/${L}/collection/:slug`, async (req, res, next) => {
  try {
    const all = published(await db.list('products'));
    const product = all.find((p) => p.slug === req.params.slug);
    if (!product) return next();
    const related = all.filter((p) => p.id !== product.id).slice(0, 3);
    res.render('pages/product', {
      pageTitle: product.name,
      pageDescription: res.locals.tr(product.summary),
      product,
      related,
    });
  } catch (e) { next(e); }
});

router.get(`/${L}/compare`, async (req, res, next) => {
  try {
    const all = published(await db.list('products'));
    // ?m=a,b,c (JS) or ?m0=a&m1=b&m2=c (no-JS form submit)
    const wanted = req.query.m
      ? String(req.query.m).split(',').filter(Boolean)
      : [req.query.m0, req.query.m1, req.query.m2].filter((v) => typeof v === 'string' && v);
    let picks = wanted.map((s) => all.find((p) => p.slug === s)).filter(Boolean).slice(0, 3);
    if (picks.length < 2) picks = all.slice(0, 3);
    res.render('pages/compare', { pageTitle: res.locals.t.compare.title, all, picks });
  } catch (e) { next(e); }
});

// ---------- Brand pages ----------
router.get(`/${L}/technology`, (req, res) => res.render('pages/technology', { pageTitle: res.locals.t.nav.technology }));
router.get(`/${L}/story`, (req, res) => res.render('pages/story', { pageTitle: res.locals.t.nav.story }));
router.get(`/${L}/warranty`, (req, res) => res.render('pages/warranty', { pageTitle: res.locals.t.warranty.eyebrow }));

router.get(`/${L}/faq`, async (req, res, next) => {
  try {
    res.render('pages/faq', { pageTitle: res.locals.t.faq.eyebrow, faqs: await db.list('faqs') });
  } catch (e) { next(e); }
});

router.get(`/${L}/showrooms`, async (req, res, next) => {
  try {
    res.render('pages/showrooms', { pageTitle: res.locals.t.nav.showrooms, showrooms: await db.list('showrooms') });
  } catch (e) { next(e); }
});

// ---------- Journal ----------
router.get(`/${L}/journal`, async (req, res, next) => {
  try {
    res.render('pages/journal', { pageTitle: res.locals.t.nav.journal, posts: published(await db.list('posts')) });
  } catch (e) { next(e); }
});

router.get(`/${L}/journal/:slug`, async (req, res, next) => {
  try {
    const posts = published(await db.list('posts'));
    const post = posts.find((p) => p.slug === req.params.slug);
    if (!post) return next();
    res.render('pages/post', {
      pageTitle: res.locals.tr(post.title),
      pageDescription: res.locals.tr(post.excerpt),
      post,
      more: posts.filter((p) => p.id !== post.id).slice(0, 2),
    });
  } catch (e) { next(e); }
});

// ---------- Booking ----------
const PHONE_RE = /^(\+?84|0)(3|5|7|8|9|2)\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const todayISO = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // Vietnam time

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

async function bookingContext(res) {
  const [showrooms, products] = await Promise.all([db.list('showrooms'), db.list('products')]);
  return { showrooms, products: published(products), minDate: todayISO() };
}

function validateBooking(body, ctx, t) {
  const v = {
    name: clean(body.name, 80),
    phone: clean(body.phone, 20),
    email: clean(body.email, 120),
    showroom: clean(body.showroom, 64),
    product: clean(body.product, 64),
    date: clean(body.date, 10),
    time: clean(body.time, 20),
    note: clean(body.note, 1000),
    consent: body.consent === 'on' || body.consent === true || body.consent === 'true',
  };
  const e = {};
  if (v.name.length < 2) e.name = t.booking.errors.name;
  if (!PHONE_RE.test(v.phone.replace(/[\s.\-()]/g, ''))) e.phone = t.booking.errors.phone;
  if (v.email && !EMAIL_RE.test(v.email)) e.email = t.booking.errors.email;
  if (!ctx.showrooms.some((s) => s.id === v.showroom)) e.showroom = t.booking.errors.showroom;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date < ctx.minDate) e.date = t.booking.errors.date;
  if (!t.booking.times.includes(v.time)) e.time = t.booking.errors.time;
  if (!v.consent) e.consent = t.booking.errors.consent;
  return { values: v, errors: e };
}

router.get(`/${L}/book`, async (req, res, next) => {
  try {
    const ctx = await bookingContext(res);
    res.render('pages/book', {
      pageTitle: res.locals.t.booking.eyebrow,
      ...ctx,
      values: { showroom: req.query.showroom || '', product: req.query.model || '' },
      errors: {},
      sent: req.query.sent === '1',
    });
  } catch (e) { next(e); }
});

router.post(`/${L}/book`, formLimiter, async (req, res, next) => {
  try {
    const { t, lang } = res.locals;
    const ctx = await bookingContext(res);
    // Honeypot or invalid token → pretend success, store nothing
    if (req.body.website || !verifyFormToken(req.body._token)) {
      return wantsJson(req) ? res.json({ ok: true }) : res.redirect(`/${lang}/book?sent=1`);
    }
    const { values, errors } = validateBooking(req.body, ctx, t);
    if (Object.keys(errors).length) {
      if (wantsJson(req)) return res.status(422).json({ ok: false, errors });
      return res.status(422).render('pages/book', { pageTitle: t.booking.eyebrow, ...ctx, values, errors, sent: false });
    }
    const showroom = ctx.showrooms.find((s) => s.id === values.showroom);
    const product = ctx.products.find((p) => p.slug === values.product);
    await db.insert('bookings', { ...values, lang, status: 'new', showroomName: showroom.name.vi, productName: product?.name || '' });
    notify(`Đặt lịch mới: ${values.name} — ${values.date} ${values.time}`, {
      'Họ tên': values.name, 'Điện thoại': values.phone, Email: values.email,
      Showroom: showroom.name.vi, 'Mẫu ghế': product?.name || '—', Ngày: values.date, Giờ: values.time, 'Ghi chú': values.note,
    });
    return wantsJson(req) ? res.json({ ok: true }) : res.redirect(`/${lang}/book?sent=1`);
  } catch (e) { next(e); }
});

// ---------- Contact ----------
router.get(`/${L}/contact`, async (req, res, next) => {
  try {
    res.render('pages/contact', {
      pageTitle: res.locals.t.contact.eyebrow,
      showrooms: await db.list('showrooms'),
      values: {}, errors: {}, sent: req.query.sent === '1',
    });
  } catch (e) { next(e); }
});

router.post(`/${L}/contact`, formLimiter, async (req, res, next) => {
  try {
    const { t, lang } = res.locals;
    if (req.body.website || !verifyFormToken(req.body._token)) {
      return wantsJson(req) ? res.json({ ok: true }) : res.redirect(`/${lang}/contact?sent=1`);
    }
    const values = {
      name: clean(req.body.name, 80), phone: clean(req.body.phone, 20), email: clean(req.body.email, 120),
      subject: clean(req.body.subject, 80), message: clean(req.body.message, 3000),
    };
    const errors = {};
    if (values.name.length < 2) errors.name = t.booking.errors.name;
    if (!EMAIL_RE.test(values.email)) errors.email = t.booking.errors.email;
    if (values.phone && !PHONE_RE.test(values.phone.replace(/[\s.\-()]/g, ''))) errors.phone = t.booking.errors.phone;
    if (values.message.length < 10) errors.message = t.contact.errors.message;
    if (Object.keys(errors).length) {
      if (wantsJson(req)) return res.status(422).json({ ok: false, errors });
      return res.status(422).render('pages/contact', { pageTitle: t.contact.eyebrow, showrooms: await db.list('showrooms'), values, errors, sent: false });
    }
    await db.insert('messages', { ...values, type: 'contact', lang, status: 'new' });
    notify(`Tin nhắn liên hệ: ${values.subject || values.name}`, values);
    return wantsJson(req) ? res.json({ ok: true }) : res.redirect(`/${lang}/contact?sent=1`);
  } catch (e) { next(e); }
});

// ---------- Newsletter ----------
router.post(`/${L}/newsletter`, formLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 120);
    const ok = EMAIL_RE.test(email);
    if (ok && !req.body.website && verifyFormToken(req.body._token)) {
      await db.insert('messages', { type: 'newsletter', email, lang: res.locals.lang, status: 'new' });
    }
    if (wantsJson(req)) return res.status(ok ? 200 : 422).json({ ok });
    res.redirect(req.get('referer') || `/${res.locals.lang}`);
  } catch (e) { next(e); }
});

module.exports = router;
