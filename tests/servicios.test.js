const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./helpers');
const dbFalsa = { promise: () => ({ query: async () => [[]] }) };

const agenda = require('../services/agenda');
const etapas = require('../services/etapas');
const recordatorios = cargar('services/recordatorios.js', { '../db': dbFalsa, './correo': {} });
const auditoria = cargar('services/auditoria.js', { '../db': dbFalsa });

test('agenda.validarVisita: fechas inválidas', () => {
  for (const f of ['', 'mañana', '2030-02-31', '2030-13-01', null]) {
    assert.match(agenda.validarVisita(f, '10:00'), /fecha/i);
  }
});

test('agenda.validarVisita: fines de semana y horas fuera de horario', () => {
  assert.match(agenda.validarVisita('2030-06-08', '10:00'), /lunes a viernes/); // sábado
  assert.match(agenda.validarVisita('2030-06-09', '10:00'), /lunes a viernes/); // domingo
  assert.match(agenda.validarVisita('2030-06-10', '08:00'), /09:00/);
  assert.match(agenda.validarVisita('2030-06-10', '10:30'), /en punto/);
  assert.match(agenda.validarVisita('2030-06-10', '18:00'), /17:00/);
});

test('agenda.validarVisita: día hábil válido, pasado rechazado salvo permitirPasado', () => {
  assert.equal(agenda.validarVisita('2030-06-10', '09:00'), null);   // lunes
  assert.equal(agenda.validarVisita('2030-06-14', '17:00'), null);   // viernes
  assert.match(agenda.validarVisita('2020-06-10', '10:00'), /pasado/);
  assert.equal(agenda.validarVisita('2020-06-10', '10:00', { permitirPasado: true }), null);
});

test('agenda.fechaCorta', () => assert.equal(agenda.fechaCorta('2026-10-28'), '28-10-2026'));

test('agenda.buscarChoque: sin email no consulta; con choque devuelve la orden', async () => {
  assert.equal(await agenda.buscarChoque({}, '', '2030-06-10', '10:00'), null);
  let params;
  const db = { promise: () => ({ query: async (sql, p) => { params = p; return [[{ id: 5, cliente: 'Ana' }]]; } }) };
  const r = await agenda.buscarChoque(db, 'tec@x.cl', '2030-06-10', '10:00', 9);
  assert.deepEqual(r, { id: 5, cliente: 'Ana' });
  assert.equal(params[0], 'tec@x.cl'); assert.equal(params.at(-1), 9);
});

test('etapas: hay 11 etapas y SEC no aplica si solo hay cámaras', () => {
  assert.equal(etapas.ETAPAS.length, 11);
  const solo = etapas.armarEtapas([], ['camara']);
  assert.equal(solo.find(e => e.clave === 'tramites_sec').estado, 'no_aplica');
  assert.equal(solo.find(e => e.clave === 'visita_tecnica').estado, 'pendiente');
  const mixto = etapas.armarEtapas([], ['camara', 'enchufe']);
  assert.equal(mixto.find(e => e.clave === 'tramites_sec').estado, 'pendiente');
});

test('etapas.calcularProgreso: ignora no_aplica y opcionales pendientes', () => {
  const lista = etapas.armarEtapas([{ etapa: 'visita_tecnica', estado: 'completada' }], ['camara']);
  const p = etapas.calcularProgreso(lista);
  // 11 - 4 SEC no aplica - 1 opcional pendiente = 6
  assert.equal(p.total, 6); assert.equal(p.hechas, 1); assert.equal(p.porcentaje, 17);
  assert.equal(p.etapa_clave, 'solicitud_materiales');
});

test('etapas.calcularProgreso: todo completado', () => {
  const filas = etapas.ETAPAS.map(e => ({ etapa: e.clave, estado: 'completada' }));
  const p = etapas.calcularProgreso(etapas.armarEtapas(filas, ['enchufe']));
  assert.equal(p.porcentaje, 100); assert.equal(p.etapa_clave, 'completo');
});

