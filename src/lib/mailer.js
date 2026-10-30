// Optional email notifications. Silently skipped when SMTP is not configured.
let transporter = null;

function getTransporter() {
  if (transporter || !process.env.SMTP_HOST) return transporter;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function notify(subject, fields) {
  const tx = getTransporter();
  if (!tx || !process.env.NOTIFY_EMAIL) return;
  const rows = Object.entries(fields)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#777">${escape(k)}</td><td style="padding:6px 12px">${escape(v)}</td></tr>`)
    .join('');
  try {
    await tx.sendMail({
      from: `"THOMAS HAMILTON Website" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject,
      html: `<h2 style="font-family:Georgia,serif">${escape(subject)}</h2><table>${rows}</table>`,
    });
  } catch (err) {
    console.error('[mailer] failed to send notification:', err.message);
  }
}

module.exports = { notify };
