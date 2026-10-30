// Stateless form tokens + signed admin cookie (no server-side session store needed,
// which keeps the app safe to restart/redeploy on Hostinger).
const crypto = require('crypto');

const secret = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const sign = (value) => crypto.createHmac('sha256', secret()).update(value).digest('base64url');
const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// ---- Form tokens: "<timestamp>.<hmac>" valid for 4 hours ----
const FORM_TTL = 4 * 60 * 60 * 1000;
function formToken(scope = 'public') {
  const ts = Date.now().toString(36);
  return `${ts}.${sign(`${scope}:${ts}`)}`;
}
// minAge rejects instant (bot) submissions on public forms
function verifyFormToken(token, scope = 'public', minAge = 1500) {
  if (!token || typeof token !== 'string') return false;
  const [ts, mac] = token.split('.');
  if (!ts || !mac || !safeEqual(mac, sign(`${scope}:${ts}`))) return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= minAge && age < FORM_TTL;
}

// ---- Admin auth cookie ----
const COOKIE = 'th_admin';
const ADMIN_TTL = 12 * 60 * 60 * 1000;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setAdminCookie(res, user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + ADMIN_TTL })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_TTL,
    path: '/admin',
  });
}

function clearAdminCookie(res) {
  res.clearCookie(COOKIE, { path: '/admin' });
}

function readAdmin(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac || !safeEqual(mac, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data.u : null;
  } catch {
    return null;
  }
}

module.exports = { formToken, verifyFormToken, setAdminCookie, clearAdminCookie, readAdmin, safeEqual };
