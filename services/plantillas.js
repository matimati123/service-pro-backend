// =============================================
// VOLTIA PRO SPA — services/plantillas.js
// Cuerpos HTML de los correos de seguimiento (encuesta, órdenes estancadas, reporte semanal).
// =============================================
const esc = t => String(t === undefined || t === null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fechaLarga = f => { const [a, m, d] = String(f).split('-'); return `${d}-${m}-${a}`; };
// ---- Encuesta, órdenes estancadas y reporte semanal ----
const pesos = n => '$' + Number(n || 0).toLocaleString('es-CL');
const marco = (titulo, cuerpo) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
    <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
    <h3>${titulo}</h3>
    ${cuerpo}
  </div></body></html>`;

function htmlEncuesta({ nombre, orden, url }) {
  return marco('¿Cómo fue tu servicio?', `
    <p>Hola ${esc(nombre || '')},</p>
    <p>Tu orden #${esc(orden.id)} quedó completada. Tu opinión nos ayuda a mejorar: ¿nos dejas una calificación de 1 a 5 estrellas?</p>
    <p style="margin: 22px 0;"><a href="${esc(url)}" style="background:#f97316;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">⭐ Calificar mi servicio</a></p>
    <p style="color:#777; font-size: 13px;">Inicia sesión y busca la orden en «Mis órdenes». ¡Gracias por confiar en nosotros!</p>`);
}

function htmlEstancadas({ ordenes, dias, url }) {
  const filas = ordenes.map(o => `<li>Orden #${esc(o.id)} — ${esc(o.cliente || 'Sin nombre')} · ${esc(o.direccion || '—')} · <b>${esc(o.dias)} días</b></li>`).join('');
  return marco('Órdenes sin atender', `
    <p>Estas órdenes llevan más de ${esc(dias)} días en estado <b>pendiente</b>:</p>
    <ul style="color:#333; line-height:1.7;">${filas}</ul>
    <p><a href="${esc(url)}">Abrir el panel de administración</a></p>
    <p style="color:#777; font-size: 13px;">Cada orden se avisa una vez por semana hasta que cambie de estado.</p>`);
}

function htmlReporteSemanal({ recibidas, calificaciones, estancadas, visitas, url }) {
  const filasVisitas = visitas.length
    ? visitas.map(v => `<li>${esc(fechaLarga(String(v.fecha_visita).slice(0, 10)))} ${esc(v.hora_visita || '')} — #${esc(v.id)} ${esc(v.cliente || '')}${v.tecnico_nombre ? ' · ' + esc(v.tecnico_nombre) : ''}</li>`).join('')
    : '<li>Sin visitas agendadas.</li>';
  const prom = calificaciones.total > 0 ? `${esc(calificaciones.promedio)} ⭐ (${esc(calificaciones.total)} calificaciones)` : 'Sin calificaciones nuevas';
  return marco('Resumen de la semana', `
    <p style="color:#555;">Últimos 7 días:</p>
    <ul style="color:#333; line-height:1.8;">
      <li>Órdenes nuevas: <b>${esc(recibidas.total)}</b></li>
      <li>De ellas, estado actual: completadas <b>${esc(recibidas.completadas)}</b> · en proceso <b>${esc(recibidas.en_proceso)}</b> · rechazadas <b>${esc(recibidas.rechazadas)}</b></li>
      <li>Ingresos de esas órdenes completadas: <b>${pesos(recibidas.ingresos)}</b></li>
      <li>Satisfacción: <b>${prom}</b></li>
      <li>Órdenes pendientes sin atender: <b>${esc(estancadas)}</b></li>
    </ul>
    <p style="margin-bottom:4px;"><b>Visitas de los próximos 7 días</b></p>
    <ul style="color:#333; line-height:1.7;">${filasVisitas}</ul>
    <p><a href="${esc(url)}">Abrir el panel de administración</a></p>`);
}

module.exports = { htmlEncuesta, htmlEstancadas, htmlReporteSemanal };
