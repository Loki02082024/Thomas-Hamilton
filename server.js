require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const db = require('./src/db');
const { csrf } = require('./src/lib/security');
const site = require('./src/config/site');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set('trust proxy', 1); // Hostinger terminates TLS at its proxy
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

const vnpayHost = new URL(process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn').origin;
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://img.vietqr.io'],
      'form-action': ["'self'", vnpayHost],
      'upgrade-insecure-requests': PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

const year = PROD ? '365d' : 0;
app.use('/vendor/gsap', express.static(path.join(__dirname, 'node_modules/gsap/dist'), { maxAge: year, immutable: PROD }));
app.use('/vendor/lenis', express.static(path.join(__dirname, 'node_modules/lenis/dist'), { maxAge: year, immutable: PROD }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: PROD ? '30d' : 0 }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '7d' : 0 }));

const ASSET_VERSION = Date.now().toString(36);
app.use(csrf);
app.use((req, res, next) => {
  res.locals.site = site;
  res.locals.path = req.path;
  res.locals.siteUrl = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  // cache-busting for our own CSS/JS
  res.locals.v = ASSET_VERSION;
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true, db: db.kind }));
app.use(require('./src/routes/seo'));
app.use('/admin', require('./src/routes/admin')({ uploadDir: UPLOAD_DIR }));
app.use(require('./src/routes/shop'));
app.use(require('./src/routes/public'));

app.use((req, res) => {
  require('./src/lib/lang').applyLang(req, res, /^\/ja(\/|$)/.test(req.path) ? 'ja' : 'vi');
  res.status(404).render('pages/404', { title: '404' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).send('Đã có lỗi xảy ra / エラーが発生しました');
});

const PORT = Number(process.env.PORT || 3000);
db.init()
  .then(() => app.listen(PORT, () => console.log(`THOMAS HAMILTON on http://localhost:${PORT} (store: ${db.kind})`)))
  .catch((err) => {
    console.error('[db] init failed:', err.message);
    process.exit(1);
  });
