const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { cargar, expressFalso, llamar } = require('./helpers');

const SECRET = process.env.JWT_SECRET || 'servicepro_secret_2024';

// Escenario: base de datos falsa con usuarios, bcrypt falso (hash = 'h:' + clave) y correo capturado.
function escenario(usuarios) {
  const correos = [];
  const { ex, r } = expressFalso();
  const db = { promise: () => ({ query: async (sql, p) => {
    if (/FROM usuarios WHERE email/.test(sql)) return [usuarios.filter(u => u.email === p[0])];
    return [[]];
  } }) };
  const bcrypt = { compare: async (clave, hash) => hash === 'h:' + clave, hash: async c => 'h:' + c };
  const correo = { enviarCorreo: async m => { correos.push(m); } };
  const aud = { registrar: () => {}, middleware: (q, s, n) => n() };
  cargar('routes/users.js', { express: ex, '../db': db, bcrypt, '../services/correo': correo, '../services/auditoria': aud });
  return { r, correos };
}
const usuarios = [
  { id: 1, nombre: 'Cliente', email: 'c@x.cl', rol: 'cliente', password: 'h:abc123' },
  { id: 2, nombre: 'Admin', email: 'admin@x.cl', rol: 'admin', password: 'h:secreta1' }
];
const codigoDe = correo => /letter-spacing[^>]*>(\d{6})</.exec(correo.html)[1];

test('login: faltan datos → 400; credenciales malas → 401 (mismo mensaje para ambos casos)', async () => {
  const { r } = escenario(usuarios);
  assert.equal((await llamar(r, 'POST', '/login', { body: { email: 'c@x.cl' } })).codigo, 400);
  const a = await llamar(r, 'POST', '/login', { body: { email: 'nadie@x.cl', password: 'abc123' } });
  const b = await llamar(r, 'POST', '/login', { body: { email: 'c@x.cl', password: 'mala' } });
  assert.equal(a.codigo, 401); assert.equal(b.codigo, 401);
  assert.equal(a.cuerpo.error, b.cuerpo.error);
});

test('login: usuario normal recibe token de 8 h con su rol', async () => {
  const { r, correos } = escenario(usuarios);
  const res = await llamar(r, 'POST', '/login', { body: { email: ' C@X.cl ', password: 'abc123' } });
  assert.equal(res.codigo, 200);
  const dec = jwt.verify(res.cuerpo.token, SECRET);
  assert.equal(dec.rol, 'cliente'); assert.equal(dec.exp - dec.iat, 8 * 3600);
  assert.equal(correos.length, 0);
  assert.equal(res.cuerpo.usuario.password, undefined);
});

test('login admin: NO entrega token, pide 2FA y manda el código por correo', async () => {
  const { r, correos } = escenario(usuarios);
  const res = await llamar(r, 'POST', '/login', { body: { email: 'admin@x.cl', password: 'secreta1' } });
  assert.equal(res.cuerpo.requiere2FA, true);
  assert.equal(res.cuerpo.token, undefined);
  assert.equal(correos.length, 1); assert.equal(correos[0].to, 'admin@x.cl');
  assert.match(codigoDe(correos[0]), /^\d{6}$/);
});

test('login admin: si el correo falla → 500 y no queda código pendiente', async () => {
  const { ex, r } = expressFalso();
  const db = { promise: () => ({ query: async () => [[usuarios[1]]] }) };
  cargar('routes/users.js', { express: ex, '../db': db, bcrypt: { compare: async () => true },
    '../services/correo': { enviarCorreo: async () => { throw new Error('gmail caído'); } },
    '../services/auditoria': { registrar() {} } });
  const l = await llamar(r, 'POST', '/login', { body: { email: 'admin@x.cl', password: 'x' } });
  assert.equal(l.codigo, 500);
  const v = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo: '123456' } });
  assert.equal(v.codigo, 400);
});

test('verificar-2fa: código correcto entrega token de admin y no se puede reutilizar', async () => {
  const { r, correos } = escenario(usuarios);
  await llamar(r, 'POST', '/login', { body: { email: 'admin@x.cl', password: 'secreta1' } });
  const codigo = codigoDe(correos[0]);
  const ok = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo } });
  assert.equal(ok.codigo, 200);
  assert.equal(jwt.verify(ok.cuerpo.token, SECRET).rol, 'admin');
  const otra = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo } });
  assert.equal(otra.codigo, 400);
});

test('verificar-2fa: código incorrecto → 401 y a los 5 intentos se bloquea aunque luego acierte', async () => {
  const { r, correos } = escenario(usuarios);
  await llamar(r, 'POST', '/login', { body: { email: 'admin@x.cl', password: 'secreta1' } });
  const bueno = codigoDe(correos[0]);
  const malo = bueno === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    const res = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo: malo } });
    assert.equal(res.codigo, 401);
    assert.equal(res.cuerpo.token, undefined);
  }
  const tarde = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo: bueno } });
  assert.equal(tarde.codigo, 400); assert.equal(tarde.cuerpo.token, undefined);
});

test('verificar-2fa: código vencido → 400', async () => {
  const { r, correos } = escenario(usuarios);
  await llamar(r, 'POST', '/login', { body: { email: 'admin@x.cl', password: 'secreta1' } });
  const codigo = codigoDe(correos[0]);
  const ahora = Date.now;
  Date.now = () => ahora() + 6 * 60 * 1000;
  try {
    const res = await llamar(r, 'POST', '/verificar-2fa', { body: { email: 'admin@x.cl', codigo } });
    assert.equal(res.codigo, 400); assert.match(res.cuerpo.error, /venci/);
  } finally { Date.now = ahora; }
});

test('registro: valida campos, contraseña corta y correo repetido', async () => {
  const { r } = escenario(usuarios);
  assert.equal((await llamar(r, 'POST', '/registro', { body: { email: 'n@x.cl' } })).codigo, 400);
  assert.equal((await llamar(r, 'POST', '/registro', { body: { nombre: 'N', email: 'n@x.cl', password: '123' } })).codigo, 400);
  assert.equal((await llamar(r, 'POST', '/registro', { body: { nombre: 'N', email: 'c@x.cl', password: '123456' } })).codigo, 400);
  assert.equal((await llamar(r, 'POST', '/registro', { body: { nombre: 'N', email: 'nuevo@x.cl', password: '123456' } })).codigo, 200);
});

test('GET /users exige sesión y rol admin', async () => {
  const { r } = escenario(usuarios);
  assert.equal((await llamar(r, 'GET', '/')).codigo, 401);
  const token = jwt.sign({ id: 1, rol: 'cliente' }, SECRET);
  assert.equal((await llamar(r, 'GET', '/', { headers: { authorization: 'Bearer ' + token } })).codigo, 403);
  const adm = jwt.sign({ id: 2, rol: 'admin' }, SECRET);
  assert.equal((await llamar(r, 'GET', '/', { headers: { authorization: 'Bearer ' + adm } })).codigo, 200);
});
