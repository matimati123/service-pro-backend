// =============================================
// VOLTIA PRO SPA — routes/pagos.js
// Pago del anticipo de una orden con Webpay Plus.
//   GET  /pagos/mias                  estado de pago de las órdenes del cliente
//   POST /pagos/webpay/crear          inicia el pago { orden_id } -> { url, token }
//   ALL  /pagos/webpay/retorno        Webpay devuelve aquí al cliente (confirma y redirige)
//   GET  /pagos                       listado de pagos (solo admin)
// El monto SIEMPRE se calcula en el servidor a partir de ordenes.monto.
// =============================================

const express = require('express');
const db = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const webpay = require('../services/webpay');

const router = express.Router();

const FRONTEND = () => process.env.FRONTEND_URL || 'https://imaginative-gelato-77a91c.netlify.app';
const BACKEND = () => process.env.BACKEND_URL || 'https://service-pro-backend-u3wn.onrender.com';
const ESTADOS_PAGABLES = ['cotizada', 'aprobada'];

function volver(res, estado, ordenId) {
  const q = new URLSearchParams({ estado });
  if (ordenId) q.set('orden', String(ordenId));
  return res.redirect(`${FRONTEND()}/pago-resultado.html?${q.toString()}`);
}

// GET /pagos/mias
router.get('/mias', verificarToken, async (req, res) => {
  try {
    const pct = webpay.porcentajeAnticipo();
    const [filas] = await db.promise().query(
      `SELECT o.id AS orden_id, o.estado, o.monto,
              (SELECT p.monto FROM pagos p
                WHERE p.orden_id = o.id AND p.estado = 'pagado' ORDER BY p.id DESC LIMIT 1) AS pagado_monto
       FROM ordenes o WHERE o.usuario_id = ?`,
      [req.user.id]
    );
    res.json(filas.map(f => ({
      orden_id: f.orden_id,
      monto: f.monto,
      porcentaje: pct,
      anticipo: f.monto ? webpay.calcularAnticipo(f.monto, pct) : null,
      pagado: f.pagado_monto != null,
      pagado_monto: f.pagado_monto,
      puede_pagar: !!f.monto && f.monto > 0 && ESTADOS_PAGABLES.includes(f.estado) && f.pagado_monto == null
    })));
  } catch (err) {
    console.error('Error al leer pagos:', err);
    res.status(500).json({ error: 'No se pudo cargar el estado de tus pagos.' });
  }
});

