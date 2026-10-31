const nodemailer = require('nodemailer');
const { money } = require('./i18n');
const { escapeHtml: e } = require('./security');

let transport;
function getTransport() {
  if (transport !== undefined) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  transport = SMTP_HOST && SMTP_USER
    ? nodemailer.createTransport({
      host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    : null;
  return transport;
}

async function send({ to, subject, html, replyTo }) {
  const t = getTransport();
  if (!t || !to) {
    console.log(`[mail] (SMTP not configured) to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, replyTo });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return false;
  }
}

const wrap = (title, body) => `
<div style="background:#0B0A09;padding:32px 0;font-family:Arial,sans-serif">
 <div style="max-width:560px;margin:0 auto;background:#141210;color:#EDE6D8;padding:32px;border:1px solid #2E2A25">
  <div style="letter-spacing:.32em;font-size:12px;color:#C9A45C">THOMAS HAMILTON</div>
  <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:16px 0 24px">${title}</h1>
  ${body}
 </div>
</div>`;

function orderTable(o) {
  const rows = o.lines.map((l) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #2E2A25">${e(l.name)}${l.variant ? ' — ' + e(l.variant) : ''} × ${l.qty}</td>
    <td style="padding:8px 0;border-bottom:1px solid #2E2A25;text-align:right">${money(l.total)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;color:#EDE6D8;font-size:14px">${rows}
    <tr><td style="padding:12px 0"><b>Tổng cộng</b></td><td style="padding:12px 0;text-align:right;color:#C9A45C"><b>${money(o.total)}</b></td></tr></table>`;
}

function customerBlock(o) {
  const c = o.customer;
  return `<p style="font-size:14px;line-height:1.7;color:#A79F92">
    ${e(c.name)} · ${e(c.phone)}${c.email ? ' · ' + e(c.email) : ''}<br>${e(c.address)}, ${e(c.city)}
    ${c.note ? '<br>Ghi chú: ' + e(c.note) : ''}<br>Thanh toán: ${e(o.payment_method.toUpperCase())}</p>`;
}

function notifyNewOrder(o, adminUrl) {
  return send({
    to: process.env.ORDER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL,
    subject: `[Đơn mới] ${o.code} — ${money(o.total)} — ${o.customer.name}`,
    replyTo: o.customer.email || undefined,
    html: wrap(`Đơn hàng mới ${e(o.code)}`, customerBlock(o) + orderTable(o)
      + `<p><a href="${adminUrl}" style="color:#C9A45C">Mở trong trang quản trị →</a></p>`),
  });
}

function confirmToCustomer(o, orderUrl) {
  if (!o.customer.email) return Promise.resolve(false);
  return send({
    to: o.customer.email,
    subject: `THOMAS HAMILTON — Xác nhận đơn hàng ${o.code}`,
    html: wrap('Cảm ơn bạn đã đặt hàng', `<p style="color:#A79F92;font-size:14px">Mã đơn <b style="color:#EDE6D8">${e(o.code)}</b>. Chuyên viên sẽ liên hệ để xác nhận lịch giao và lắp đặt.</p>`
      + orderTable(o) + `<p><a href="${orderUrl}" style="color:#C9A45C">Xem đơn hàng →</a></p>`),
  });
}

function notifyMessage(m) {
  return send({
    to: process.env.ORDER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL,
    subject: `[Liên hệ] ${m.topic} — ${m.name} ${m.phone}`,
    replyTo: m.email || undefined,
    html: wrap('Yêu cầu liên hệ mới', `<p style="font-size:14px;line-height:1.8;color:#A79F92">
      ${e(m.name)} · ${e(m.phone)}${m.email ? ' · ' + e(m.email) : ''}<br>Nội dung: ${e(m.topic)}
      ${m.showroom ? '<br>Showroom: ' + e(m.showroom) : ''}${m.date ? '<br>Ngày: ' + e(m.date) : ''}</p>
      <p style="white-space:pre-wrap;font-size:14px">${e(m.message)}</p>`),
  });
}

module.exports = { send, notifyNewOrder, confirmToCustomer, notifyMessage };
