// =============================================
// VOLTIA PRO SPA — services/webpay.js
// Cliente mínimo de Webpay Plus (Transbank, API REST).
// Por defecto usa el ambiente de INTEGRACIÓN (pruebas, sin dinero real).
// Para cobrar de verdad hay que definir en Render:
//   WEBPAY_ENV=produccion, WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY (los entrega Transbank).
// =============================================

// Credenciales públicas de prueba publicadas por Transbank (no son secretas).
const INTEGRACION = {
  codigo: '597055555532',
  clave: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
  host: 'https://webpay3gint.transbank.cl'
};
const PRODUCCION_HOST = 'https://webpay3g.transbank.cl';
const RUTA = '/rswebpaytransaction/api/webpay/v1.2/transactions';

function config() {
  if (process.env.WEBPAY_ENV === 'produccion') {
    const codigo = process.env.WEBPAY_COMMERCE_CODE;
    const clave = process.env.WEBPAY_API_KEY;
    if (!codigo || !clave) {
      throw new Error('Webpay en producción requiere WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY.');
    }
    return { codigo, clave, host: PRODUCCION_HOST, produccion: true };
  }
  return { ...INTEGRACION, produccion: false };
}

// Porcentaje del anticipo (entero entre 1 y 100). Por defecto 30.
function porcentajeAnticipo() {
  const n = Number(process.env.ANTICIPO_PORCENTAJE);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 30;
}

function calcularAnticipo(monto, porcentaje = porcentajeAnticipo()) {
  return Math.round(Number(monto) * porcentaje / 100);
}

async function llamar(metodo, ruta, cuerpo) {
  const c = config();
  const res = await fetch(c.host + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'Tbk-Api-Key-Id': c.codigo,
      'Tbk-Api-Key-Secret': c.clave
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const texto = await res.text();
  let datos = {};
  try { datos = texto ? JSON.parse(texto) : {}; } catch (e) { /* respuesta no JSON */ }
  if (!res.ok) {
    const err = new Error(`Webpay respondió ${res.status}: ${datos.error_message || texto.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return datos;
}

// Devuelve { token, url }
function crearTransaccion({ buyOrder, sessionId, monto, returnUrl }) {
  return llamar('POST', RUTA, {
    buy_order: buyOrder, session_id: sessionId, amount: monto, return_url: returnUrl
  });
}

// Confirma el pago. Solo se puede hacer una vez por token.
function confirmarTransaccion(token) {
  return llamar('PUT', `${RUTA}/${encodeURIComponent(token)}`);
}

function estadoTransaccion(token) {
  return llamar('GET', `${RUTA}/${encodeURIComponent(token)}`);
}

module.exports = {
  config, porcentajeAnticipo, calcularAnticipo,
  crearTransaccion, confirmarTransaccion, estadoTransaccion
};
