// =============================================
// VOLTIA PRO SPA — services/recordatorios.js
// Recordatorio por correo, un día antes, de las visitas técnicas agendadas.
// Se avisa al cliente y al técnico. Cada orden se avisa una sola vez
// (columna ordenes.recordatorio_enviado); si la visita se reprograma, se limpia.
// =============================================
const db = require('../db');
const { enviarCorreo, htmlRecordatorioVisita } = require('./correo');

const ESTADOS_LIBRES = ['rechazada', 'completado'];
const q = (sql, params) => db.promise().query(sql, params).then(([filas]) => filas);

let columnaLista = null;   // null = sin comprobar, true/false = resultado

// Crea la columna de control si todavía no existe. Devuelve true si está disponible.
async function asegurarColumna() {
  if (columnaLista !== null) return columnaLista;
  try {
    const hay = await q(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ordenes' AND COLUMN_NAME = 'recordatorio_enviado'`
    );
    if (!hay.length) await q('ALTER TABLE ordenes ADD COLUMN recordatorio_enviado DATETIME NULL DEFAULT NULL');
    columnaLista = true;
  } catch (err) {
    console.error('No se pudo preparar la columna recordatorio_enviado:', err.message);
    columnaLista = false;
  }
  return columnaLista;
}

// "mañana" según la hora de Chile, en formato AAAA-MM-DD
function mananaChile(ahora = new Date()) {
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const d = new Date(hoy + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function enviarRecordatorios() {
  if (!(await asegurarColumna())) throw new Error('Falta la columna recordatorio_enviado en ordenes');
  const manana = mananaChile();

  const ordenes = await q(
    `SELECT o.id, o.cliente, o.direccion, o.tecnico_nombre, o.tecnico_email,
            o.fecha_visita, o.hora_visita, u.email AS cliente_email, u.nombre AS cliente_nombre
     FROM ordenes o LEFT JOIN usuarios u ON u.id = o.usuario_id
     WHERE o.fecha_visita = ? AND o.hora_visita IS NOT NULL AND o.hora_visita <> ''
       AND o.recordatorio_enviado IS NULL
       AND o.estado NOT IN (${ESTADOS_LIBRES.map(() => '?').join(',')})
     ORDER BY o.hora_visita`,
    [manana, ...ESTADOS_LIBRES]
  );

  const resumen = { fecha: manana, ordenes: ordenes.length, correos: 0, errores: 0, sin_correo: 0 };
  for (const o of ordenes) {
    const destinos = [
      ['cliente', o.cliente_email, o.cliente_nombre || o.cliente],
      ['tecnico', o.tecnico_email, o.tecnico_nombre]
    ].filter(d => d[1]);
    if (!destinos.length) { resumen.sin_correo++; continue; }

    let alguno = false;
    for (const [para, correo, nombre] of destinos) {
      try {
        await enviarCorreo({
          to: correo,
          subject: `⏰ Recordatorio: visita técnica mañana ${o.hora_visita} — orden #${o.id}`,
          html: htmlRecordatorioVisita({ para, nombre, orden: o, fecha: manana, hora: o.hora_visita })
        });
        resumen.correos++; alguno = true;
      } catch (err) {
        resumen.errores++;
        console.error(`Recordatorio fallido (orden #${o.id}, ${para}):`, err.message);
      }
    }
    // Solo se marca si al menos un aviso salió; si todo falló, se reintenta en la próxima corrida.
    if (alguno) await q('UPDATE ordenes SET recordatorio_enviado = NOW() WHERE id = ?', [o.id]);
  }
  return resumen;
}

module.exports = { enviarRecordatorios, asegurarColumna, mananaChile };
