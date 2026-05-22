// =============================================
// SERVICE PRO SPA — routes/users.js
// Registro, Login con bcrypt + JWT
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'servicepro_secret_2024';

// GET /users — listar usuarios (solo admin)
router.get('/', async (req, res) => {
  try {
    const [usuarios] = await db.promise().query(
      'SELECT id, nombre, email, rol, created_at FROM usuarios ORDER BY created_at DESC'
    );
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// =============================================
// POST /users/registro — Crear cuenta nueva
// =============================================
router.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    // Verificar si el email ya existe
    const [existe] = await db.promise().query(
      'SELECT id FROM usuarios WHERE email = ?', [email]
    );

    if (existe.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    // Encriptar contraseña
    const hash = await bcrypt.hash(password, 10);

    // Insertar usuario
    await db.promise().query(
      'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
      [nombre.trim(), email.trim().toLowerCase(), hash]
    );

    res.json({ ok: true, mensaje: 'Cuenta creada correctamente.' });

  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
});

// =============================================
// POST /users/login — Iniciar sesión
// =============================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  try {
    // Buscar usuario por email
    const [usuarios] = await db.promise().query(
      'SELECT * FROM usuarios WHERE email = ?', [email.trim().toLowerCase()]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const usuario = usuarios[0];

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// =============================================
// POST /users/recuperar — Recuperar contraseña
// =============================================
router.post('/recuperar', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  try {
    const [usuarios] = await db.promise().query(
      'SELECT id FROM usuarios WHERE email = ?', [email.trim().toLowerCase()]
    );

    // Siempre respondemos igual por seguridad (no revelar si existe)
    res.json({ ok: true, mensaje: 'Si el correo existe, recibirás un enlace.' });

  } catch (err) {
    console.error('Error en recuperar:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

module.exports = router;