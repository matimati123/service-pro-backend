// =============================================
// VOLTIA PRO SPA — services/agenda.js
// Reglas de la agenda de visitas: horario de atención y choques entre técnicos.
// Cada visita ocupa una hora en punto (09:00, 10:00 ... 17:00), de lunes a viernes.
// =============================================

const HORAS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

// Estados en los que la visita ya no ocupa al técnico
const ESTADOS_LIBRES = ['rechazada', 'completado'];

function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });   // YYYY-MM-DD
}

// Devuelve un mensaje de error, o null si la visita es válida.
function validarVisita(fecha, hora, { permitirPasado = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return 'La fecha de la visita no es válida.';
  const d = new Date(fecha + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== fecha) return 'La fecha de la visita no es válida.';

  const dia = d.getUTCDay();
  if (dia === 0 || dia === 6) return 'Solo hay atención de lunes a viernes.';
  if (!HORAS.includes(hora)) return 'La hora debe estar entre las 09:00 y las 17:00, en punto.';
  if (!permitirPasado && fecha < hoyChile()) return 'La fecha de la visita no puede estar en el pasado.';
  return null;
}

// "2026-10-28" -> "28-10-2026"
function fechaCorta(fecha) {
  const [a, m, d] = String(fecha).split('-');
  return `${d}-${m}-${a}`;
}

// ¿Ese técnico ya tiene otra orden activa en ese mismo día y hora?
// Devuelve { id, cliente } de la orden que choca, o null.
async function buscarChoque(db, email, fecha, hora, excluirOrdenId) {
  if (!email) return null;
  const [filas] = await db.promise().query(
    `SELECT id, cliente FROM ordenes
     WHERE LOWER(tecnico_email) = LOWER(?)
       AND fecha_visita = ? AND hora_visita = ?
       AND estado NOT IN (${ESTADOS_LIBRES.map(() => '?').join(',')})
       AND id <> ?
     LIMIT 1`,
    [email, fecha, hora, ...ESTADOS_LIBRES, excluirOrdenId || 0]
  );
  return filas[0] || null;
}

module.exports = { HORAS, validarVisita, buscarChoque, fechaCorta, hoyChile };
