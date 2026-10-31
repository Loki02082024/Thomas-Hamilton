const express = require('express');
const db = require('../db');
const { LANGS } = require('../lib/i18n');

const router = express.Router();
const base = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /*/cart\nDisallow: /*/checkout\nDisallow: /*/order/\nSitemap: ${base(req)}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res) => {
  const b = base(req);
  const products = (await db.products.list()).filter((p) => p.active !== false);
  const paths = ['', '/collection', '/story', '/showrooms', '/contact', '/policies', ...products.map((p) => `/chair/${p.slug}`)];
  const urls = paths.map((p) => `<url><loc>${b}/vi${p}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${b}/${l}${p}"/>`).join('')}</url>`
    + `<url><loc>${b}/ja${p}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${b}/${l}${p}"/>`).join('')}</url>`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`);
});

module.exports = router;
