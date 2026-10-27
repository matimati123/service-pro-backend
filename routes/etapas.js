// =============================================
// VOLTIA PRO SPA — routes/etapas.js
// Ciclo de vida de cada proyecto (solo administrador).
//   GET /etapas/resumen            avance de todas las órdenes (para la tabla)
//   GET /etapas/:ordenId           etapas de una orden
//   PUT /etapas/:ordenId/:clave    guardar una etapa
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { POR_CLAVE, armarEtapas, calcularProgreso, validarEtapa } = require('../services/etapas');

router.use(verificarToken, soloAdmin);

const listaServicios = txt => (txt ? String(txt).split(',').filter(Boolean) : []);

// Las fechas DATE salen como Date; las devolvemos como AAAA-MM-DD sin correr de día por zona horaria
function fechaTexto(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}
const normalizarFila = f => ({ ...f, fecha: fechaTexto(f.fecha) });

router.get('/resumen', async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.id, GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ',') AS servicios
       FROM ordenes o LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.estado <> 'rechazada'
       GROUP BY o.id`
    );
    const [filas] = await db.promise().query('SELECT * FROM etapas_orden');
    const porOrden = {};
    filas.forEach(f => { (porOrden[f.orden_id] = porOrden[f.orden_id] || []).push(normalizarFila(f)); });

    res.json(ordenes.map(o => {
      const p = calcularProgreso(armarEtapas(porOrden[o.id], listaServicios(o.servicios)));
      return { orden_id: o.id, ...p };
    }));
  } catch (err) {
    console.error('Error en resumen de etapas:', err);
    res.status(500).json({ error: 'No se pudo cargar el avance de los proyectos.' });
  }
});

router.get('/:ordenId', async (req, res) => {
  const ordenId = Number(req.params.ordenId);
  if (!Number.isInteger(ordenId) || ordenId <= 0) return res.status(400).json({ error: 'Orden no válida.' });
  try {
    const [[orden]] = await db.promise().query(
      `SELECT o.id, o.cliente, o.direccion, o.estado,
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ',') AS servicios
       FROM ordenes o LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.id = ? GROUP BY o.id`, [ordenId]
    );
    if (!orden) return res.status(404).json({ error: 'La orden no existe.' });

    const [filas] = await db.promise().query('SELECT * FROM etapas_orden WHERE orden_id = ?', [ordenId]);
    const servicios = listaServicios(orden.servicios);
    const etapas = armarEtapas(filas.map(normalizarFila), servicios);
    res.json({
      orden: { id: orden.id, cliente: orden.cliente, direccion: orden.direccion, estado: orden.estado, servicios },
      etapas,
      progreso: calcularProgreso(etapas)
    });
  } catch (err) {
    console.error('Error al leer etapas:', err);
    res.status(500).json({ error: 'No se pudieron cargar las etapas del proyecto.' });
  }
});

router.put('/:ordenId/:clave', async (req, res) => {
  const ordenId = Number(req.params.ordenId);
  const clave = req.params.clave;
  if (!Number.isInteger(ordenId) || ordenId <= 0) return res.status(400).json({ error: 'Orden no válida.' });
  if (!POR_CLAVE[clave]) return res.status(404).json({ error: 'Esa etapa no existe.' });

  const v = validarEtapa(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const d = v.datos;
  if (!POR_CLAVE[clave].usaMonto) d.monto = null;

  try {
    const [[orden]] = await db.promise().query('SELECT id, estado FROM ordenes WHERE id = ?', [ordenId]);
    if (!orden) return res.status(404).json({ error: 'La orden no existe.' });

    const quien = String(req.user.email || req.user.nombre || req.user.id || '').slice(0, 150) || null;
    await db.promise().query(
      `INSERT INTO etapas_orden (orden_id, etapa, estado, fecha, responsable, referencia, monto, notas, actualizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), fecha = VALUES(fecha), responsable = VALUES(responsable),
         referencia = VALUES(referencia), monto = VALUES(monto), notas = VALUES(notas), actualizado_por = VALUES(actualizado_por)`,
      [ordenId, clave, d.estado, d.fecha, d.responsable, d.referencia, d.monto, d.notas, quien]
    );

    // Al completar la última etapa, la orden queda "completado" (si no estaba rechazada)
    let ordenCompletada = false;
    if (clave === 'finalizacion' && d.estado === 'completada' && orden.estado !== 'rechazada' && orden.estado !== 'completado') {
      await db.promise().query("UPDATE ordenes SET estado = 'completado' WHERE id = ?", [ordenId]);
      ordenCompletada = true;
    }
    res.json({ ok: true, orden_completada: ordenCompletada });
  } catch (err) {
    console.error('Error al guardar etapa:', err);
    res.status(500).json({ error: 'No se pudo guardar la etapa.' });
  }
});

module.exports = router;
