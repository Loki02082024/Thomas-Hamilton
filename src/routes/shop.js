const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const cart = require('../lib/cart');
const vnpay = require('../lib/vnpay');
const mailer = require('../lib/mailer');
const withLang = require('../lib/lang');
const { requireCsrf, sign, verify, cookieOpts } = require('../lib/security');

const router = express.Router();
router.param('lang', withLang);

const PHONE = /^(\+?84|0)[\d\s.]{8,12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const checkoutLimiter = rateLimit({ windowMs: 10 * 60e3, limit: 10, standardHeaders: true, legacyHeaders: false });

const bank = () => ({
  bin: process.env.BANK_BIN, name: process.env.BANK_NAME,
  account: process.env.BANK_ACCOUNT, holder: process.env.BANK_HOLDER,
  enabled: Boolean(process.env.BANK_ACCOUNT),
});
const methods = () => ['cod', bank().enabled && 'bank', vnpay.enabled() && 'vnpay'].filter(Boolean);
const wantsJson = (req) => req.get('accept')?.includes('json');

// Orders a visitor placed are remembered in a signed cookie so only they can view them.
const ORDERS_COOKIE = 'th_orders';
const myOrders = (req) => verify(req.cookies[ORDERS_COOKIE])?.codes || [];
function rememberOrder(req, res, code) {
  const codes = [code, ...myOrders(req)].slice(0, 10);
  res.cookie(ORDERS_COOKIE, sign({ codes }), cookieOpts(req, 180));
}

/* ─────────────── cart ─────────────── */
router.get('/:lang/cart', async (req, res) => {
  const summary = await cart.resolve(cart.read(req), db);
  res.render('pages/cart', { title: `${res.locals.t.cart.title} — THOMAS HAMILTON`, cart: summary, page: 'cart' });
});

// HTML fragment for the slide-in cart drawer (same templates as the cart page)
router.get('/:lang/cart/drawer', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('partials/drawer', { cart: await cart.resolve(cart.read(req), db) });
});

router.post('/:lang/cart/add', requireCsrf, async (req, res) => {
  const p = await db.products.get(String(req.body.slug || ''));
  const variant = Math.max(0, Number(req.body.variant) | 0);
  const qty = Math.min(cart.MAX_QTY, Math.max(1, Number(req.body.qty) | 0 || 1));
  if (!p || p.active === false || p.available === false || !p.variants[variant]) {
    return wantsJson(req) ? res.status(422).json({ ok: false }) : res.redirect(303, res.locals.url('collection'));
  }
  const items = cart.write(req, res, cart.add(cart.read(req), p.slug, variant, qty));
  if (wantsJson(req)) return res.json({ ok: true, cart: await cart.resolve(items, db) });
  res.redirect(303, req.body.buyNow ? res.locals.url('checkout') : res.locals.url('cart'));
});

router.post('/:lang/cart/update', requireCsrf, async (req, res) => {
  const slug = String(req.body.slug || ''), variant = Number(req.body.variant) | 0;
  const qty = Math.min(cart.MAX_QTY, Math.max(0, Number(req.body.qty) | 0));
  let items = cart.read(req).map((i) => (i.s === slug && i.v === variant ? { ...i, q: qty } : i));
  if (req.body.remove) items = items.filter((i) => !(i.s === slug && i.v === variant));
  items = cart.write(req, res, items);
  if (wantsJson(req)) return res.json({ ok: true, cart: await cart.resolve(items, db) });
  res.redirect(303, res.locals.url('cart'));
});

/* ─────────────── checkout ─────────────── */
function renderCheckout(res, status, summary, values = {}, errors = {}) {
  res.status(status).render('pages/checkout', {
    title: `${res.locals.t.checkout.title} — THOMAS HAMILTON`, cart: summary, values, errors,
    methods: methods(), page: 'checkout',
  });
}

router.get('/:lang/checkout', async (req, res) => {
  const summary = await cart.resolve(cart.read(req), db);
  if (!summary.lines.length) return res.redirect(303, res.locals.url('cart'));
  renderCheckout(res, 200, summary, { payment: 'cod' });
});

