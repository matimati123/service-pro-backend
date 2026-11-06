const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ruta = path.join(__dirname, '..', 'middleware', 'jwtSecret.js');
function conEntorno(env, fn) {
  const antes = { JWT_SECRET: process.env.JWT_SECRET, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT };
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  delete require.cache[require.resolve(ruta)];
  try { return fn(); } finally {
    for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
    delete require.cache[require.resolve(ruta)];
  }
}

test('jwtSecret: usa JWT_SECRET cuando está definido', () => {
  const s = conEntorno({ JWT_SECRET: 'un-secreto-bien-largo-123', NODE_TEST_CONTEXT: undefined }, () => String(require(ruta)));
  assert.equal(s, 'un-secreto-bien-largo-123');
});

test('jwtSecret: sin JWT_SECRET (fuera de pruebas) el servidor no arranca', () => {
  assert.throws(() => conEntorno({ JWT_SECRET: undefined, NODE_TEST_CONTEXT: undefined }, () => require(ruta)), /JWT_SECRET/);
});

test('jwtSecret: un secreto corto se acepta (con aviso) para no tumbar el servidor', () => {
  const avisos = []; const original = console.warn; console.warn = m => avisos.push(m);
  try {
    const s = conEntorno({ JWT_SECRET: 'corto', NODE_TEST_CONTEXT: undefined }, () => String(require(ruta)));
    assert.equal(s, 'corto'); assert.equal(avisos.length, 1);
  } finally { console.warn = original; }
});
