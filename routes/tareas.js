// =============================================
// VOLTIA PRO SPA — routes/tareas.js
// Tareas programadas que dispara GitHub Actions (cabecera x-backup-token = BACKUP_TOKEN):
//   POST /tareas/recordatorios  → avisa las visitas de mañana
// =============================================
const express = require('express');
const crypto = require('crypto');
const { enviarRecordatorios } = require('../services/recordatorios');

const router = express.Router();
let enCurso = false;

function tokenValido(recibido) {
  const esperado = process.env.BACKUP_TOKEN || '';
  if (esperado.length < 24) return null;
  const a = Buffer.from(String(recibido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/recordatorios', async (req, res) => {
  const valido = tokenValido(req.get('x-backup-token'));
  if (valido === null) return res.status(503).json({ error: 'Tareas no configuradas' });
  if (!valido) return res.status(401).json({ error: 'No autorizado' });
  if (enCurso) return res.status(429).json({ error: 'Ya hay una tarea en curso' });

  enCurso = true;
  try {
    res.json({ ok: true, ...(await enviarRecordatorios()) });
  } catch (err) {
    console.error('Error en recordatorios:', err.message);
    res.status(500).json({ error: 'No se pudieron enviar los recordatorios' });
  } finally {
    enCurso = false;
  }
});

module.exports = router;