router.post('/:lang/checkout', checkoutLimiter, requireCsrf, async (req, res) => {
  const t = res.locals.t.checkout;
  const summary = await cart.resolve(cart.read(req), db);
  if (!summary.lines.length) return res.redirect(303, res.locals.url('cart'));

  const field = (k, max) => String(req.body[k] || '').trim().slice(0, max);
  const v = {
    name: field('name', 120), phone: field('phone', 20), email: field('email', 160),
    address: field('address', 300), city: field('city', 80), note: field('note', 1000),
    payment: methods().includes(req.body.payment) ? req.body.payment : 'cod',
  };
  const errors = {};
  const req_ = (k) => { if (!v[k]) errors[k] = res.locals.fill(t.required, { f: t[k].toLowerCase() }); };
  ['name', 'address', 'city'].forEach(req_);
  if (!PHONE.test(v.phone)) errors.phone = t.invalidPhone;
  if (v.email && !EMAIL.test(v.email)) errors.email = t.invalidEmail;
  if (summary.lines.some((l) => !l.available)) errors.cart = res.locals.t.product.outOfStock;
  if (Object.keys(errors).length) return renderCheckout(res, 422, summary, v, errors);

  const order = await db.orders.create({
    lang: req.lang,
    customer: { name: v.name, phone: v.phone, email: v.email, address: v.address, city: v.city, note: v.note },
    lines: summary.lines.map(({ slug, name, variant, variantIndex, price, qty, total, image }) => ({ slug, name, variant, variantIndex, price, qty, total, image })),
    subtotal: summary.subtotal, shipping: summary.shipping, total: summary.total,
    payment_method: v.payment, payment_status: 'unpaid', status: 'new',
  });
  cart.write(req, res, []);
  rememberOrder(req, res, order.code);
  const base = res.locals.siteUrl;
  mailer.notifyNewOrder(order, `${base}/admin/orders/${order.code}`);
  mailer.confirmToCustomer(order, `${base}/${req.lang}/order/${order.code}`);

  if (v.payment === 'vnpay') {
    return res.redirect(303, vnpay.paymentUrl({
      code: order.code, amount: order.total, ip: req.ip, lang: req.lang,
      returnUrl: `${base}/payment/vnpay/return`,
    }));
  }
  res.redirect(303, res.locals.url(`order/${order.code}`));
});

/* ─────────────── order status ─────────────── */
router.get('/:lang/order/:code', async (req, res, next) => {
  if (!myOrders(req).includes(req.params.code)) return next();
  const order = await db.orders.get(req.params.code);
  if (!order) return next();
  res.render('pages/order', { title: `${res.locals.t.order.code} ${order.code}`, order, bank: bank(), vnpayOn: vnpay.enabled(), page: 'order' });
});

router.post('/:lang/order/:code/pay', requireCsrf, async (req, res, next) => {
  if (!myOrders(req).includes(req.params.code) || !vnpay.enabled()) return next();
  const order = await db.orders.get(req.params.code);
  if (!order || order.payment_status === 'paid') return next();
  res.redirect(303, vnpay.paymentUrl({
    code: order.code, amount: order.total, ip: req.ip, lang: req.lang,
    returnUrl: `${res.locals.siteUrl}/payment/vnpay/return`,
  }));
});

/* ─────────────── VNPay callbacks ─────────────── */
async function applyVnpay(params) {
  const order = await db.orders.get(params.vnp_TxnRef);
  if (!order) return { code: '01', order: null };
  if (Number(params.vnp_Amount) !== Math.round(order.total) * 100) return { code: '04', order };
  if (order.payment_status === 'paid') return { code: '02', order };
  const success = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
  const updated = await db.orders.update(order.code, {
    payment_status: success ? 'paid' : 'failed',
    vnpay: { txn: params.vnp_TransactionNo, bank: params.vnp_BankCode, code: params.vnp_ResponseCode, at: params.vnp_PayDate },
  });
  return { code: '00', order: updated };
}

// Server-to-server notification — the source of truth for payment status.
router.get('/payment/vnpay/ipn', async (req, res) => {
  const params = vnpay.verify(req.query);
  if (!params) return res.json({ RspCode: '97', Message: 'Invalid signature' });
  const { code } = await applyVnpay(params);
  const messages = { '00': 'Confirm Success', '01': 'Order not found', '02': 'Order already confirmed', '04': 'Invalid amount' };
  res.json({ RspCode: code, Message: messages[code] });
});

// Browser redirect back from VNPay. Also applies the result, so sandbox works without a public IPN URL.
router.get('/payment/vnpay/return', async (req, res) => {
  const params = vnpay.verify(req.query);
  const order = params ? (await applyVnpay(params)).order : null;
  const lang = order?.lang || 'vi';
  if (!order) {
    withLang.applyLang(req, res, lang);
    return res.status(400).render('pages/404', { title: 'VNPay' });
  }
  res.redirect(303, `/${lang}/order/${order.code}`);
});

module.exports = router;
