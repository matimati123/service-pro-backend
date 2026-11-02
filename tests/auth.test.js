const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { verificarToken, tokenOpcional, soloAdmin } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'servicepro_secret_2024';
const resFalso = () => ({ codigo: 200, status(c) { this.codigo = c; return this; }, json(c) { this.cuerpo = c; return this; } });
const firmar = (p, opts) => jwt.sign(p, SECRET, opts || { expiresIn: '1h' });

test('verificarToken: sin token responde 401', () => {
  const res = resFalso(); let paso = false;
  verificarToken({ headers: {} }, res, () => { paso = true; });
  assert.equal(res.codigo, 401); assert.equal(paso, false);
});

test('verificarToken: token falso o vencido responde 401', () => {
  for (const t of ['basura', jwt.sign({ id: 1 }, 'otro-secreto'), firmar({ id: 1 }, { expiresIn: -10 })]) {
    const res = resFalso(); let paso = false;
    verificarToken({ headers: { authorization: 'Bearer ' + t } }, res, () => { paso = true; });
    assert.equal(res.codigo, 401); assert.equal(paso, false);
  }
});

test('verificarToken: exige el prefijo Bearer', () => {
  const res = resFalso(); let paso = false;
  verificarToken({ headers: { authorization: firmar({ id: 1 }) } }, res, () => { paso = true; });
  assert.equal(res.codigo, 401); assert.equal(paso, false);
});

test('verificarToken: token válido deja el usuario en req.user', () => {
  const req = { headers: { authorization: 'Bearer ' + firmar({ id: 7, rol: 'cliente' }) } };
  let paso = false;
  verificarToken(req, resFalso(), () => { paso = true; });
  assert.equal(paso, true); assert.equal(req.user.id, 7);
});

test('tokenOpcional: nunca bloquea', () => {
  let n = 0;
  tokenOpcional({ headers: {} }, resFalso(), () => n++);
  tokenOpcional({ headers: { authorization: 'Bearer malo' } }, resFalso(), () => n++);
  const req = { headers: { authorization: 'Bearer ' + firmar({ id: 3 }) } };
  tokenOpcional(req, resFalso(), () => n++);
  assert.equal(n, 3); assert.equal(req.user.id, 3);
});

test('soloAdmin: bloquea a no administradores y deja pasar al admin', () => {
  for (const user of [undefined, { rol: 'cliente' }, { rol: 'tecnico' }]) {
    const res = resFalso(); let paso = false;
    soloAdmin({ user }, res, () => { paso = true; });
    assert.equal(res.codigo, 403); assert.equal(paso, false);
  }
  let paso = false;
  soloAdmin({ user: { rol: 'admin' } }, resFalso(), () => { paso = true; });
  assert.equal(paso, true);
});
