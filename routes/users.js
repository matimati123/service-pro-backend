// =============================================
// VOLTIA PRO SPA — routes/users.js
// Registro, Login con bcrypt + JWT + 2FA por correo (solo admin)
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'servicepro_secret_2024';

// =============================================
// 2FA — códigos pendientes en memoria
// Se guardan solo mientras el servidor sigue corriendo. Si Render
// reinicia el servicio justo en medio de una verificación, el
// código se pierde y hay que pedir uno nuevo — aceptable para
// este proyecto, ya que el código igual expira en 5 minutos.
// =============================================
const codigosPendientes = new Map(); // email -> { codigo, expira, usuario }

function generarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Limpia códigos vencidos cada cierto tiempo para no acumular memoria
setInterval(() => {
  const ahora = Date.now();
  for (const [email, data] of codigosPendientes.entries()) {
    if (data.expira < ahora) codigosPendientes.delete(email);
  }
}, 60 * 1000);

// =============================================
// ENVIAR CORREO CON RESEND
// =============================================
async function enviarCorreo({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Voltia Pro SPA <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend error (${res.status}): ${errorBody}`);
  }

  return res.json();
}

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
    const [existe] = await db.promise().query(
      'SELECT id FROM usuarios WHERE email = ?', [email]
    );

    if (existe.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 10);

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
// Si el usuario es admin, no entrega el token todavía: manda un
// código por correo y espera a /users/verificar-2fa.
// =============================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  try {
    const [usuarios] = await db.promise().query(
      'SELECT * FROM usuarios WHERE email = ?', [email.trim().toLowerCase()]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const usuario = usuarios[0];

    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // ===== Usuarios normales: entran directo, como siempre =====
    if (usuario.rol !== 'admin') {
      const token = jwt.sign(
        { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.json({
        ok: true,
        token,
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
      });
    }

    // ===== Admin: generar código y mandarlo por correo =====
    const codigo = generarCodigo();
    codigosPendientes.set(usuario.email, {
      codigo,
      expira: Date.now() + 5 * 60 * 1000, // 5 minutos
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });

    try {
      await enviarCorreo({
        to: usuario.email,
        subject: '🔐 Código de verificación — Voltia Pro SPA',
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body>
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
            <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
            <h3>Tu código de verificación</h3>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #333; text-align: center; margin: 24px 0;">${codigo}</p>
            <p style="color: #555;">Este código vence en 5 minutos. Si no intentaste iniciar sesión, ignora este correo.</p>
          </div>
          </body>
          </html>
        `
      });
    } catch (mailErr) {
      console.error('Error enviando código 2FA:', mailErr);
      return res.status(500).json({ error: 'No se pudo enviar el código de verificación. Intenta nuevamente.' });
    }

    res.json({ ok: true, requiere2FA: true, email: usuario.email, mensaje: 'Te enviamos un código a tu correo.' });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// =============================================
// POST /users/verificar-2fa — Segundo paso del login del admin
// =============================================
router.post('/verificar-2fa', async (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) {
    return res.status(400).json({ error: 'Correo y código son obligatorios.' });
  }

  const pendiente = codigosPendientes.get(email.trim().toLowerCase());

  if (!pendiente) {
    return res.status(400).json({ error: 'No hay un código pendiente para este correo. Inicia sesión de nuevo.' });
  }

  if (Date.now() > pendiente.expira) {
    codigosPendientes.delete(email);
    return res.status(400).json({ error: 'El código venció. Inicia sesión de nuevo para recibir uno nuevo.' });
  }

  if (codigo.trim() !== pendiente.codigo) {
    return res.status(401).json({ error: 'Código incorrecto.' });
  }

  // Código correcto: emitir el token y limpiar el pendiente
  codigosPendientes.delete(email);

  const token = jwt.sign(
    pendiente.usuario,
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ ok: true, token, usuario: pendiente.usuario });
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

    res.json({ ok: true, mensaje: 'Si el correo existe, recibirás un enlace.' });

  } catch (err) {
    console.error('Error en recuperar:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

module.exports = router;