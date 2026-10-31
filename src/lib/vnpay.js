// VNPay payment gateway v2.1.0 — https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
const crypto = require('crypto');

const cfg = () => ({
  tmnCode: process.env.VNPAY_TMN_CODE,
  secret: process.env.VNPAY_HASH_SECRET,
  url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
});

const enabled = () => Boolean(cfg().tmnCode && cfg().secret);

// VNPay signs the sorted, form-encoded query string (spaces as "+").
function encode(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

const hmac = (data) => crypto.createHmac('sha512', cfg().secret).update(Buffer.from(data, 'utf-8')).digest('hex');

// yyyyMMddHHmmss in Vietnam time (GMT+7), regardless of server timezone
function vnTime(date) {
  const d = new Date(date.getTime() + 7 * 3600e3);
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function paymentUrl({ code, amount, ip, returnUrl, lang }) {
  const now = new Date();
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: cfg().tmnCode,
    vnp_Locale: lang === 'vi' ? 'vn' : 'en',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: code,
    vnp_OrderInfo: `Thanh toan don hang ${code}`,
    vnp_OrderType: 'other',
    vnp_Amount: String(Math.round(amount) * 100),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: (ip || '127.0.0.1').replace('::ffff:', ''),
    vnp_CreateDate: vnTime(now),
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 15 * 60e3)),
  };
  const query = encode(params);
  return `${cfg().url}?${query}&vnp_SecureHash=${hmac(query)}`;
}

/** Verify the signature of a return/IPN query. Returns the vnp_* params or null. */
function verify(query) {
  const params = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') params[k] = v;
  }
  const given = String(query.vnp_SecureHash || '').toLowerCase();
  const expected = hmac(encode(params));
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  return params;
}

module.exports = { enabled, paymentUrl, verify };
