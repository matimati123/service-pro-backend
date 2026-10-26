// =============================================
// VOLTIA PRO SPA — routes/reportes.js
// Reporte de órdenes (vista previa en JSON) y exportación a Excel.
// Solo para el administrador.
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken } = require('../middleware/auth');
const { construirExcelOrdenes, ESTADOS } = require('../services/excelOrdenes');

function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede ver los reportes.' });
  }
  next();
}

router.use(verificarToken, soloAdmin);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lee y valida los filtros del querystring. Lanza Error con .status = 400 si algo no es válido.
function leerFiltros(q) {
  const fallo = (msg) => { const e = new Error(msg); e.status = 400; return e; };
  const f = {};

  if (q.desde) {
    if (!FECHA.test(q.desde)) throw fallo('La fecha "desde" no es válida.');
    f.desde = q.desde;
  }
  if (q.hasta) {
    if (!FECHA.test(q.hasta)) throw fallo('La fecha "hasta" no es válida.');
    f.hasta = q.hasta;
  }
  if (f.desde && f.hasta && f.desde > f.hasta) {
    throw fallo('La fecha "desde" no puede ser posterior a "hasta".');
  }
  if (q.estado) {
    if (!Object.prototype.hasOwnProperty.call(ESTADOS, q.estado)) throw fallo('Estado no válido.');
    f.estado = q.estado;
  }
  if (q.tecnico) {
    f.tecnico = String(q.tecnico).slice(0, 100);
  }
  return f;
}

async function consultarOrdenes(f) {
  const where = [];
  const params = [];

  if (f.desde) { where.push('DATE(o.created_at) >= ?'); params.push(f.desde); }
  if (f.hasta) { where.push('DATE(o.created_at) <= ?'); params.push(f.hasta); }
  if (f.estado) { where.push('o.estado = ?'); params.push(f.estado); }
  if (f.tecnico) { where.push('o.tecnico_nombre = ?'); params.push(f.tecnico); }

  const [filas] = await db.promise().query(
    `SELECT o.id, o.created_at, o.cliente, o.direccion, o.estado,
            o.tecnico_nombre, o.fecha_visita, o.hora_visita, o.monto,
            GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ', ') AS servicios,
            c.estrellas
     FROM ordenes o
     LEFT JOIN servicios_orden s ON s.orden_id = o.id
     LEFT JOIN calificaciones c ON c.orden_id = o.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY o.id, c.estrellas
     ORDER BY o.created_at DESC`,
    params
  );
  return filas;
}

// GET /reportes/ordenes — vista previa + totales (JSON)
router.get('/ordenes', async (req, res) => {
  let filtros;
  try { filtros = leerFiltros(req.query); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }

  try {
    const ordenes = await consultarOrdenes(filtros);

    const [tecnicos] = await db.promise().query(
      `SELECT DISTINCT tecnico_nombre FROM ordenes
       WHERE tecnico_nombre IS NOT NULL AND tecnico_nombre <> ''
       ORDER BY tecnico_nombre`
    );

    const resumen = { total: ordenes.length, completadas: 0, rechazadas: 0, ingresos: 0, sin_monto: 0 };
    for (const o of ordenes) {
      if (o.estado === 'completado') {
        resumen.completadas++;
        if (o.monto === null) resumen.sin_monto++;
        else resumen.ingresos += Number(o.monto) || 0;
      }
      if (o.estado === 'rechazada') resumen.rechazadas++;
    }

    res.json({
      ordenes,
      resumen,
      tecnicos: tecnicos.map(t => t.tecnico_nombre)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar el reporte.' });
  }
});

// GET /reportes/ordenes.xlsx — descarga del Excel con los mismos filtros
router.get('/ordenes.xlsx', async (req, res) => {
  let filtros;
  try { filtros = leerFiltros(req.query); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }

  try {
    const ordenes = await consultarOrdenes(filtros);
    const archivo = construirExcelOrdenes(ordenes, filtros);

    const hoy = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-ordenes-${hoy}.xlsx"`);
    res.send(archivo);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Error al generar el Excel.' });
  }
});

module.exports = router;
