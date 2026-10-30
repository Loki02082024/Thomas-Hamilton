// Language detection + view helpers shared by every public page.
const site = require('../config/site');
const dict = { vi: require('../i18n/vi'), en: require('../i18n/en') };
const LANGS = Object.keys(dict);

const SITE_URL = () => (process.env.SITE_URL || '').replace(/\/$/, '');

function formatMoney(value, lang) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return lang === 'vi'
    ? new Intl.NumberFormat('vi-VN').format(n) + ' ₫'
    : new Intl.NumberFormat('en-US').format(n) + ' VND';
}

function formatDate(iso, lang) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
}

// Splits stored body text into blocks: "## Heading" lines become h2, blank lines separate paragraphs.
function richText(text) {
  if (!text) return [];
  return String(text)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => (b.startsWith('## ') ? { type: 'h2', text: b.slice(3) } : { type: 'p', text: b }));
}

function localize(req, res, next) {
  const first = req.path.split('/')[1];
  const lang = LANGS.includes(first) ? first : 'vi';
  const rest = LANGS.includes(first) ? req.path.slice(first.length + 1) || '/' : req.path;
  const other = lang === 'vi' ? 'en' : 'vi';

  Object.assign(res.locals, {
    lang,
    otherLang: other,
    t: dict[lang],
    site,
    siteUrl: SITE_URL(),
    path: rest,
    // Localised value: accepts plain strings or { vi, en } objects
    tr: (v) => (v && typeof v === 'object' ? v[lang] ?? v.vi ?? '' : v ?? ''),
    url: (p = '/') => `/${lang}${p === '/' ? '' : p}`,
    altUrl: `/${other}${rest === '/' ? '' : rest}`,
    money: (v) => formatMoney(v, lang),
    date: (v) => formatDate(v, lang),
    richText,
    year: new Date().getFullYear(),
  });
  next();
}

module.exports = { localize, LANGS, dict, formatMoney };
