const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, expressFalso, llamar } = require('./helpers');

const TOKEN = 'token-de-prueba-muy-largo-1234567890';

function rutas(archivo, servicio, nombreFn) {
  const { ex, r } = expressFalso();
  let llamadas = 0;
  const falso = async () => { llamadas++; return { ok: true }; };
  const stubs = {
    express: ex,
    '../services/recordatorios': { enviarRecordatorios: async () => ({}) },
    '../services/seguimiento': { enviarEncuestas: async () => ({}), avisarEstancadas: async () => ({}), reporteSemanal: async () => ({}) },
    '../services/respaldo': { ejecutarRespaldo: async () => ({}) }
  };
  stubs[servicio] = { ...stubs[servicio], [nombreFn]: falso };
  cargar(archivo, stubs);
  return { r, llamadas: () => llamadas };
}
const casos = [
  ['routes/tareas.js', '../services/recordatorios', 'enviarRecordatorios', '/recordatorios'],
  ['routes/tareas.js', '../services/seguimiento', 'enviarEncuestas', '/encuestas'],
  ['routes/tareas.js', '../services/seguimiento', 'avisarEstancadas', '/seguimiento'],
  ['routes/tareas.js', '../services/seguimiento', 'reporteSemanal', '/reporte-semanal'],
  ['routes/respaldo.js', '../services/respaldo', 'ejecutarRespaldo', '/ejecutar']
];

for (const [archivo, servicio, fn, ruta] of casos) {
  test(`${archivo} ${ruta}: sin BACKUP_TOKEN configurado (o corto) → 503 y no ejecuta`, async () => {
    const { r, llamadas } = rutas(archivo, servicio, fn);
    for (const t of [undefined, 'corto']) {
      if (t === undefined) delete process.env.BACKUP_TOKEN; else process.env.BACKUP_TOKEN = t;
      const res = await llamar(r, 'POST', ruta, { headers: { 'x-backup-token': 'corto' } });
      assert.equal(res.codigo, 503);
    }
    assert.equal(llamadas(), 0);
  });

  test(`${archivo} ${ruta}: token incorrecto o ausente → 401 y no ejecuta`, async () => {
    process.env.BACKUP_TOKEN = TOKEN;
    const { r, llamadas } = rutas(archivo, servicio, fn);
    assert.equal((await llamar(r, 'POST', ruta)).codigo, 401);
    assert.equal((await llamar(r, 'POST', ruta, { headers: { 'x-backup-token': 'x'.repeat(TOKEN.length) } })).codigo, 401);
    assert.equal(llamadas(), 0);
  });

  test(`${archivo} ${ruta}: token correcto → ejecuta`, async () => {
    process.env.BACKUP_TOKEN = TOKEN;
    const { r, llamadas } = rutas(archivo, servicio, fn);
    const res = await llamar(r, 'POST', ruta, { headers: { 'x-backup-token': TOKEN } });
    assert.equal(res.codigo, 200); assert.equal(res.cuerpo.ok, true);
    assert.equal(llamadas(), 1);
  });
}
