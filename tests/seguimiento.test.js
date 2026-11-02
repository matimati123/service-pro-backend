const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./helpers');

// Base falsa que responde según el SQL y guarda lo que se ejecuta.
function montar({ ordenes = [], columnasExistentes = ['encuesta_enviada', 'seguimiento_avisado'], semana } = {}) {
  const sqls = [];
  const correos = [];
  const db = { promise: () => ({ query: async (sql, p) => {
    sqls.push({ sql, p });
    if (/information_schema/.test(sql)) return [columnasExistentes.map(c => ({ COLUMN_NAME: c }))];
    if (/FROM calificaciones WHERE/.test(sql)) return [[{ total: 2, promedio: '4.5' }]];
    if (/COUNT\(\*\) AS total FROM ordenes\s+WHERE estado = 'pendiente'/.test(sql)) return [[{ total: 4 }]];
    if (/COUNT\(\*\) AS total,/.test(sql)) return [[semana || { total: 5, completadas: 2, rechazadas: 1, en_proceso: 2, ingresos: 250000 }]];
    if (/fecha_visita >= CURDATE/.test(sql)) return [[{ id: 9, cliente: 'Ana', fecha_visita: '2026-11-04', hora_visita: '10:00', tecnico_nombre: 'Luis' }]];
    if (/^\s*SELECT/.test(sql)) return [ordenes];
    return [[]];
  } }) };
  const correo = { enviarCorreo: async m => { correos.push(m); } };
  const mod = cargar('services/seguimiento.js', { '../db': db, './correo': correo });
  return { mod, sqls, correos };
}

test('encuestas: manda un correo por orden completada sin calificar y la marca', async () => {
  const { mod, sqls, correos } = montar({ ordenes: [
    { id: 1, cliente: 'Ana', cliente_email: 'ana@x.cl', cliente_nombre: 'Ana' },
    { id: 2, cliente: 'Sin correo', cliente_email: null }
  ] });
  const r = await mod.enviarEncuestas();
  assert.deepEqual(r, { ordenes: 2, correos: 1, errores: 0, sin_correo: 1 });
  assert.equal(correos[0].to, 'ana@x.cl');
  assert.match(correos[0].html, /mis-ordenes\.html/);
  assert.ok(sqls.some(s => /UPDATE ordenes SET encuesta_enviada = NOW\(\) WHERE id = \?/.test(s.sql) && s.p[0] === 1));
});

test('encuestas: si el correo falla NO marca la orden (se reintenta después)', async () => {
  const sqls = [];
  const db = { promise: () => ({ query: async (sql, p) => {
    sqls.push(sql);
    if (/information_schema/.test(sql)) return [[{ COLUMN_NAME: 'encuesta_enviada' }, { COLUMN_NAME: 'seguimiento_avisado' }]];
    return [[{ id: 1, cliente: 'Ana', cliente_email: 'ana@x.cl' }]];
  } }) };
  const mod = cargar('services/seguimiento.js', { '../db': db, './correo': { enviarCorreo: async () => { throw new Error('caído'); } } });
  const r = await mod.enviarEncuestas();
  assert.equal(r.errores, 1); assert.equal(r.correos, 0);
  assert.ok(!sqls.some(s => /UPDATE ordenes SET encuesta_enviada/.test(s)));
});

test('columnas: al crear encuesta_enviada marca como ya enviadas las órdenes completadas antiguas', async () => {
  const { mod, sqls } = montar({ columnasExistentes: [] });
  await mod.enviarEncuestas();
  const texto = sqls.map(s => s.sql).join('\n');
  assert.match(texto, /ADD COLUMN encuesta_enviada/);
  assert.match(texto, /UPDATE ordenes SET encuesta_enviada = NOW\(\) WHERE estado = 'completado'/);
  assert.match(texto, /ADD COLUMN seguimiento_avisado/);
});

test('estancadas: un solo correo al admin con todas las órdenes y las marca', async () => {
  process.env.BACKUP_EMAIL = 'dueno@x.cl';
  const { mod, sqls, correos } = montar({ ordenes: [
    { id: 4, cliente: 'A', direccion: 'Calle 1', dias: 5 }, { id: 7, cliente: 'B <b>', direccion: 'Calle 2', dias: 9 }
  ] });
  const r = await mod.avisarEstancadas();
  assert.deepEqual(r, { ordenes: 2, correos: 1, errores: 0 });
  assert.equal(correos.length, 1); assert.equal(correos[0].to, 'dueno@x.cl');
  assert.match(correos[0].html, /#4/); assert.match(correos[0].html, /#7/);
  assert.ok(!correos[0].html.includes('B <b>'));      // se escapa el HTML
  const upd = sqls.find(s => /UPDATE ordenes SET seguimiento_avisado/.test(s.sql));
  assert.deepEqual(upd.p, [4, 7]);
});

test('estancadas: sin órdenes no manda nada', async () => {
  const { mod, correos } = montar({ ordenes: [] });
  const r = await mod.avisarEstancadas();
  assert.equal(r.ordenes, 0); assert.equal(correos.length, 0);
});

test('reporte semanal: manda resumen con cifras y visitas', async () => {
  process.env.BACKUP_EMAIL = 'dueno@x.cl';
  const { mod, correos } = montar();
  const r = await mod.reporteSemanal();
  assert.equal(r.ok, true); assert.equal(r.ordenes_nuevas, 5); assert.equal(r.visitas_proximas, 1);
  assert.equal(correos[0].to, 'dueno@x.cl');
  assert.match(correos[0].subject, /5 orden/);
  assert.match(correos[0].html, /250\.000/);
  assert.match(correos[0].html, /4\.5/);
  assert.match(correos[0].html, /04-11-2026/);
});

test('reporte semanal: sin destinatario falla con mensaje claro', async () => {
  delete process.env.BACKUP_EMAIL; delete process.env.GMAIL_USER;
  const { mod } = montar();
  await assert.rejects(mod.reporteSemanal(), /destinatario/);
});
