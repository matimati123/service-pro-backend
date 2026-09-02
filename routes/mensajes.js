// =============================================
// VOLTIA PRO SPA — routes/mensajes.js
// Guarda mensajes en BD + envía mail con Resend (API HTTPS)
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// =============================================
// ENVIAR CORREO CON RESEND
// Usamos fetch a la API de Resend en vez de Nodemailer/SMTP,
// porque Render (plan gratis) bloquea las conexiones SMTP salientes.
// La API de Resend funciona por HTTPS normal, así que no tiene ese problema.
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

    // 2. Enviar notificación por mail (Resend)
    try {
      await enviarCorreo({
        to: 'serviceprospa777@gmail.com',
        subject: '📩 Nuevo mensaje en el chatbot — Voltia Pro SPA',
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body>
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
            <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
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
            <p style="color: #999; font-size: 12px; margin-top: 20px;">Este mensaje fue enviado desde el chatbot de Voltia Pro SPA.</p>
          </div>
          </body>
          </html>
        `
      });
    } catch (mailErr) {
      // Si el correo falla, igual el mensaje ya quedó guardado en la BD.
      // No queremos que el usuario vea un error si lo importante (guardar) sí funcionó.
      console.error('Error enviando correo (mensaje igual quedó guardado):', mailErr);
    }

    res.json({ ok: true, mensaje: 'Mensaje recibido correctamente. Te contactaremos pronto.' });

  } catch (err) {
    console.error('Error en mensajes:', err);
    res.status(500).json({ error: 'Error al procesar el mensaje.' });
  }
});

module.exports = router;