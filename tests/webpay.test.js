// Pruebas del cálculo del anticipo y de la configuración de Webpay (sin llamar a Transbank).
const test = require('node:test');
const assert = require('node:assert');

const webpay = require('../services/webpay');

function conEntorno(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; process.env[k] = vars[k]; if (vars[k] === undefined) delete process.env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
}

test('anticipo: 30% por defecto y redondeo a peso entero', () => {
  conEntorno({ ANTICIPO_PORCENTAJE: undefined }, () => {
    assert.strictEqual(webpay.porcentajeAnticipo(), 30);
    assert.strictEqual(webpay.calcularAnticipo(100000), 30000);
    assert.strictEqual(webpay.calcularAnticipo(100001), 30000);
    assert.strictEqual(webpay.calcularAnticipo(33333), 10000);
  });
});

test('anticipo: porcentaje configurable y valores inválidos vuelven a 30', () => {
  conEntorno({ ANTICIPO_PORCENTAJE: '50' }, () => assert.strictEqual(webpay.porcentajeAnticipo(), 50));
  conEntorno({ ANTICIPO_PORCENTAJE: '0' }, () => assert.strictEqual(webpay.porcentajeAnticipo(), 30));
  conEntorno({ ANTICIPO_PORCENTAJE: '150' }, () => assert.strictEqual(webpay.porcentajeAnticipo(), 30));
  conEntorno({ ANTICIPO_PORCENTAJE: 'abc' }, () => assert.strictEqual(webpay.porcentajeAnticipo(), 30));
});

test('config: por defecto usa integración (pruebas)', () => {
  conEntorno({ WEBPAY_ENV: undefined }, () => {
    const c = webpay.config();
    assert.strictEqual(c.produccion, false);
    assert.match(c.host, /webpay3gint\.transbank\.cl/);
  });
});

test('config: producción exige las credenciales propias', () => {
  conEntorno({ WEBPAY_ENV: 'produccion', WEBPAY_COMMERCE_CODE: undefined, WEBPAY_API_KEY: undefined }, () => {
    assert.throws(() => webpay.config(), /WEBPAY_COMMERCE_CODE/);
  });
  conEntorno({ WEBPAY_ENV: 'produccion', WEBPAY_COMMERCE_CODE: '123', WEBPAY_API_KEY: 'abc' }, () => {
    const c = webpay.config();
    assert.strictEqual(c.produccion, true);
    assert.match(c.host, /^https:\/\/webpay3g\.transbank\.cl$/);
  });
});
