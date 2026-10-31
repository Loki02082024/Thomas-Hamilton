const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[security] SESSION_SECRET is not set — sessions reset on every restart.');
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString();
const mac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Sign a JSON payload into a tamper-proof cookie value. */
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + mac(body);
}

function verify(value) {
  if (typeof value !== 'string' || !value.includes('.')) return null;
  const [body, sig] = value.split('.');
  if (!safeEqual(sig, mac(body))) return null;
  try {
    const data = JSON.parse(unb64(body));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** Per-visitor CSRF token, bound to a random id in a signed cookie. */
function csrf(req, res, next) {
  let sid = verify(req.cookies.th_sid)?.id;
  if (!sid) {
    sid = crypto.randomBytes(16).toString('hex');
    res.cookie('th_sid', sign({ id: sid }), cookieOpts(req, 365));
  }
  const token = mac('csrf:' + sid);
  res.locals.csrfToken = token;
  req.csrfValid = () => safeEqual(req.body?._csrf || req.get('x-csrf-token') || '', token);
  next();
}

function requireCsrf(req, res, next) {
  if (req.csrfValid()) return next();
  res.status(403);
  if (req.xhr || req.get('accept')?.includes('json')) return res.json({ ok: false, error: 'csrf' });
  res.send('Phiên làm việc đã hết hạn. Vui lòng tải lại trang. / セッションの有効期限が切れました。');
}

function cookieOpts(req, days) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: days * 864e5,
    path: '/',
  };
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { sign, verify, csrf, requireCsrf, cookieOpts, safeEqual, escapeHtml };
