// =============================================
// VOLTIA PRO SPA — routes/ordenes.js
// =============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verificarToken, tokenOpcional, soloAdmin } = require('../middleware/auth');
const { validarVisita, buscarChoque, fechaCorta } = require('../services/agenda');

// =============================================
// ENVIAR CORREO CON RESEND
// Usamos fetch a la API de Resend en vez de Nodemailer/SMTP,
// porque Render (plan gratis) bloquea las conexiones SMTP salientes.
// =============================================
async function enviarCorreo({ to, subject, html, attachments }) {
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
      html,
      ...(attachments && attachments.length ? { attachments } : {})
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend error (${res.status}): ${errorBody}`);
  }

  return res.json();
}

// Normaliza un celular chileno a formato internacional sin "+" (ej: 56912345678).
// Acepta "+56 9 1234 5678", "56912345678", "9 1234 5678" o "912345678".
// Devuelve null si no es válido.
function normalizarTelefonoCL(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 9 && digitos.startsWith('9')) digitos = '56' + digitos;
  return /^569\d{8}$/.test(digitos) ? digitos : null;
}

// =============================================
// FOTOS DEL PROBLEMA
// El navegador las comprime y las manda como data URL (base64) dentro del
// POST /ordenes. Aquí se validan de verdad (tipo, firma del archivo y tamaño):
// nunca confiamos en lo que diga el cliente.
// =============================================
const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 1.5 * 1024 * 1024; // 1.5 MB por foto, ya decodificada

// Firmas (magic bytes) de los formatos permitidos
function detectarMime(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// Devuelve [{ mime, datos }] o lanza un Error con .status = 400
function procesarFotos(fotos) {
  if (fotos === undefined || fotos === null) return [];

  const fallo = (msg) => { const e = new Error(msg); e.status = 400; return e; };

  if (!Array.isArray(fotos)) throw fallo('El formato de las fotos no es válido.');
  if (fotos.length > MAX_FOTOS) throw fallo(`Puedes adjuntar hasta ${MAX_FOTOS} fotos.`);

  return fotos.map((foto, i) => {
    const m = typeof foto === 'string' && foto.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!m) throw fallo(`La foto ${i + 1} no es válida. Usa imágenes JPG, PNG o WEBP.`);

    const datos = Buffer.from(m[1], 'base64');
    if (datos.length > MAX_BYTES_FOTO) throw fallo(`La foto ${i + 1} es demasiado pesada (máximo 1.5 MB).`);

    const mime = detectarMime(datos);
    if (!mime) throw fallo(`La foto ${i + 1} no es una imagen válida.`);

    return { mime, datos };
  });
}

// Adjuntos para Resend: [{ filename, content (base64) }]
function adjuntosDesdeFilas(filas) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return filas.map((f, i) => ({
    filename: `foto-${i + 1}.${ext[f.mime] || 'jpg'}`,
    content: Buffer.from(f.datos).toString('base64')
  }));
}

// GET /ordenes — obtener todas
// (cada orden trae `comentarios_usuario`, con todos los
// comentarios que ha dejado el cliente de esa orden)
router.get('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.*, 
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ', ') AS servicios,
              c.estrellas,
              c.comentario,
              (SELECT COUNT(*) FROM fotos_orden f WHERE f.orden_id = o.id) AS total_fotos
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       LEFT JOIN calificaciones c ON c.orden_id = o.id
       GROUP BY o.id, c.estrellas, c.comentario
       ORDER BY o.created_at DESC`
    );

    // Todos los comentarios, agrupados por usuario
    const [comentarios] = await db.promise().query(
      `SELECT usuario_id, orden_id, estrellas, comentario, created_at
       FROM calificaciones
       WHERE comentario IS NOT NULL AND comentario <> ''
       ORDER BY created_at DESC`
    );

    const porUsuario = new Map();
    for (const c of comentarios) {
      if (!porUsuario.has(c.usuario_id)) porUsuario.set(c.usuario_id, []);
      porUsuario.get(c.usuario_id).push({
        orden_id: c.orden_id,
        estrellas: c.estrellas,
        comentario: c.comentario,
        created_at: c.created_at
      });
    }

    for (const o of ordenes) {
      o.comentarios_usuario = porUsuario.get(o.usuario_id) || [];
    }

    res.json(ordenes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener órdenes.' });
  }
});

