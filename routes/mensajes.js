// =============================================
// SERVICE PRO SPA — routes/mensajes.js
// Guarda mensajes en BD + envía mail con nodemailer
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');

// =============================================
// CONFIGURACIÓN DE GMAIL
// Reemplaza con tu correo y contraseña de aplicación
// =============================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// =============================================
// GET /mensajes — obtener todos (admin)
// =============================================
router.get('/', async (req, res) => {
  try {
    const [mensajes] = await db.promise().query(
      'SELECT * FROM mensajes_chatbot ORDER BY created_at DESC'
    );
    res.json(mensajes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes.' });
  }
});

// =============================================
// POST /mensajes — Guardar mensaje + enviar mail
// =============================================
router.post('/', async (req, res) => {
  const { nombre, email, mensaje } = req.body;

  // Validar que llegue el mensaje
  if (!mensaje || mensaje.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }

  try {
    // 1. Guardar en base de datos
    await db.promise().query(
      'INSERT INTO mensajes_chatbot (nombre, email, mensaje) VALUES (?, ?, ?)',
      [
        nombre?.trim() || 'Anónimo',
        email?.trim() || null,
        mensaje.trim()
      ]
    );

    // 2. Enviar notificación por mail
    const mailOptions = {
      from: 'serviceprospa777@gmail.com',
      to: 'serviceprospa777@gmail.com',
      subject: '📩 Nuevo mensaje en el chatbot — Service Pro SPA',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
          <h2 style="color: #f97316;">⚡ Service Pro SPA</h2>
          <h3 style="color: #333;">Nuevo mensaje del chatbot</h3>
          <table style="width:100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #555;">Nombre:</td>
              <td style="padding: 8px;">${nombre || 'Anónimo'}</td>
            </tr>
            <tr style="background:#fff;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Email:</td>
              <td style="padding: 8px;">${email || 'No proporcionado'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #555;">Mensaje:</td>
              <td style="padding: 8px;">${mensaje}</td>
            </tr>
            <tr style="background:#fff;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Fecha:</td>
              <td style="padding: 8px;">${new Date().toLocaleString('es-CL')}</td>
            </tr>
          </table>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">Este mensaje fue enviado desde el chatbot de Service Pro SPA.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true, mensaje: 'Mensaje recibido correctamente. Te contactaremos pronto.' });

  } catch (err) {
    console.error('Error en mensajes:', err);
    res.status(500).json({ error: 'Error al procesar el mensaje.' });
  }
});

module.exports = router;
