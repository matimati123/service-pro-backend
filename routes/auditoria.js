// =============================================
// VOLTIA PRO SPA — routes/auditoria.js
// GET /auditoria — historial de acciones (solo administrador).
//   ?limite=100 (máx. 300)  ?entidad=ordenes  ?entidad_id=24  ?usuario=correo  ?desde=AAAA-MM-DD  ?hasta=AAAA-MM-DD
// =============================================
const express = require('express');
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { asegurarTabla } = require('../services/auditoria');

const router = express.Router();
router.use(verificarToken, soloAdmin);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (req, res) => {
  try {
    if (!(await asegurarTabla())) return res.status(500).json({ error: 'La auditoría no está disponible.' });

    const { entidad, entidad_id, usuario, desde, hasta } = req.query;
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 100, 1), 300);
    const donde = [], params = [];
    if (entidad)    { donde.push('entidad = ?');            params.push(String(entidad)); }
    if (entidad_id) { donde.push('entidad_id = ?');         params.push(String(entidad_id)); }
    if (usuario)    { donde.push('usuario_email LIKE ?');   params.push('%' + String(usuario).replace(/[%_]/g, '') + '%'); }
    if (desde && FECHA.test(desde)) { donde.push('creado_en >= ?');                 params.push(desde + ' 00:00:00'); }
    if (hasta && FECHA.test(hasta)) { donde.push('creado_en < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(hasta); }

    const [filas] = await db.promise().query(
      `SELECT id, creado_en, usuario_email, usuario_rol, accion, entidad, entidad_id, detalle, ip
       FROM auditoria ${donde.length ? 'WHERE ' + donde.join(' AND ') : ''}
       ORDER BY id DESC LIMIT ?`,
      [...params, limite]
    );
    res.json({ total: filas.length, registros: filas });
  } catch (err) {
    console.error('Error al leer la auditoría:', err.message);
    res.status(500).json({ error: 'No se pudo leer el historial.' });
  }
});

module.exports = router;
