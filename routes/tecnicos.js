// =============================================
// VOLTIA PRO SPA — routes/tecnicos.js
// Técnicos con sus especialidades (solo administrador).
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken } = require('../middleware/auth');

// Mismas claves que usa el formulario de órdenes (servicios_orden.servicio)
const ESPECIALIDADES = ['camara', 'enchufe', 'alumbrado'];

function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede gestionar técnicos.' });
  }
  next();
}

router.use(verificarToken, soloAdmin);

// Celular chileno -> 569XXXXXXXX (o null si no es válido)
function normalizarTelefonoCL(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 9 && digitos.startsWith('9')) digitos = '56' + digitos;
  return /^569\d{8}$/.test(digitos) ? digitos : null;
}

// Valida el cuerpo. Devuelve { datos } o { error }
function validar(body) {
  const nombre = String(body.nombre || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const telefono = normalizarTelefonoCL(body.telefono);
  const esp = Array.isArray(body.especialidades) ? body.especialidades : [];

  if (!nombre || nombre.length > 100) return { error: 'Ingresa el nombre del técnico (máximo 100 caracteres).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return { error: 'Ingresa un email válido.' };
  if (!telefono) return { error: 'El WhatsApp no es válido. Ejemplo: +56 9 1234 5678.' };

  const especialidades = ESPECIALIDADES.filter(e => esp.includes(e));   // solo claves válidas, sin repetir
  if (!especialidades.length) return { error: 'Elige al menos una especialidad.' };

  return { datos: { nombre, email, telefono, especialidades: especialidades.join(',') } };
}

function formatear(t) {
  return {
    id: t.id,
    nombre: t.nombre,
    email: t.email,
    telefono: t.telefono,
    especialidades: String(t.especialidades || '').split(',').filter(Boolean),
    activo: !!t.activo
  };
}

// GET /tecnicos — lista (activos primero)
router.get('/', async (req, res) => {
  try {
    const [filas] = await db.promise().query(
      'SELECT id, nombre, email, telefono, especialidades, activo FROM tecnicos ORDER BY activo DESC, nombre'
    );
    res.json(filas.map(formatear));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los técnicos. ¿Ya ejecutaste el SQL de migración?' });
  }
});

// POST /tecnicos — crear
router.post('/', async (req, res) => {
  const { datos, error } = validar(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const [r] = await db.promise().query(
      'INSERT INTO tecnicos (nombre, email, telefono, especialidades) VALUES (?, ?, ?, ?)',
      [datos.nombre, datos.email, datos.telefono, datos.especialidades]
    );
    res.json({ ok: true, id: r.insertId, mensaje: 'Técnico registrado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un técnico con ese email.' });
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el técnico.' });
  }
});

// PUT /tecnicos/:id — editar datos y especialidades
router.put('/:id', async (req, res) => {
  const { datos, error } = validar(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const [r] = await db.promise().query(
      'UPDATE tecnicos SET nombre = ?, email = ?, telefono = ?, especialidades = ? WHERE id = ?',
      [datos.nombre, datos.email, datos.telefono, datos.especialidades, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Técnico no encontrado.' });
    res.json({ ok: true, mensaje: 'Técnico actualizado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un técnico con ese email.' });
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el técnico.' });
  }
});

// PUT /tecnicos/:id/activo — activar o desactivar (no se borra: las órdenes antiguas lo siguen mostrando)
router.put('/:id/activo', async (req, res) => {
  const activo = req.body.activo ? 1 : 0;
  try {
    const [r] = await db.promise().query('UPDATE tecnicos SET activo = ? WHERE id = ?', [activo, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Técnico no encontrado.' });
    res.json({ ok: true, activo: !!activo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar el estado del técnico.' });
  }
});

module.exports = router;
