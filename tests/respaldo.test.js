const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./helpers');

// Base falsa: dos tablas, una con 3 filas (incluye comilla y NULL para probar el escape).
const datos = {
  usuarios: [{ id: 1, nombre: "O'Brien", nota: null }, { id: 2, nombre: 'Ana', nota: 'ok' }, { id: 3, nombre: 'Luis', nota: 'x' }],
  vacia: []
};
const db = { promise: () => ({ query: async (sql, p) => {
  if (/SELECT DATABASE/.test(sql)) return [[{ base: 'service_pro' }]];
  if (/SHOW FULL TABLES/.test(sql)) return [[{ Tables_in_x: 'usuarios', Table_type: 'BASE TABLE' }, { Tables_in_x: 'vacia', Table_type: 'BASE TABLE' }]];
  let m = /SHOW CREATE TABLE `(\w+)`/.exec(sql);
  if (m) return [[{ 'Create Table': `CREATE TABLE \`${m[1]}\` (id int)` }]];
  m = /SELECT \* FROM `(\w+)` LIMIT \? OFFSET \?/.exec(sql);
  if (m) return [datos[m[1]].slice(p[1], p[1] + p[0])];
  throw new Error('consulta inesperada: ' + sql);
} }) };
const mysql = { escape: v => v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "\\'") + "'" };

test('respaldo.generarSQL: incluye estructura, filas y escapa valores', async () => {
  const { generarSQL } = cargar('services/respaldo.js', { '../db': db, mysql2: mysql, './correo': { enviarCorreo: async () => {} } });
  const r = await generarSQL();
  assert.equal(r.tablas, 2); assert.equal(r.filas, 3);
  assert.match(r.sql, /DROP TABLE IF EXISTS `usuarios`;/);
  assert.match(r.sql, /CREATE TABLE `vacia`/);
  assert.match(r.sql, /INSERT INTO `usuarios`/);
  assert.match(r.sql, /O\\'Brien/);
  assert.match(r.sql, /NULL/);
  assert.match(r.sql, /FOREIGN_KEY_CHECKS=0/);
});

test('respaldo.ejecutarRespaldo: manda un .sql.gz por correo', async () => {
  const zlib = require('zlib');
  const enviados = [];
  process.env.BACKUP_EMAIL = 'dueno@x.cl';
  const { ejecutarRespaldo } = cargar('services/respaldo.js', { '../db': db, mysql2: mysql, './correo': { enviarCorreo: async m => { enviados.push(m); } } });
  const r = await ejecutarRespaldo();
  assert.equal(r.ok, true); assert.match(r.archivo, /^respaldo-service-pro-\d{4}-\d{2}-\d{2}\.sql\.gz$/);
  assert.equal(enviados.length, 1); assert.equal(enviados[0].to, 'dueno@x.cl');
  const adj = enviados[0].attachments[0];
  assert.equal(adj.filename, r.archivo);
  const sql = zlib.gunzipSync(Buffer.from(adj.content, 'base64')).toString();
  assert.match(sql, /INSERT INTO `usuarios`/);
});
