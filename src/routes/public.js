const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const site = require('../config/site');
const withLang = require('../lib/lang');
const { requireCsrf } = require('../lib/security');
const mailer = require('../lib/mailer');

const router = express.Router();
router.param('lang', withLang);

const formLimiter = rateLimit({ windowMs: 10 * 60e3, limit: 8, standardHeaders: true, legacyHeaders: false });
const PHONE = /^(\+?84|0)[\d\s.]{8,12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Product as shown to visitors in the current language. */
function present(p, t) {
  const saving = p.compare > p.price ? p.compare - p.price : 0;
  return {
    ...p,
    saving,
    discount: saving ? Math.round((saving / p.compare) * 100) : 0,
    summary: t.lang === 'ja' ? t.t.product.summary(p.highlights || {}) + '。' : (p.summary_vi || t.t.product.summary(p.highlights || {})),
  };
}
const activeProducts = async () => (await db.products.list()).filter((p) => p.active !== false);

router.get('/', (req, res) => {
  const ja = (req.get('accept-language') || '').toLowerCase().startsWith('ja');
  res.redirect(302, ja ? '/ja' : '/vi');
});

router.get('/:lang', async (req, res) => {
  const all = (await activeProducts()).map((p) => present(p, res.locals));
  const featured = all.filter((p) => p.featured);
  const hero = all.find((p) => /s919/.test(p.slug)) || featured[0] || all[0];
  res.render('pages/home', { title: res.locals.t.meta.title, featured: featured.length ? featured : all.slice(0, 6), hero, page: 'home' });
});

router.get('/:lang/collection', async (req, res) => {
  const { brand = '', price = '', sort = 'featured' } = req.query;
  let list = (await activeProducts()).map((p) => present(p, res.locals));
  const brands = [...new Set(list.map((p) => p.brand))];
  if (brand) list = list.filter((p) => p.brand === brand);
  if (price === 'under20') list = list.filter((p) => p.price < 20e6);
  if (price === '20to40') list = list.filter((p) => p.price >= 20e6 && p.price <= 40e6);
  if (price === 'over40') list = list.filter((p) => p.price > 40e6);
  const sorters = {
    featured: (a, b) => (b.featured - a.featured) || (a.sort - b.sort),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  list.sort(sorters[sort] || sorters.featured);
  res.render('pages/collection', {
    title: `${res.locals.t.collection.title} — THOMAS HAMILTON`, products: list, brands,
    filters: { brand, price, sort }, page: 'collection',
  });
});

router.get('/:lang/chair/:slug', async (req, res, next) => {
  const p = await db.products.get(req.params.slug);
  if (!p || p.active === false) return next();
  const product = present(p, res.locals);
  const related = (await activeProducts())
    .filter((x) => x.slug !== p.slug)
    .sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price))
    .slice(0, 4)
    .map((x) => present(x, res.locals));
  res.render('pages/product', {
    title: `${p.name} — THOMAS HAMILTON`, description: product.summary.slice(0, 160),
    product, related, ogImage: p.images[0], page: 'product',
  });
});

router.get('/:lang/story', (req, res) => res.render('pages/story', { title: `${res.locals.t.story.title}`, page: 'story' }));
router.get('/:lang/showrooms', (req, res) => res.render('pages/showrooms', { title: `${res.locals.t.showrooms.title} — THOMAS HAMILTON`, page: 'showrooms' }));
router.get('/:lang/policies', (req, res) => res.render('pages/policies', { title: `${res.locals.t.policies.title} — THOMAS HAMILTON`, page: 'policies' }));

function renderContact(res, status, values = {}, errors = {}, sent = false) {
  res.status(status).render('pages/contact', {
    title: `${res.locals.t.contact.title} — THOMAS HAMILTON`, values, errors, sent, page: 'contact',
  });
}

router.get('/:lang/contact', (req, res) => {
  renderContact(res, 200, { topic: req.query.topic || 'experience', product: req.query.product || '' }, {}, req.query.sent === '1');
});

router.post('/:lang/contact', formLimiter, requireCsrf, async (req, res) => {
  const t = res.locals.t;
  const v = {
    name: String(req.body.name || '').trim().slice(0, 120),
    phone: String(req.body.phone || '').trim().slice(0, 20),
    email: String(req.body.email || '').trim().slice(0, 160),
    topic: Object.keys(t.contact.topics).includes(req.body.topic) ? req.body.topic : 'other',
    showroom: site.showrooms.some((s) => s.name === req.body.showroom) ? req.body.showroom : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : '',
    product: String(req.body.product || '').slice(0, 160),
    message: String(req.body.message || '').trim().slice(0, 3000),
  };
  if (req.body.website) return res.redirect(303, res.locals.url('contact?sent=1')); // honeypot
  const errors = {};
  if (!v.name) errors.name = res.locals.fill(t.checkout.required, { f: t.contact.name.toLowerCase() });
  if (!PHONE.test(v.phone)) errors.phone = t.checkout.invalidPhone;
  if (v.email && !EMAIL.test(v.email)) errors.email = t.checkout.invalidEmail;
  const wantsJson = req.get('accept')?.includes('json');
  if (Object.keys(errors).length) {
    if (wantsJson) return res.status(422).json({ ok: false, errors });
    return renderContact(res, 422, v, errors);
  }
  const msg = await db.messages.create({ ...v, kind: 'contact', topicLabel: t.contact.topics[v.topic], lang: req.lang });
  mailer.notifyMessage({ ...msg, topic: msg.topicLabel });
  if (wantsJson) return res.json({ ok: true, message: t.contact.sent });
  res.redirect(303, res.locals.url('contact?sent=1'));
});

router.post('/:lang/newsletter', formLimiter, requireCsrf, async (req, res) => {
  const email = String(req.body.email || '').trim().slice(0, 160);
  const ok = EMAIL.test(email) && !req.body.website;
  if (ok) await db.messages.create({ kind: 'newsletter', email, lang: req.lang, name: '', phone: '', topicLabel: 'Newsletter', message: '' });
  if (req.get('accept')?.includes('json')) return res.status(ok ? 200 : 422).json({ ok });
  res.redirect(303, req.get('referer') || res.locals.url());
});

module.exports = router;
module.exports.present = present;
