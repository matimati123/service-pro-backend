// =============================================
// VOLTIA PRO SPA — routes/materiales.js
// Inventario básico: materiales usados en cada orden (solo administrador).
//   GET    /materiales/resumen           ítems y costo por orden (para la tabla)
//   GET    /materiales/consolidado       total usado por material (todas las órdenes)
//   GET    /materiales/orden/:ordenId    lista de una orden
//   POST   /materiales/orden/:ordenId    agregar
//   PUT    /materiales/:id               editar
//   DELETE /materiales/:id               quitar
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

router.use(verificarToken, soloAdmin);

// Valida el cuerpo. Devuelve { datos } o { error }
function validar(body) {
  const b = body || {};
  const nombre = String(b.nombre || '').trim();
  if (!nombre || nombre.length > 100) return { error: 'Ingresa el nombre del material (máximo 100 caracteres).' };

  const cantidad = Number(String(b.cantidad).replace(',', '.'));
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1000000) return { error: 'La cantidad debe ser un número mayor que 0.' };
  const cantidadRedondeada = Math.round(cantidad * 100) / 100;

  const unidad = String(b.unidad || 'un').trim() || 'un';
  if (unidad.length > 20) return { error: 'La unidad es demasiado larga (máximo 20 caracteres).' };

  let costo = null;
  if (b.costo_unitario !== undefined && b.costo_unitario !== null && String(b.costo_unitario).trim() !== '') {
    const n = Number(b.costo_unitario);
    if (!Number.isInteger(n) || n < 0 || n > 2000000000) return { error: 'El costo unitario debe ser un número entero en pesos (0 o más).' };
    costo = n;
  }

  const notas = String(b.notas || '').trim();
  if (notas.length > 255) return { error: 'La nota es demasiado larga (máximo 255 caracteres).' };

  return { datos: { nombre, cantidad: cantidadRedondeada, unidad, costo_unitario: costo, notas: notas || null } };
}

const quien = req => String(req.user.email || req.user.nombre || req.user.id || '').slice(0, 150) || null;
const idValido = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get('/resumen', async (req, res) => {
  try {
    const [filas] = await db.promise().query(
      `SELECT orden_id, COUNT(*) AS items,
              COALESCE(SUM(ROUND(cantidad * COALESCE(costo_unitario, 0))), 0) AS costo_total
       FROM materiales_orden GROUP BY orden_id`
    );
    res.json(filas.map(f => ({ orden_id: f.orden_id, items: Number(f.items), costo_total: Number(f.costo_total) })));
  } catch (err) {
    console.error('Error en resumen de materiales:', err);
    res.status(500).json({ error: 'No se pudo cargar el resumen de materiales.' });
  }
});

router.get('/consolidado', async (req, res) => {
  try {
    const [filas] = await db.promise().query(
      `SELECT MIN(nombre) AS nombre, unidad, SUM(cantidad) AS cantidad_total,
              COALESCE(SUM(ROUND(cantidad * COALESCE(costo_unitario, 0))), 0) AS costo_total,
              COUNT(DISTINCT orden_id) AS ordenes
       FROM materiales_orden
       GROUP BY LOWER(nombre), unidad
       ORDER BY costo_total DESC, nombre ASC`
    );
    res.json(filas.map(f => ({
      nombre: f.nombre, unidad: f.unidad,
      cantidad_total: Number(f.cantidad_total), costo_total: Number(f.costo_total), ordenes: Number(f.ordenes)
    })));
  } catch (err) {
    console.error('Error en consolidado de materiales:', err);
    res.status(500).json({ error: 'No se pudo cargar el consolidado de materiales.' });
  }
});

router.get('/orden/:ordenId', async (req, res) => {
  const ordenId = idValido(req.params.ordenId);
  if (!ordenId) return res.status(400).json({ error: 'Orden no válida.' });
  try {
    const [[orden]] = await db.promise().query('SELECT id, cliente, direccion FROM ordenes WHERE id = ?', [ordenId]);
    if (!orden) return res.status(404).json({ error: 'La orden no existe.' });
    const [filas] = await db.promise().query(
      `SELECT id, nombre, cantidad, unidad, costo_unitario, notas, creado_por, creado_en,
              ROUND(cantidad * COALESCE(costo_unitario, 0)) AS subtotal
       FROM materiales_orden WHERE orden_id = ? ORDER BY id ASC`, [ordenId]
    );
    const materiales = filas.map(f => ({ ...f, cantidad: Number(f.cantidad), subtotal: Number(f.subtotal) }));
    res.json({ orden, materiales, costo_total: materiales.reduce((t, m) => t + m.subtotal, 0) });
  } catch (err) {
    console.error('Error al leer materiales:', err);
    res.status(500).json({ error: 'No se pudieron cargar los materiales.' });
  }
});

router.post('/orden/:ordenId', async (req, res) => {
  const ordenId = idValido(req.params.ordenId);
  if (!ordenId) return res.status(400).json({ error: 'Orden no válida.' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const d = v.datos;
  try {
    const [[orden]] = await db.promise().query('SELECT id FROM ordenes WHERE id = ?', [ordenId]);
    if (!orden) return res.status(404).json({ error: 'La orden no existe.' });
    const [r] = await db.promise().query(
      'INSERT INTO materiales_orden (orden_id, nombre, cantidad, unidad, costo_unitario, notas, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ordenId, d.nombre, d.cantidad, d.unidad, d.costo_unitario, d.notas, quien(req)]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('Error al agregar material:', err);
    res.status(500).json({ error: 'No se pudo agregar el material.' });
  }
});

router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'Material no válido.' });
  const v = validar(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const d = v.datos;
  try {
    const [r] = await db.promise().query(
      'UPDATE materiales_orden SET nombre = ?, cantidad = ?, unidad = ?, costo_unitario = ?, notas = ? WHERE id = ?',
      [d.nombre, d.cantidad, d.unidad, d.costo_unitario, d.notas, id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'El material no existe.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al editar material:', err);
    res.status(500).json({ error: 'No se pudo editar el material.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'Material no válido.' });
  try {
    const [r] = await db.promise().query('DELETE FROM materiales_orden WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'El material no existe.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al quitar material:', err);
    res.status(500).json({ error: 'No se pudo quitar el material.' });
  }
});

module.exports = router;
