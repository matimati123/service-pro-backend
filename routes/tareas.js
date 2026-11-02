// =============================================
// VOLTIA PRO SPA — routes/tareas.js
// Tareas programadas que dispara GitHub Actions (cabecera x-backup-token = BACKUP_TOKEN):
//   POST /tareas/recordatorios   → avisa las visitas de mañana
//   POST /tareas/encuestas       → pide calificar el servicio a clientes con orden completada
//   POST /tareas/seguimiento     → avisa al admin de órdenes estancadas en "pendiente"
//   POST /tareas/reporte-semanal → resumen de la semana para el admin
// =============================================
const express = require('express');
const crypto = require('crypto');
const { enviarRecordatorios } = require('../services/recordatorios');
const { enviarEncuestas, avisarEstancadas, reporteSemanal } = require('../services/seguimiento');

const router = express.Router();
const enCurso = new Set();

function tokenValido(recibido) {
  const esperado = process.env.BACKUP_TOKEN || '';
  if (esperado.length < 24) return null;
  const a = Buffer.from(String(recibido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Registra una tarea: valida el token, evita ejecuciones simultáneas de la misma tarea y responde JSON.
function tarea(ruta, nombre, ejecutar) {
  router.post(ruta, async (req, res) => {
    const valido = tokenValido(req.get('x-backup-token'));
    if (valido === null) return res.status(503).json({ error: 'Tareas no configuradas' });
    if (!valido) return res.status(401).json({ error: 'No autorizado' });
    if (enCurso.has(ruta)) return res.status(429).json({ error: 'Ya hay una tarea en curso' });

    enCurso.add(ruta);
    try {
      res.json({ ok: true, ...(await ejecutar()) });
    } catch (err) {
      console.error(`Error en ${nombre}:`, err.message);
      res.status(500).json({ error: `No se pudo ejecutar: ${nombre}` });
    } finally {
      enCurso.delete(ruta);
    }
  });
}

tarea('/recordatorios', 'recordatorios', enviarRecordatorios);
tarea('/encuestas', 'encuestas', enviarEncuestas);
tarea('/seguimiento', 'seguimiento', avisarEstancadas);
tarea('/reporte-semanal', 'reporte semanal', reporteSemanal);

module.exports = router;
