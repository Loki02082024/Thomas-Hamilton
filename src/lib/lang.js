// router.param('lang', withLang) — validates the /:lang prefix and loads view helpers.
const { LANGS, helpers } = require('./i18n');
const cart = require('./cart');

function applyLang(req, res, lang) {
  req.lang = lang;
  Object.assign(res.locals, helpers(lang));
  res.locals.cartCount = cart.read(req).reduce((s, i) => s + i.q, 0);
  // the same page in the other language, for the switcher + hreflang
  const rest = req.originalUrl.split('?')[0].replace(/^\/(vi|ja)(?=\/|$)/, '');
  res.locals.basePath = rest;
  res.locals.altPath = '/' + res.locals.altLang + rest;
}

function withLang(req, res, next, lang) {
  if (!LANGS.includes(lang)) return next('route');
  applyLang(req, res, lang);
  next();
}

module.exports = withLang;
module.exports.applyLang = applyLang;
