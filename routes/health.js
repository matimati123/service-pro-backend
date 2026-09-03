// =============================================
// VOLTIA PRO SPA — routes/health.js
// Endpoint simple para pings de mantenimiento (n8n, UptimeRobot, etc.)
// Hace una consulta real a la BD para evitar que Aiven se duerma
// por inactividad, no solo que Render responda.
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    await db.promise().query('SELECT 1');
    res.json({ ok: true, status: 'awake', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Error en /health:', err);
    res.status(500).json({ ok: false, error: 'No se pudo conectar a la base de datos.' });
  }
});

module.exports = router;