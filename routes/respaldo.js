// =============================================
// VOLTIA PRO SPA — routes/respaldo.js
// POST /respaldo/ejecutar  (cabecera x-backup-token = BACKUP_TOKEN)
// Lo llama una tarea programada (GitHub Actions) una vez al día.
// =============================================
const express = require('express');
const crypto = require('crypto');
const { ejecutarRespaldo } = require('../services/respaldo');

const router = express.Router();
let enCurso = false;

function tokenValido(recibido) {
  const esperado = process.env.BACKUP_TOKEN || '';
  if (esperado.length < 24) return null;          // token ausente o demasiado débil
  const a = Buffer.from(String(recibido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/ejecutar', async (req, res) => {
  const valido = tokenValido(req.get('x-backup-token'));
  if (valido === null) return res.status(503).json({ error: 'Respaldo no configurado' });
  if (!valido) return res.status(401).json({ error: 'No autorizado' });
  if (enCurso) return res.status(429).json({ error: 'Ya hay un respaldo en curso' });

  enCurso = true;
  try {
    res.json(await ejecutarRespaldo());
  } catch (err) {
    console.error('Error en respaldo:', err.message);
    res.status(500).json({ error: 'No se pudo completar el respaldo' });
  } finally {
    enCurso = false;
  }
});

module.exports = router;
