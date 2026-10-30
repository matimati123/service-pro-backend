// =============================================
// VOLTIA PRO SPA — services/respaldo.js
// Copia de seguridad de la base de datos (estructura + datos) en un .sql comprimido,
// enviada por correo (Gmail API) al administrador.
// =============================================
const zlib = require('zlib');
const mysql = require('mysql2');
const db = require('../db');
const { enviarCorreo } = require('./correo');

const LOTE = 500;                       // filas por lectura
const MAX_ADJUNTO = 18 * 1024 * 1024;   // Gmail admite ~25 MB; el base64 pesa ~33% más

const q = (sql, params) => db.promise().query(sql, params).then(([filas]) => filas);
const id = nombre => '`' + String(nombre).replace(/`/g, '``') + '`';

// Devuelve { sql, tablas, filas } con todo el contenido de la base.
async function generarSQL() {
  const [{ base }] = await q('SELECT DATABASE() AS base');
  const tablas = (await q("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"))
    .map(f => Object.values(f)[0]);

  const partes = [
    `-- Respaldo de ${base}`,
    `-- Generado: ${new Date().toISOString()}`,
    'SET FOREIGN_KEY_CHECKS=0;',
    'SET NAMES utf8mb4;',
    ''
  ];
  let totalFilas = 0;

  for (const tabla of tablas) {
    const [crear] = await q(`SHOW CREATE TABLE ${id(tabla)}`);
    partes.push(`DROP TABLE IF EXISTS ${id(tabla)};`, crear['Create Table'] + ';', '');

    let desde = 0;
    for (;;) {
      const filas = await q(`SELECT * FROM ${id(tabla)} LIMIT ? OFFSET ?`, [LOTE, desde]);
      if (!filas.length) break;
      const columnas = Object.keys(filas[0]).map(id).join(', ');
      const valores = filas.map(f => '(' + Object.values(f).map(v => mysql.escape(v)).join(', ') + ')');
      partes.push(`INSERT INTO ${id(tabla)} (${columnas}) VALUES\n${valores.join(',\n')};`, '');
      totalFilas += filas.length;
      desde += filas.length;
      if (filas.length < LOTE) break;
    }
  }
  partes.push('SET FOREIGN_KEY_CHECKS=1;', '');
  return { sql: partes.join('\n'), tablas: tablas.length, filas: totalFilas };
}

async function ejecutarRespaldo() {
  const { sql, tablas, filas } = await generarSQL();
  const gz = zlib.gzipSync(Buffer.from(sql, 'utf8'));
  if (gz.length > MAX_ADJUNTO) {
    throw new Error(`El respaldo pesa ${(gz.length / 1048576).toFixed(1)} MB y no cabe en un correo`);
  }

  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10);
  const nombre = `respaldo-service-pro-${fecha}.sql.gz`;
  const destino = process.env.BACKUP_EMAIL || process.env.GMAIL_USER;
  if (!destino) throw new Error('No hay destinatario: define BACKUP_EMAIL o GMAIL_USER');

  await enviarCorreo({
    to: destino,
    subject: `Respaldo de la base de datos — ${fecha}`,
    html: `<div style="font-family:Arial,sans-serif">
      <h3>⚡ Voltia Pro SPA — respaldo automático</h3>
      <p>Tablas: <b>${tablas}</b> · Filas: <b>${filas}</b> · Tamaño: <b>${(gz.length / 1024).toFixed(1)} KB</b></p>
      <p>Guarda el adjunto en un lugar seguro. Contiene datos de clientes y no debe compartirse.</p>
      <p style="color:#777;font-size:13px">Para restaurar: descomprime el .gz y ejecuta el .sql en MySQL Workbench.</p>
    </div>`,
    attachments: [{ filename: nombre, content: gz.toString('base64') }]
  });

  return { ok: true, tablas, filas, bytes: gz.length, archivo: nombre };
}

module.exports = { generarSQL, ejecutarRespaldo };