// POST /pagos/webpay/crear
router.post('/webpay/crear', verificarToken, async (req, res) => {
  const ordenId = Number(req.body.orden_id);
  if (!Number.isInteger(ordenId) || ordenId <= 0) {
    return res.status(400).json({ error: 'Orden inválida.' });
  }

  try {
    const [ordenes] = await db.promise().query(
      'SELECT id, usuario_id, estado, monto FROM ordenes WHERE id = ?', [ordenId]
    );
    const orden = ordenes[0];
    if (!orden || orden.usuario_id !== req.user.id) {
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    if (!ESTADOS_PAGABLES.includes(orden.estado)) {
      return res.status(400).json({ error: 'Esta orden aún no está lista para pagar el anticipo.' });
    }
    if (!orden.monto || orden.monto <= 0) {
      return res.status(400).json({ error: 'Esta orden todavía no tiene un monto cotizado.' });
    }

    const [pagados] = await db.promise().query(
      "SELECT id FROM pagos WHERE orden_id = ? AND estado = 'pagado' LIMIT 1", [ordenId]
    );
    if (pagados.length) {
      return res.status(409).json({ error: 'El anticipo de esta orden ya fue pagado.' });
    }

    const monto = webpay.calcularAnticipo(orden.monto);
    if (monto < 50) {
      return res.status(400).json({ error: 'El monto del anticipo es demasiado bajo para pagar en línea.' });
    }

    // buy_order: máx. 26 caracteres, único
    const buyOrder = `V${ordenId}-${Date.now().toString(36)}`.slice(0, 26);
    const [ins] = await db.promise().query(
      "INSERT INTO pagos (orden_id, usuario_id, tipo, monto, buy_order, estado) VALUES (?, ?, 'anticipo', ?, ?, 'iniciado')",
      [ordenId, req.user.id, monto, buyOrder]
    );

    const tx = await webpay.crearTransaccion({
      buyOrder,
      sessionId: `u${req.user.id}`,
      monto,
      returnUrl: `${BACKEND()}/pagos/webpay/retorno`
    });
    if (!tx.token || !tx.url) throw new Error('Webpay no devolvió token.');

    await db.promise().query('UPDATE pagos SET token = ? WHERE id = ?', [tx.token, ins.insertId]);
    res.json({ url: tx.url, token: tx.token, monto });
  } catch (err) {
    console.error('Error al iniciar pago Webpay:', err.message);
    res.status(502).json({ error: 'No pudimos iniciar el pago. Intenta nuevamente en unos minutos.' });
  }
});

// Webpay devuelve al cliente aquí (POST con token_ws; GET si cancela o se agota el tiempo)
router.all('/webpay/retorno', async (req, res) => {
  const datos = { ...req.query, ...req.body };
  const tokenWs = datos.token_ws;
  const tokenAbortado = datos.TBK_TOKEN;
  const ordenCompra = datos.TBK_ORDEN_COMPRA;

  try {
    // Cliente canceló en Webpay, o se agotó el tiempo (no viene token_ws)
    if (!tokenWs) {
      let filas = [];
      if (tokenAbortado) {
        [filas] = await db.promise().query('SELECT id, orden_id FROM pagos WHERE token = ?', [String(tokenAbortado)]);
      } else if (ordenCompra) {
        [filas] = await db.promise().query('SELECT id, orden_id FROM pagos WHERE buy_order = ?', [String(ordenCompra)]);
      }
      if (filas[0]) {
        await db.promise().query("UPDATE pagos SET estado = 'anulado' WHERE id = ? AND estado = 'iniciado'", [filas[0].id]);
        return volver(res, 'cancelado', filas[0].orden_id);
      }
      return volver(res, 'error');
    }

    const [filas] = await db.promise().query('SELECT * FROM pagos WHERE token = ?', [String(tokenWs)]);
    const pago = filas[0];
    if (!pago) return volver(res, 'error');

    // Si recarga la página después de pagar, no se vuelve a confirmar
    if (pago.estado === 'pagado') return volver(res, 'ok', pago.orden_id);
    if (pago.estado !== 'iniciado') return volver(res, 'rechazado', pago.orden_id);

    let r;
    try {
      r = await webpay.confirmarTransaccion(String(tokenWs));
    } catch (e) {
      // Si la confirmación falló por red, consultamos el estado antes de rendirnos
      r = await webpay.estadoTransaccion(String(tokenWs));
    }

    const aprobado = r.status === 'AUTHORIZED' && r.response_code === 0
      && Number(r.amount) === pago.monto && r.buy_order === pago.buy_order;

    if (aprobado) {
      const ult4 = r.card_detail && r.card_detail.card_number ? String(r.card_detail.card_number).slice(-4) : null;
      await db.promise().query(
        `UPDATE pagos SET estado = 'pagado', codigo_autorizacion = ?, tarjeta_ult4 = ?, tipo_pago = ?, pagado_en = NOW()
         WHERE id = ? AND estado = 'iniciado'`,
        [r.authorization_code || null, ult4, r.payment_type_code || null, pago.id]
      );
      return volver(res, 'ok', pago.orden_id);
    }

    await db.promise().query("UPDATE pagos SET estado = 'rechazado' WHERE id = ? AND estado = 'iniciado'", [pago.id]);
    return volver(res, 'rechazado', pago.orden_id);
  } catch (err) {
    console.error('Error en retorno de Webpay:', err.message);
    return volver(res, 'error');
  }
});

// GET /pagos — últimos pagos (solo admin)
router.get('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [filas] = await db.promise().query(
      `SELECT id, orden_id, tipo, monto, estado, codigo_autorizacion, tarjeta_ult4, tipo_pago, creado_en, pagado_en
       FROM pagos ORDER BY id DESC LIMIT 200`
    );
    res.json(filas);
  } catch (err) {
    console.error('Error al listar pagos:', err);
    res.status(500).json({ error: 'No se pudieron cargar los pagos.' });
  }
});

module.exports = router;
