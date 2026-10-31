const dict = { vi: require('../i18n/vi'), ja: require('../i18n/ja') };
const LANGS = Object.keys(dict);
const DEFAULT = 'vi';

const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function money(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';
}

/** Helpers exposed to every view as res.locals. */
function helpers(lang) {
  const t = dict[lang];
  return {
    lang,
    t,
    fill,
    money,
    url: (p = '') => `/${lang}${p ? '/' + p.replace(/^\//, '') : ''}`,
    altLang: lang === 'vi' ? 'ja' : 'vi',
    specKey: (k) => t.specKeys[k] || k,
    colorName: (c) => (t.colors && t.colors[c]) || c,
  };
}

module.exports = { dict, LANGS, DEFAULT, helpers, money, fill };
