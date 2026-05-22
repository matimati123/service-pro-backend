// =============================================
// SERVICE PRO SPA — routes/ordenes.js
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// GET /ordenes — obtener todas
router.get('/', async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.*, GROUP_CONCAT(s.servicio SEPARATOR ', ') as servicios
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(ordenes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener órdenes.' });
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
router.post('/', async (req, res) => {
  const { cliente, direccion, servicios, observaciones } = req.body;

  if (!cliente || !direccion || !servicios || servicios.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    const [result] = await db.promise().query(
      'INSERT INTO ordenes (cliente, direccion, estado, observaciones) VALUES (?, ?, "pendiente", ?)',
      [cliente, direccion, observaciones || null]
    );

    const ordenId = result.insertId;

    // Insertar servicios
    for (const servicio of servicios) {
      await db.promise().query(
        'INSERT INTO servicios_orden (orden_id, servicio) VALUES (?, ?)',
        [ordenId, servicio]
      );
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
      'UPDATE ordenes SET tecnico_nombre = ?, tecnico_email = ?, estado = "evaluada" WHERE id = ?',
      [tecnico_nombre, tecnico_email, req.params.id]
    );

    // Enviar mail al técnico
    await transporter.sendMail({
      from: 'serviceprospa777@gmail.com',
      to: tecnico_email,
      subject: `⚡ Nueva orden asignada #${orden.id} — Service Pro SPA`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
          <h2 style="color: #f97316;">⚡ Service Pro SPA</h2>
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
          <p style="color: #999; font-size: 12px;">Service Pro SPA — Sistema de Gestión</p>
        </div>
      `
    });

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