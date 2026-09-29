// =============================================
// VOLTIA PRO SPA — routes/ordenes.js
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, tokenOpcional } = require('../middleware/auth');

// =============================================
// ENVIAR CORREO CON RESEND
// Usamos fetch a la API de Resend en vez de Nodemailer/SMTP,
// porque Render (plan gratis) bloquea las conexiones SMTP salientes.
// =============================================
async function enviarCorreo({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Voltia Pro SPA <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend error (${res.status}): ${errorBody}`);
  }

  return res.json();
}

// GET /ordenes — obtener todas
router.get('/', async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.*, 
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ', ') AS servicios,
              c.estrellas,
              c.comentario
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       LEFT JOIN calificaciones c ON c.orden_id = o.id
       GROUP BY o.id, c.estrellas, c.comentario
       ORDER BY o.created_at DESC`
    );
    res.json(ordenes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener órdenes.' });
  }
});

// GET /ordenes/mias — órdenes del usuario logueado, con su calificación
// (va ANTES de /:id, si no "mias" se interpretaría como un id)
router.get('/mias', verificarToken, async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.id, o.direccion, o.estado, o.created_at,
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ', ') AS servicios,
              c.estrellas, c.comentario
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       LEFT JOIN calificaciones c ON c.orden_id = o.id
       WHERE o.usuario_id = ?
       GROUP BY o.id, c.estrellas, c.comentario
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(ordenes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tus órdenes.' });
  }
});

// POST /ordenes/:id/calificacion — calificar una orden completada
router.post('/:id/calificacion', verificarToken, async (req, res) => {
  const estrellas = Number(req.body.estrellas);
  const comentario = (req.body.comentario || '').toString().trim();

  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'La calificación debe ser de 1 a 5 estrellas.' });
  }
  if (comentario.length > 500) {
    return res.status(400).json({ error: 'El comentario no puede superar los 500 caracteres.' });
  }

  try {
    const [ordenes] = await db.promise().query(
      'SELECT id, estado, usuario_id FROM ordenes WHERE id = ?', [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });

    const orden = ordenes[0];
    if (orden.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes calificar tus propias órdenes.' });
    }
    if (orden.estado !== 'completado') {
      return res.status(400).json({ error: 'Solo puedes calificar órdenes completadas.' });
    }

    await db.promise().query(
      'INSERT INTO calificaciones (orden_id, usuario_id, estrellas, comentario) VALUES (?, ?, ?, ?)',
      [orden.id, req.user.id, estrellas, comentario || null]
    );
    res.json({ ok: true, mensaje: '¡Gracias por tu calificación!' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Esta orden ya fue calificada.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la calificación.' });
  }
});

// GET /ordenes/:id
router.get('/:id', async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      'SELECT * FROM ordenes WHERE id = ?', [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    res.json(ordenes[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener orden.' });
  }
});

// POST /ordenes — crear orden
router.post('/', tokenOpcional, async (req, res) => {
  const { cliente, direccion, servicios, observaciones } = req.body;

  if (!cliente || !direccion || !servicios || servicios.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    const [result] = await db.promise().query(
      'INSERT INTO ordenes (cliente, direccion, estado, observaciones, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [cliente, direccion, 'pendiente', observaciones || null, req.user ? req.user.id : null]
    );

    const ordenId = result.insertId;

    // Insertar servicios
    for (const servicio of servicios) {
      await db.promise().query(
        'INSERT INTO servicios_orden (orden_id, servicio) VALUES (?, ?)',
        [ordenId, servicio]
      );
    }

    // Avisar a n8n para que notifique por correo la nueva orden.
    // Igual que con Resend: si esto falla, no debe romper la creación
    // de la orden, que ya quedó guardada en la BD.
    try {
      await fetch('https://matimunoz123.app.n8n.cloud/webhook/d9fc9708-d939-4be2-9fbf-c320ff727618', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente,
          direccion,
          servicios: servicios.join(', ')
        })
      });
    } catch (webhookErr) {
      console.error('Error notificando a n8n (orden igual quedó creada):', webhookErr);
    }

    res.json({ ok: true, id: ordenId, mensaje: 'Orden creada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la orden.' });
  }
});

// PUT /ordenes/:id/estado — cambiar estado (admin)
router.put('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['pendiente', 'evaluada', 'cotizada', 'aprobada', 'completado', 'rechazada'];

  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    await db.promise().query(
      'UPDATE ordenes SET estado = ? WHERE id = ?',
      [estado, req.params.id]
    );
    res.json({ ok: true, mensaje: `Estado actualizado a ${estado}.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado.' });
  }
});

// PUT /ordenes/:id/asignar — asignar técnico y notificar por mail
router.put('/:id/asignar', async (req, res) => {
  const { tecnico_nombre, tecnico_email } = req.body;

  if (!tecnico_nombre || !tecnico_email) {
    return res.status(400).json({ error: 'Nombre y email del técnico son obligatorios.' });
  }

  try {
    // Obtener datos de la orden
    const [ordenes] = await db.promise().query(
      `SELECT o.*, GROUP_CONCAT(s.servicio SEPARATOR ', ') as servicios
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.id = ?
       GROUP BY o.id`,
      [req.params.id]
    );

    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    const orden = ordenes[0];

    // Actualizar técnico en la orden
    await db.promise().query(
      'UPDATE ordenes SET tecnico_nombre = ?, tecnico_email = ?, estado = ? WHERE id = ?',
      [tecnico_nombre, tecnico_email, 'evaluada', req.params.id]
    );

    // Enviar mail al técnico (Resend)
    // Nota: en el plan gratis de Resend sin dominio verificado, esto solo
    // funciona si tecnico_email es la misma cuenta con la que te registraste.
    try {
      await enviarCorreo({
        to: tecnico_email,
        subject: `⚡ Nueva orden asignada #${orden.id} — Voltia Pro SPA`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body>
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
            <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
            <h3>Hola ${tecnico_nombre}, tienes una nueva orden asignada</h3>
            <table style="width:100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Orden #:</td>
                <td style="padding: 8px;">${orden.id}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Cliente:</td>
                <td style="padding: 8px;">${orden.cliente}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Dirección:</td>
                <td style="padding: 8px;">${orden.direccion}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Servicios:</td>
                <td style="padding: 8px;">${orden.servicios || '—'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Observaciones:</td>
                <td style="padding: 8px;">${orden.observaciones || 'Sin observaciones'}</td>
              </tr>
            </table>
            <p style="margin-top: 20px; color: #333;">Por favor dirígete a la dirección indicada para evaluar el trabajo.</p>
            <p style="color: #999; font-size: 12px;">Voltia Pro SPA — Sistema de Gestión</p>
          </div>
          </body>
          </html>
        `
      });
    } catch (mailErr) {
      // Si el correo falla, igual dejamos al técnico asignado en la BD.
      console.error('Error enviando correo al técnico (orden igual quedó asignada):', mailErr);
    }

    res.json({ ok: true, mensaje: 'Técnico asignado y notificado correctamente.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar técnico.' });
  }
});

// DELETE /ordenes/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.promise().query('DELETE FROM servicios_orden WHERE orden_id = ?', [req.params.id]);
    await db.promise().query('DELETE FROM ordenes WHERE id = ?', [req.params.id]);
    res.json({ ok: true, mensaje: 'Orden eliminada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar orden.' });
  }
});

module.exports = router;