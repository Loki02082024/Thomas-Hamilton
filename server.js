const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const db = require('./src/db');
const { localize } = require('./src/lib/i18n');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const seoRoutes = require('./src/routes/seo');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.startsWith('change-me'))) {
  console.warn('[warn] SESSION_SECRET is not set — set a long random value in production.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        // style="" attributes carry design tokens (product accent colours, stagger delays)
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ['https://www.google.com', 'https://maps.google.com'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: isProd ? '7d' : 0,
    etag: true,
  })
);

app.use(seoRoutes);
app.use('/admin', adminRoutes);
app.use(localize, publicRoutes);

// 404
app.use(localize, (req, res) => {
  res.status(404).render('pages/404', { pageTitle: res.locals.t.notFound.title });
});

// Errors
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Internal Server Error');
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`THOMAS HAMILTON running on http://localhost:${PORT} (store: ${db.name})`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
