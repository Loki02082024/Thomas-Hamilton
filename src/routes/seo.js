const express = require('express');
const db = require('../db');
const { LANGS } = require('../lib/i18n');

const router = express.Router();
const base = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${base(req)}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [products, posts] = await Promise.all([db.list('products'), db.list('posts')]);
    const paths = [
      '', '/collection', '/compare', '/technology', '/story', '/showrooms', '/book', '/contact', '/journal', '/warranty', '/faq',
      ...products.filter((p) => p.status !== 'draft').map((p) => `/collection/${p.slug}`),
      ...posts.filter((p) => p.status !== 'draft').map((p) => `/journal/${p.slug}`),
    ];
    const urls = paths
      .map((p) => {
        const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${base(req)}/${l}${p}"/>`).join('');
        return LANGS.map((l) => `<url><loc>${base(req)}/${l}${p}</loc>${alts}</url>`).join('');
      })
      .join('');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`
    );
  } catch (e) { next(e); }
});

module.exports = router;