// GET /ordenes/mias — órdenes del usuario logueado, con su calificación
// y el técnico asignado (con su WhatsApp, para el botón del panel del cliente)
// (va ANTES de /:id, si no "mias" se interpretaría como un id)
router.get('/mias', verificarToken, async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      `SELECT o.id, o.direccion, o.estado, o.created_at, o.tecnico_nombre, o.tecnico_telefono,
              GROUP_CONCAT(DISTINCT s.servicio SEPARATOR ', ') AS servicios,
              c.estrellas, c.comentario,
              (SELECT COUNT(*) FROM fotos_orden f WHERE f.orden_id = o.id) AS total_fotos
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       LEFT JOIN calificaciones c ON c.orden_id = o.id
       WHERE o.usuario_id = ?
       GROUP BY o.id, c.estrellas, c.comentario
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(ordenes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tus órdenes.' });
  }
});

// GET /ordenes/ventas — resumen de ventas por mes (solo admin)
// (va ANTES de /:id, si no "ventas" se interpretaría como un id)
router.get('/ventas', verificarToken, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede ver las ventas.' });
  }

  try {
    // Resumen por mes (el mes es el de la fecha en que se creó la solicitud)
    const [meses] = await db.promise().query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes,
              COUNT(*) AS total,
              SUM(estado = 'completado') AS completadas,
              SUM(estado = 'rechazada') AS rechazadas,
              SUM(estado NOT IN ('completado', 'rechazada')) AS en_proceso
       FROM ordenes
       WHERE created_at IS NOT NULL
       GROUP BY mes
       ORDER BY mes DESC
       LIMIT 24`
    );

    // Desglose por servicio (una orden con varios servicios cuenta en cada uno)
    const [servicios] = await db.promise().query(
      `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS mes,
              s.servicio,
              COUNT(*) AS total,
              SUM(o.estado = 'completado') AS completadas,
              SUM(o.estado = 'rechazada') AS rechazadas
       FROM ordenes o
       JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.created_at IS NOT NULL
       GROUP BY mes, s.servicio
       ORDER BY mes DESC, s.servicio`
    );

    const num = (v) => Number(v) || 0;
    res.json({
      meses: meses.map(m => ({
        mes: m.mes,
        total: num(m.total),
        completadas: num(m.completadas),
        rechazadas: num(m.rechazadas),
        en_proceso: num(m.en_proceso)
      })),
      servicios: servicios.map(s => ({
        mes: s.mes,
        servicio: s.servicio,
        total: num(s.total),
        completadas: num(s.completadas),
        rechazadas: num(s.rechazadas)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las ventas.' });
  }
});

// PUT /ordenes/:id/monto — registrar el monto (en pesos) de una orden (solo admin)
router.put('/:id/monto', verificarToken, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede registrar montos.' });
  }

  // Vacío = quitar el monto
  const crudo = req.body.monto;
  const monto = (crudo === null || crudo === '') ? null : Number(crudo);

  if (monto !== null && (!Number.isInteger(monto) || monto < 0 || monto > 100000000)) {
    return res.status(400).json({ error: 'Ingresa un monto válido en pesos (número entero, sin puntos).' });
  }

  try {
    const [resultado] = await db.promise().query(
      'UPDATE ordenes SET monto = ? WHERE id = ?',
      [monto, req.params.id]
    );
    if (!resultado.affectedRows) {
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    res.json({ ok: true, monto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar el monto.' });
  }
});

// GET /ordenes/finanzas — ingresos por mes (solo admin)
// (va ANTES de /:id, si no "finanzas" se interpretaría como un id)
router.get('/finanzas', verificarToken, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede ver las finanzas.' });
  }

  try {
    const [filas] = await db.promise().query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes,
              SUM(CASE WHEN estado = 'completado' THEN COALESCE(monto, 0) ELSE 0 END) AS ingresos,
              SUM(estado = 'completado') AS completadas,
              SUM(estado = 'completado' AND monto IS NULL) AS completadas_sin_monto,
              SUM(CASE WHEN estado NOT IN ('completado', 'rechazada') THEN COALESCE(monto, 0) ELSE 0 END) AS en_proceso,
              SUM(CASE WHEN estado = 'rechazada' THEN COALESCE(monto, 0) ELSE 0 END) AS perdido,
              SUM(estado = 'rechazada') AS rechazadas
       FROM ordenes
       WHERE created_at IS NOT NULL
       GROUP BY mes
       ORDER BY mes DESC
       LIMIT 24`
    );

    const num = (v) => Number(v) || 0;
    res.json({
      meses: filas.map(f => ({
        mes: f.mes,
        ingresos: num(f.ingresos),
        completadas: num(f.completadas),
        completadas_sin_monto: num(f.completadas_sin_monto),
        en_proceso: num(f.en_proceso),
        perdido: num(f.perdido),
        rechazadas: num(f.rechazadas)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las finanzas.' });
  }
});

// POST /ordenes/:id/calificacion — calificar una orden completada
router.post('/:id/calificacion', verificarToken, async (req, res) => {
  const estrellas = Number(req.body.estrellas);
  const comentario = (req.body.comentario || '').toString().trim();

  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'La calificación debe ser de 1 a 5 estrellas.' });
  }
  if (comentario.length > 500) {
    return res.status(400).json({ error: 'El comentario no puede superar los 500 caracteres.' });
  }

  try {
    const [ordenes] = await db.promise().query(
      'SELECT id, estado, usuario_id FROM ordenes WHERE id = ?', [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });

    const orden = ordenes[0];
    if (orden.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes calificar tus propias órdenes.' });
    }
    if (orden.estado !== 'completado') {
      return res.status(400).json({ error: 'Solo puedes calificar órdenes completadas.' });
    }

    await db.promise().query(
      'INSERT INTO calificaciones (orden_id, usuario_id, estrellas, comentario) VALUES (?, ?, ?, ?)',
      [orden.id, req.user.id, estrellas, comentario || null]
    );
    res.json({ ok: true, mensaje: '¡Gracias por tu calificación!' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Esta orden ya fue calificada.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la calificación.' });
  }
});

// GET /ordenes/:id/fotos — fotos de una orden (como data URL, listas para un <img>)
// Pueden verlas: el admin, el dueño de la orden y el técnico asignado.
router.get('/:id/fotos', verificarToken, async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      'SELECT id, usuario_id, tecnico_email FROM ordenes WHERE id = ?', [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    const orden = ordenes[0];

    const esAdmin = req.user.rol === 'admin';
    const esDueno = orden.usuario_id !== null && orden.usuario_id === req.user.id;
    const esTecnico = req.user.rol === 'tecnico' && !!orden.tecnico_email &&
      orden.tecnico_email.toLowerCase() === String(req.user.email || '').toLowerCase();

    if (!esAdmin && !esDueno && !esTecnico) {
      return res.status(403).json({ error: 'No tienes permiso para ver estas fotos.' });
    }

    const [fotos] = await db.promise().query(
      'SELECT id, mime, datos FROM fotos_orden WHERE orden_id = ? ORDER BY id', [orden.id]
    );
    res.json(fotos.map(f => ({
      id: f.id,
      mime: f.mime,
      data: `data:${f.mime};base64,${Buffer.from(f.datos).toString('base64')}`
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las fotos.' });
  }
});

// GET /ordenes/:id
// Pueden verla: el admin, el dueño de la orden y el técnico asignado.
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [ordenes] = await db.promise().query(
      'SELECT * FROM ordenes WHERE id = ?', [req.params.id]
    );
    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    const orden = ordenes[0];

    const esAdmin = req.user.rol === 'admin';
    const esDueno = orden.usuario_id !== null && orden.usuario_id === req.user.id;
    const esTecnico = req.user.rol === 'tecnico' && !!orden.tecnico_email &&
      orden.tecnico_email.toLowerCase() === String(req.user.email || '').toLowerCase();
    if (!esAdmin && !esDueno && !esTecnico) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta orden.' });
    }

    res.json(orden);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener orden.' });
  }
});

// POST /ordenes — crear orden
router.post('/', tokenOpcional, async (req, res) => {
  const { cliente, direccion, servicios, observaciones, fotos, fecha_visita, hora_visita } = req.body;

  if (!cliente || !direccion || !servicios || servicios.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  // Visita pedida por el cliente (opcional para no romper formularios antiguos, pero si viene debe ser válida)
  let visita = { fecha: null, hora: null };
  if (fecha_visita || hora_visita) {
    const errorVisita = validarVisita(fecha_visita, hora_visita);
    if (errorVisita) return res.status(400).json({ error: errorVisita });
    visita = { fecha: fecha_visita, hora: hora_visita };
  }

  // Validar las fotos ANTES de crear nada: si alguna es inválida no queda una orden a medias
  let fotosValidas;
  try {
    fotosValidas = procesarFotos(fotos);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  try {
    let result;
    try {
      [result] = await db.promise().query(
        'INSERT INTO ordenes (cliente, direccion, estado, observaciones, usuario_id, fecha_visita, hora_visita) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cliente, direccion, 'pendiente', observaciones || null, req.user ? req.user.id : null, visita.fecha, visita.hora]
      );
    } catch (insErr) {
      // Si la tabla aún no tiene las columnas de visita, la orden se crea igual (sin fecha)
      if (insErr.code !== 'ER_BAD_FIELD_ERROR') throw insErr;
      console.error('La tabla ordenes no tiene fecha_visita/hora_visita; se guarda sin visita.');
      [result] = await db.promise().query(
        'INSERT INTO ordenes (cliente, direccion, estado, observaciones, usuario_id) VALUES (?, ?, ?, ?, ?)',
        [cliente, direccion, 'pendiente', observaciones || null, req.user ? req.user.id : null]
      );
    }

    const ordenId = result.insertId;

    // Insertar servicios
    for (const servicio of servicios) {
      await db.promise().query(
        'INSERT INTO servicios_orden (orden_id, servicio) VALUES (?, ?)',
        [ordenId, servicio]
      );
    }

    // Guardar las fotos. Si esto falla, la orden igual queda creada.
    let fotosGuardadas = 0;
    if (fotosValidas.length) {
      try {
        await db.promise().query(
          'INSERT INTO fotos_orden (orden_id, mime, tamano, datos) VALUES ?',
          [fotosValidas.map(f => [ordenId, f.mime, f.datos.length, f.datos])]
        );
        fotosGuardadas = fotosValidas.length;
      } catch (fotoErr) {
        console.error('Error guardando fotos (orden igual quedó creada):', fotoErr);
      }
    }

    // Enviar notificación directa por correo con Resend
    try {
      await enviarCorreo({
        attachments: fotosGuardadas ? adjuntosDesdeFilas(fotosValidas) : undefined,
        to: process.env.GMAIL_USER || 'serviceprospa777@gmail.com',
        subject: `⚡ Nueva orden recibida #${ordenId} — Voltia Pro SPA`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body>
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
            <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
            <h3 style="color: #333;">¡Nueva orden de servicio recibida!</h3>
            <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Orden #:</td>
                <td style="padding: 8px;">#${ordenId}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Cliente:</td>
                <td style="padding: 8px;">${cliente}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Dirección:</td>
                <td style="padding: 8px;">${direccion}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Servicios:</td>
                <td style="padding: 8px;">${servicios.join(', ')}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Observaciones:</td>
                <td style="padding: 8px;">${observaciones || 'Sin observaciones'}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Fotos:</td>
                <td style="padding: 8px;">${fotosGuardadas ? `📷 ${fotosGuardadas} adjunta${fotosGuardadas > 1 ? 's' : ''} a este correo` : 'Sin fotos'}</td>
              </tr>
            </table>
            <p style="margin-top: 20px; color: #555; font-size: 13px;">Puedes gestionar esta orden desde el panel de administración.</p>
            <p style="color: #999; font-size: 12px; margin-top: 10px;">Voltia Pro SPA — Sistema de Gestión</p>
          </div>
          </body>
          </html>
        `
      });
    } catch (mailErr) {
      console.error('Error enviando correo con Resend (orden igual quedó guardada):', mailErr);
    }

    // Avisar a n8n como respaldo si el webhook está disponible
    try {
      await fetch('https://matimunoz123.app.n8n.cloud/webhook/d9fc9708-d939-4be2-9fbf-c320ff727618', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente,
          direccion,
          servicios: servicios.join(', ')
        })
      });
    } catch (webhookErr) {
      // Ignorar si n8n no está disponible
    }

    res.json({
      ok: true,
      id: ordenId,
      fotos_guardadas: fotosGuardadas,
      mensaje: 'Orden creada correctamente.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la orden.' });
  }
});

// PUT /ordenes/:id/estado — cambiar estado (admin)
router.put('/:id/estado', verificarToken, soloAdmin, async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['pendiente', 'evaluada', 'cotizada', 'aprobada', 'completado', 'rechazada'];

  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    await db.promise().query(
      'UPDATE ordenes SET estado = ? WHERE id = ?',
      [estado, req.params.id]
    );
    res.json({ ok: true, mensaje: `Estado actualizado a ${estado}.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado.' });
  }
});

// PUT /ordenes/:id/asignar — asignar técnico (con su WhatsApp) y notificar por mail
router.put('/:id/asignar', verificarToken, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede asignar técnicos.' });
  }

  // Dos formas de asignar: con tecnico_id (técnico registrado, se valida su especialidad)
  // o, como antes, escribiendo nombre/email/WhatsApp a mano.
  const { tecnico_id } = req.body;
  let { tecnico_nombre, tecnico_email, tecnico_telefono } = req.body;
  let telefonoTecnico = null;

  if (!tecnico_id) {
    if (!tecnico_nombre || !tecnico_email) {
      return res.status(400).json({ error: 'Nombre y email del técnico son obligatorios.' });
    }

    telefonoTecnico = normalizarTelefonoCL(tecnico_telefono);
    if (!telefonoTecnico) {
      return res.status(400).json({ error: 'El WhatsApp del técnico es obligatorio (ej: +56 9 1234 5678).' });
    }
  }

  try {
    // Obtener datos de la orden
    const [ordenes] = await db.promise().query(
      `SELECT o.*, GROUP_CONCAT(s.servicio SEPARATOR ', ') as servicios
       FROM ordenes o
       LEFT JOIN servicios_orden s ON s.orden_id = o.id
       WHERE o.id = ?
       GROUP BY o.id`,
      [req.params.id]
    );

    if (!ordenes.length) return res.status(404).json({ error: 'Orden no encontrada.' });
    const orden = ordenes[0];

    // Técnico registrado: debe estar activo y hacer TODOS los servicios de la orden
    if (tecnico_id) {
      const [tecnicos] = await db.promise().query('SELECT * FROM tecnicos WHERE id = ?', [tecnico_id]);
      if (!tecnicos.length || !tecnicos[0].activo) {
        return res.status(400).json({ error: 'El técnico no existe o está desactivado.' });
      }
      const t = tecnicos[0];

      const [pedidos] = await db.promise().query(
        'SELECT servicio FROM servicios_orden WHERE orden_id = ?', [orden.id]
      );
      const sabe = String(t.especialidades || '').split(',');
      const etiquetas = { camara: 'cámaras', enchufe: 'enchufes', alumbrado: 'alumbrado' };
      const faltan = [...new Set(pedidos.map(p => p.servicio).filter(s => s && !sabe.includes(s)))];
      if (faltan.length) {
        return res.status(400).json({
          error: `${t.nombre} no realiza: ${faltan.map(f => etiquetas[f] || f).join(', ')}. Elige otro técnico.`
        });
      }

      telefonoTecnico = normalizarTelefonoCL(t.telefono);
      if (!telefonoTecnico) {
        return res.status(400).json({ error: `${t.nombre} no tiene un WhatsApp válido. Corrígelo en la sección Técnicos.` });
      }
      tecnico_nombre = t.nombre;
      tecnico_email = t.email;
    }

    // El técnico no puede tener otra orden activa a la misma fecha y hora
    try {
      const [v] = await db.promise().query(
        "SELECT DATE_FORMAT(fecha_visita, '%Y-%m-%d') AS f, hora_visita AS h FROM ordenes WHERE id = ?", [orden.id]
      );
      if (v[0] && v[0].f && v[0].h) {
        const choque = await buscarChoque(db, tecnico_email, v[0].f, v[0].h, orden.id);
        if (choque) {
          return res.status(409).json({
            error: `${tecnico_nombre} ya tiene la orden #${choque.id} (${choque.cliente}) el ${fechaCorta(v[0].f)} a las ${v[0].h}. Elige otro técnico o cambia la hora de la visita en la Agenda.`
          });
        }
      }
    } catch (choqueErr) {
      if (choqueErr.code !== 'ER_BAD_FIELD_ERROR') throw choqueErr;   // sin columnas de visita: no hay nada que validar
    }

    // Actualizar técnico en la orden
    await db.promise().query(
      'UPDATE ordenes SET tecnico_nombre = ?, tecnico_email = ?, tecnico_telefono = ?, estado = ? WHERE id = ?',
      [tecnico_nombre, tecnico_email, telefonoTecnico, 'evaluada', req.params.id]
    );

    // Fotos del problema, para que el técnico llegue mejor preparado
    let adjuntos = [];
    try {
      const [fotos] = await db.promise().query(
        'SELECT mime, datos FROM fotos_orden WHERE orden_id = ? ORDER BY id', [orden.id]
      );
      adjuntos = adjuntosDesdeFilas(fotos);
    } catch (fotoErr) {
      console.error('No se pudieron leer las fotos para el correo del técnico:', fotoErr);
    }

    // Enviar mail al técnico (Resend)
    // Nota: en el plan gratis de Resend sin dominio verificado, esto solo
    // funciona si tecnico_email es la misma cuenta con la que te registraste.
    try {
      await enviarCorreo({
        attachments: adjuntos,
        to: tecnico_email,
        subject: `⚡ Nueva orden asignada #${orden.id} — Voltia Pro SPA`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body>
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 10px;">
            <h2 style="color: #f97316;">⚡ Voltia Pro SPA</h2>
            <h3>Hola ${tecnico_nombre}, tienes una nueva orden asignada</h3>
            <table style="width:100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Orden #:</td>
                <td style="padding: 8px;">${orden.id}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Cliente:</td>
                <td style="padding: 8px;">${orden.cliente}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Dirección:</td>
                <td style="padding: 8px;">${orden.direccion}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Servicios:</td>
                <td style="padding: 8px;">${orden.servicios || '—'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #555;">Observaciones:</td>
                <td style="padding: 8px;">${orden.observaciones || 'Sin observaciones'}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Fotos:</td>
                <td style="padding: 8px;">${adjuntos.length ? `📷 ${adjuntos.length} foto${adjuntos.length > 1 ? 's' : ''} del problema adjunta${adjuntos.length > 1 ? 's' : ''} a este correo` : 'El cliente no adjuntó fotos'}</td>
              </tr>
            </table>
            <p style="margin-top: 20px; color: #333;">Por favor dirígete a la dirección indicada para evaluar el trabajo.</p>
            <p style="color: #999; font-size: 12px;">Voltia Pro SPA — Sistema de Gestión</p>
          </div>
          </body>
          </html>
        `
      });
    } catch (mailErr) {
      // Si el correo falla, igual dejamos al técnico asignado en la BD.
      console.error('Error enviando correo al técnico (orden igual quedó asignada):', mailErr);
    }

    res.json({ ok: true, mensaje: 'Técnico asignado y notificado correctamente.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar técnico.' });
  }
});

// DELETE /ordenes/:id
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    await db.promise().query('DELETE FROM servicios_orden WHERE orden_id = ?', [req.params.id]);
    await db.promise().query('DELETE FROM ordenes WHERE id = ?', [req.params.id]);
    res.json({ ok: true, mensaje: 'Orden eliminada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar orden.' });
  }
});

module.exports = router;