test('etapas.validarEtapa', () => {
  assert.ok(etapas.validarEtapa({ estado: 'xx' }).error);
  assert.ok(etapas.validarEtapa({ estado: 'completada', fecha: '2030-02-31' }).error);
  assert.ok(etapas.validarEtapa({ estado: 'completada', monto: -5 }).error);
  assert.ok(etapas.validarEtapa({ estado: 'completada', monto: 10.5 }).error);
  assert.ok(etapas.validarEtapa({ estado: 'completada', notas: 'a'.repeat(1001) }).error);
  const ok = etapas.validarEtapa({ estado: 'en_curso', fecha: '2030-01-05', monto: '1500', responsable: '  Juan ' });
  assert.equal(ok.datos.monto, 1500); assert.equal(ok.datos.responsable, 'Juan'); assert.equal(ok.datos.notas, null);
});

test('recordatorios.mananaChile respeta la zona horaria de Chile', () => {
  // Octubre 2026: Chile en horario de verano (UTC-3)
  assert.equal(recordatorios.mananaChile(new Date('2026-10-31T01:30:00Z')), '2026-10-31'); // aún 30-oct en Chile
  assert.equal(recordatorios.mananaChile(new Date('2026-10-31T12:00:00Z')), '2026-11-01');
  assert.equal(recordatorios.mananaChile(new Date('2026-12-31T20:00:00Z')), '2027-01-01');
});

test('auditoria.reglaDe: reconoce rutas y entidades', () => {
  assert.deepEqual(auditoria.reglaDe('DELETE', '/ordenes/24'), { entidad: 'ordenes', id: '24', accion: 'Eliminó la orden' });
  const e = auditoria.reglaDe('PUT', '/etapas/12/tramites_sec');
  assert.equal(e.id, '12'); assert.match(e.accion, /«tramites_sec»/);
  assert.equal(auditoria.reglaDe('POST', '/ordenes').id, null);
  assert.equal(auditoria.reglaDe('GET', '/ordenes/24'), null);
  assert.equal(auditoria.reglaDe('POST', '/users/login'), null);
});

test('auditoria.limpiar: oculta datos sensibles y recorta textos', () => {
  const r = auditoria.limpiar({ nombre: 'Ana', password: '123456', clave_nueva: 'x', token: 't', codigo: '999999', largo: 'a'.repeat(300) });
  assert.equal(r.nombre, 'Ana');
  for (const k of ['password', 'clave_nueva', 'token', 'codigo']) assert.equal(r[k], '[oculto]');
  assert.ok(r.largo.length <= 120);
});

test('auditoria.middleware: registra solo mutaciones exitosas de rutas conocidas', async () => {
  const consultas = [];
  const db = { promise: () => ({ query: async (sql, p) => { consultas.push({ sql, p }); return [[]]; } }) };
  const aud = cargar('services/auditoria.js', { '../db': db });
  const ejecutar = async (metodo, url, codigo, body = {}) => {
    const oyentes = {};
    const res = { statusCode: codigo, json(c) { return c; }, on(ev, fn) { oyentes[ev] = fn; } };
    aud.middleware({ method: metodo, originalUrl: url, body, user: { id: 1, email: 'a@x.cl', rol: 'admin' }, ip: '::1' }, res, () => {});
    res.json({}); oyentes.finish && oyentes.finish();
    await new Promise(r => setTimeout(r, 20));
  };
  await ejecutar('GET', '/ordenes', 200);
  await ejecutar('PUT', '/ordenes/3/estado', 500);
  await ejecutar('POST', '/users/login', 200);
  const inserciones = () => consultas.filter(c => /INSERT INTO auditoria/.test(c.sql));
  assert.equal(inserciones().length, 0);
  await ejecutar('PUT', '/ordenes/3/estado?x=1', 200, { estado: 'completado', password: 'secreta' });
  assert.equal(inserciones().length, 1);
  const p = inserciones()[0].p;
  assert.equal(p[1], 'a@x.cl'); assert.equal(p[5], '3');
  assert.ok(!String(p[6]).includes('secreta'));
});
