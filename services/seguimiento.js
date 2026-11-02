// =============================================
// VOLTIA PRO SPA — services/seguimiento.js
// Tareas automáticas por correo (las dispara GitHub Actions, ver routes/tareas.js):
//  - enviarEncuestas():   pide calificar el servicio a clientes con orden completada y sin calificación
//  - avisarEstancadas():  avisa al administrador de órdenes que llevan muchos días en "pendiente"
//  - reporteSemanal():    resumen de la semana para el administrador
// =============================================
const db = require('../db');
const { enviarCorreo } = require('./correo');
const { htmlEncuesta, htmlEstancadas, htmlReporteSemanal } = require('./plantillas');

const q = (sql, params) => db.promise().query(sql, params).then(([filas]) => filas);

const DIAS_ESTANCADA = Number(process.env.DIAS_ESTANCADA) || 3;   // días en "pendiente" para avisar
const REAVISO_DIAS = 7;                                          // no repetir el aviso de una misma orden antes de esto
const SITIO = process.env.SITIO_URL || 'https://imaginative-gelato-77a91c.netlify.app';

const destinoAdmin = () => process.env.BACKUP_EMAIL || process.env.GMAIL_USER;

// ---- columnas de control (se crean solas la primera vez) ----
let columnas = null;
async function asegurarColumnas() {
  if (columnas !== null) return columnas;
  try {
    const hay = await q(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ordenes'
         AND COLUMN_NAME IN ('encuesta_enviada', 'seguimiento_avisado')`
    );
    const nombres = hay.map(f => f.COLUMN_NAME);
    if (!nombres.includes('encuesta_enviada')) {
      await q('ALTER TABLE ordenes ADD COLUMN encuesta_enviada DATETIME NULL DEFAULT NULL');
      // Las órdenes que ya estaban completadas antes de activar la encuesta no la reciben
      await q("UPDATE ordenes SET encuesta_enviada = NOW() WHERE estado = 'completado'");
    }
    if (!nombres.includes('seguimiento_avisado')) {
      await q('ALTER TABLE ordenes ADD COLUMN seguimiento_avisado DATETIME NULL DEFAULT NULL');
    }
    columnas = true;
  } catch (err) {
    console.error('No se pudieron preparar las columnas de seguimiento:', err.message);
    columnas = false;
  }
  return columnas;
}

// ---- 12. Encuesta de satisfacción ----
async function enviarEncuestas() {
  if (!(await asegurarColumnas())) throw new Error('Faltan columnas de seguimiento en ordenes');
  const ordenes = await q(
    `SELECT o.id, o.cliente, u.email AS cliente_email, u.nombre AS cliente_nombre
     FROM ordenes o
     JOIN usuarios u ON u.id = o.usuario_id
     LEFT JOIN calificaciones c ON c.orden_id = o.id
     WHERE o.estado = 'completado' AND o.encuesta_enviada IS NULL AND c.id IS NULL`
  );
  const resumen = { ordenes: ordenes.length, correos: 0, errores: 0, sin_correo: 0 };
  for (const o of ordenes) {
    if (!o.cliente_email) { resumen.sin_correo++; continue; }
    try {
      await enviarCorreo({
        to: o.cliente_email,
        subject: `⭐ ¿Cómo fue tu servicio? — orden #${o.id}`,
        html: htmlEncuesta({ nombre: o.cliente_nombre || o.cliente, orden: o, url: `${SITIO}/mis-ordenes.html` })
      });
      await q('UPDATE ordenes SET encuesta_enviada = NOW() WHERE id = ?', [o.id]);
      resumen.correos++;
    } catch (err) {
      resumen.errores++;       // sin marcar: se reintenta en la próxima corrida
      console.error(`Encuesta fallida (orden #${o.id}):`, err.message);
    }
  }
  return resumen;
}

// ---- 13. Órdenes estancadas en "pendiente" ----
async function avisarEstancadas() {
  if (!(await asegurarColumnas())) throw new Error('Faltan columnas de seguimiento en ordenes');
  const ordenes = await q(
    `SELECT id, cliente, direccion, created_at, DATEDIFF(NOW(), created_at) AS dias
     FROM ordenes
     WHERE estado = 'pendiente'
       AND created_at < (NOW() - INTERVAL ? DAY)
       AND (seguimiento_avisado IS NULL OR seguimiento_avisado < (NOW() - INTERVAL ? DAY))
     ORDER BY created_at`,
    [DIAS_ESTANCADA, REAVISO_DIAS]
  );
  const resumen = { ordenes: ordenes.length, correos: 0, errores: 0 };
  if (!ordenes.length) return resumen;
  const to = destinoAdmin();
  if (!to) throw new Error('No hay destinatario: define BACKUP_EMAIL o GMAIL_USER');
  try {
    await enviarCorreo({
      to,
      subject: `⚠️ ${ordenes.length} orden(es) sin atender hace más de ${DIAS_ESTANCADA} días`,
      html: htmlEstancadas({ ordenes, dias: DIAS_ESTANCADA, url: `${SITIO}/admin.html` })
    });
    const ids = ordenes.map(o => o.id);
    await q(`UPDATE ordenes SET seguimiento_avisado = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    resumen.correos = 1;
  } catch (err) {
    resumen.errores = 1;
    console.error('Aviso de órdenes estancadas fallido:', err.message);
  }
  return resumen;
}

// ---- 14. Reporte semanal ----
async function datosSemana() {
  const [recibidas] = await q(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(estado = 'completado'), 0) AS completadas,
            COALESCE(SUM(estado = 'rechazada'), 0) AS rechazadas,
            COALESCE(SUM(estado NOT IN ('completado','rechazada')), 0) AS en_proceso,
            COALESCE(SUM(CASE WHEN estado = 'completado' THEN COALESCE(monto, 0) ELSE 0 END), 0) AS ingresos
     FROM ordenes WHERE created_at >= (NOW() - INTERVAL 7 DAY)`
  );
  const [cal] = await q(
    `SELECT COUNT(*) AS total, ROUND(AVG(estrellas), 1) AS promedio
     FROM calificaciones WHERE created_at >= (NOW() - INTERVAL 7 DAY)`
  );
  const [pend] = await q(
    `SELECT COUNT(*) AS total FROM ordenes
     WHERE estado = 'pendiente' AND created_at < (NOW() - INTERVAL ? DAY)`, [DIAS_ESTANCADA]
  );
  const visitas = await q(
    `SELECT id, cliente, fecha_visita, hora_visita, tecnico_nombre FROM ordenes
     WHERE fecha_visita >= CURDATE() AND fecha_visita < (CURDATE() + INTERVAL 7 DAY)
       AND estado NOT IN ('rechazada','completado')
     ORDER BY fecha_visita, hora_visita LIMIT 30`
  );
  return { recibidas, calificaciones: cal, estancadas: pend.total, visitas };
}

async function reporteSemanal() {
  const to = destinoAdmin();
  if (!to) throw new Error('No hay destinatario: define BACKUP_EMAIL o GMAIL_USER');
  const datos = await datosSemana();
  await enviarCorreo({
    to,
    subject: `📊 Resumen semanal — ${datos.recibidas.total} orden(es) nuevas`,
    html: htmlReporteSemanal({ ...datos, url: `${SITIO}/admin.html` })
  });
  return { ok: true, ordenes_nuevas: Number(datos.recibidas.total), visitas_proximas: datos.visitas.length };
}

module.exports = { enviarEncuestas, avisarEstancadas, reporteSemanal, asegurarColumnas, datosSemana };
