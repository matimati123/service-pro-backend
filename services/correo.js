// =============================================
// VOLTIA PRO SPA — services/correo.js
// Envío de correos con Resend y aviso de visita reprogramada.
// =============================================

async function enviarCorreo({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: 'Voltia Pro SPA <onboarding@resend.dev>', to, subject, html })
  });
  if (!res.ok) throw new Error(`Resend error (${res.status}): ${await res.text()}`);
  return res.json();
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

module.exports = { enviarCorreo, htmlVisitaReprogramada };
