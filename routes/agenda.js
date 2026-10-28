// =============================================
// VOLTIA PRO SPA — routes/agenda.js
// Calendario de visitas de los técnicos (solo administrador).
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { validarVisita, buscarChoque, fechaCorta } = require('../services/agenda');
const { enviarCorreo, htmlVisitaReprogramada } = require('../services/correo');

router.use(verificarToken, soloAdmin);

// Fecha DATE de MySQL (Date o texto) -> AAAA-MM-DD
function aTexto(v) {
  if (typeof v === 'string') return v.slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 62;

// GET /agenda/sin-fecha — órdenes activas que no tienen fecha u hora de visita
// (por ejemplo las creadas antes de que se guardara la visita). No salen en el calendario.
router.get('/sin-fecha', async (req, res) => {
  try {
    const [filas] = await db.promise().query(
      `SELECT o.id, o.cliente, o.direccion, o.estado, o.tecnico_nombre, o.tecnico_email,
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ',') AS servicios
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE (o.fecha_visita IS NULL OR o.hora_visita IS NULL OR o.hora_visita = '')
         AND o.estado NOT IN ('rechazada', 'completado')
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.json({
      ordenes: filas.map(f => ({
        id: f.id,
        cliente: f.cliente,
        direccion: f.direccion,
        estado: f.estado,
        tecnico_nombre: f.tecnico_nombre,
        tecnico_email: f.tecnico_email ? String(f.tecnico_email).toLowerCase() : null,
        servicios: f.servicios ? f.servicios.split(',') : []
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar las órdenes sin fecha.' });
  }
});

// GET /agenda?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — visitas del rango (sin las rechazadas)
router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!FECHA.test(String(desde || '')) || !FECHA.test(String(hasta || ''))) {
    return res.status(400).json({ error: 'Indica las fechas "desde" y "hasta" (AAAA-MM-DD).' });
  }
  const dias = (new Date(hasta + 'T00:00:00Z') - new Date(desde + 'T00:00:00Z')) / 86400000;
  if (!(dias >= 0) || dias > MAX_DIAS) {
    return res.status(400).json({ error: `El rango debe ser de entre 0 y ${MAX_DIAS} días.` });
  }

  try {
    const [filas] = await db.promise().query(
      `SELECT o.id, o.cliente, o.direccion, o.estado, o.tecnico_nombre, o.tecnico_email,
              DATE_FORMAT(o.fecha_visita, '%Y-%m-%d') AS fecha, o.hora_visita AS hora,
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ',') AS servicios
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.fecha_visita BETWEEN ? AND ? AND o.estado <> 'rechazada'
       GROUP BY o.id
       ORDER BY o.fecha_visita, o.hora_visita`,
      [desde, hasta]
    );
    res.json({
      visitas: filas.map(f => ({
        id: f.id,
        cliente: f.cliente,
        direccion: f.direccion,
        estado: f.estado,
        tecnico_nombre: f.tecnico_nombre,
        tecnico_email: f.tecnico_email ? String(f.tecnico_email).toLowerCase() : null,
        fecha: f.fecha,
        hora: f.hora,
        servicios: f.servicios ? f.servicios.split(',') : []
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar la agenda. ¿La tabla ordenes tiene fecha_visita y hora_visita?' });
  }
});

// PUT /agenda/:id — reprogramar la visita de una orden
router.put('/:id', async (req, res) => {
  const { fecha_visita, hora_visita } = req.body;
  const error = validarVisita(fecha_visita, hora_visita);
  if (error) return res.status(400).json({ error });

  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.id, o.estado, o.cliente, o.direccion, o.tecnico_nombre, o.tecnico_email,
              o.fecha_visita, o.hora_visita, u.email AS cliente_email, u.nombre AS cliente_nombre
       FROM ordenes o LEFT JOIN usuarios u ON u.id = o.usuario_id WHERE o.id = ?`, [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    const orden = ordenes[0];

    // Si ya tiene técnico, no se puede mover a una hora en la que él está ocupado
    const choque = await buscarChoque(db, orden.tecnico_email, fecha_visita, hora_visita, orden.id);
    if (choque) {
      return res.status(409).json({
        error: `${orden.tecnico_nombre || 'El técnico'} ya tiene la orden #${choque.id} (${choque.cliente}) el ${fechaCorta(fecha_visita)} a las ${hora_visita}.`
      });
    }

    await db.promise().query(
      'UPDATE ordenes SET fecha_visita = ?, hora_visita = ? WHERE id = ?',
      [fecha_visita, hora_visita, orden.id]
    );

    // Avisar por correo al cliente y al técnico (si el horario realmente cambió).
    // Si el correo falla, la visita igual queda reprogramada: solo se informa en "avisos".
    const antes = orden.fecha_visita && orden.hora_visita
      ? { fecha: aTexto(orden.fecha_visita), hora: orden.hora_visita } : null;
    const ahora = { fecha: fecha_visita, hora: hora_visita };
    const avisos = { cliente: 'sin_correo', tecnico: 'sin_tecnico' };
    if (!antes || antes.fecha !== ahora.fecha || antes.hora !== ahora.hora) {
      const envios = [
        ['cliente', orden.cliente_email, orden.cliente_nombre || orden.cliente],
        ['tecnico', orden.tecnico_email, orden.tecnico_nombre]
      ];
      await Promise.all(envios.map(async ([para, correo, nombre]) => {
        if (!correo) return;
        try {
          await enviarCorreo({
            to: correo,
            subject: `📅 ${antes ? 'Visita reprogramada' : 'Visita agendada'} — orden #${orden.id}`,
            html: htmlVisitaReprogramada({ para, nombre, orden, antes, ahora })
          });
          avisos[para] = 'enviado';
        } catch (mailErr) {
          console.error(`No se pudo avisar al ${para} de la orden #${orden.id}:`, mailErr.message);
          avisos[para] = 'error';
        }
      }));
    } else {
      avisos.cliente = avisos.tecnico = 'sin_cambio';
    }
    res.json({ ok: true, mensaje: 'Visita reprogramada.', avisos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reprogramar la visita.' });
  }
});

module.exports = router;
