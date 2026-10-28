// =============================================
// VOLTIA PRO SPA — services/correo.js
// Envío de correos con Resend y aviso de visita reprogramada.
// =============================================

// =============================================
// Proveedores:
//  1) Gmail API (por HTTPS, gratis, llega a cualquier destinatario). Se activa si existen
//     GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN.
//     (No usa SMTP: el plan gratis de Render bloquea esas conexiones.)
//  2) Resend (respaldo). Sin dominio verificado solo entrega a la cuenta dueña de Resend.
// =============================================
const NOMBRE_REMITENTE = 'Voltia Pro SPA';

const gmailConfigurado = () => !!(process.env.GMAIL_USER && process.env.GMAIL_CLIENT_ID
  && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);

let tokenGmail = { valor: null, expira: 0 };

async function accessTokenGmail() {
  if (tokenGmail.valor && Date.now() < tokenGmail.expira - 60 * 1000) return tokenGmail.valor;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token error (${res.status}): ${data.error_description || data.error || 'sin detalle'}`);
  }
  tokenGmail = { valor: data.access_token, expira: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return tokenGmail.valor;
}

// Arma el correo completo (con adjuntos) usando nodemailer solo para generar el formato; no abre ninguna conexión.
async function armarMensajeRaw({ to, subject, html, attachments }) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await t.sendMail({
    from: `${NOMBRE_REMITENTE} <${process.env.GMAIL_USER}>`,
    to, subject, html,
    attachments: (attachments || []).map(a => ({ filename: a.filename, content: a.content, encoding: 'base64' }))
  });
  return info.message.toString('base64url');
}

async function enviarPorGmail(datos) {
  const raw = await armarMensajeRaw(datos);
  const token = await accessTokenGmail();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) {
    if (res.status === 401) tokenGmail = { valor: null, expira: 0 };
    throw new Error(`Gmail error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function enviarPorResend({ to, subject, html, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${NOMBRE_REMITENTE} <onboarding@resend.dev>`,
      to, subject, html,
      ...(attachments && attachments.length ? { attachments } : {})
    })
  });
  if (!res.ok) throw new Error(`Resend error (${res.status}): ${await res.text()}`);
  return res.json();
}

// attachments: [{ filename, content: <base64> }]
async function enviarCorreo(datos) {
  return gmailConfigurado() ? enviarPorGmail(datos) : enviarPorResend(datos);
}

const esc = t => String(t === undefined || t === null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// "2026-10-28" -> "28-10-2026"
const fechaLarga = f => { const [a, m, d] = String(f).split('-'); return `${d}-${m}-${a}`; };

// Correo de aviso: destinatario "cliente" o "tecnico".
// antes = { fecha, hora } | null (si antes no tenía visita), ahora = { fecha, hora }
function htmlVisitaReprogramada({ para, nombre, orden, antes, ahora }) {
  const cambio = antes
    ? `<p style="color:#555;">Antes: <s>${esc(fechaLarga(antes.fecha))} a las ${esc(antes.hora)}</s></p>`
    : '';
  const intro = para === 'tecnico'
    ? `Se actualizó el horario de una visita que tienes asignada (orden #${esc(orden.id)}).`
    : `Actualizamos el horario de tu visita técnica (orden #${esc(orden.id)}).`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
    <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
    <h3>${antes ? 'Visita reprogramada' : 'Visita agendada'}</h3>
    <p>Hola ${esc(nombre || '')},</p>
    <p>${intro}</p>
    <p style="font-size: 20px; font-weight: bold; color: #333; margin: 18px 0;">📅 ${esc(fechaLarga(ahora.fecha))} a las ${esc(ahora.hora)}</p>
    ${cambio}
    <p style="color:#555;">📍 ${esc(orden.direccion || '—')}${para === 'tecnico' ? `<br>👤 Cliente: ${esc(orden.cliente || '—')}` : ''}</p>
    <p style="color:#777; font-size: 13px;">Si el horario no te acomoda, responde a este correo o contáctanos.</p>
  </div></body></html>`;
}

module.exports = { enviarCorreo, htmlVisitaReprogramada, gmailConfigurado, armarMensajeRaw };
