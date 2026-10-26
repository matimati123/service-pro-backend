// =============================================
// VOLTIA PRO SPA — services/xlsxMin.js
// Escritor mínimo de archivos .xlsx, sin dependencias (solo zlib de Node).
// Soporta: varias hojas, texto, números, fechas, fórmulas con valor en caché,
// anchos de columna, fila de encabezado fija, autofiltro y unos pocos estilos.
// =============================================

const zlib = require('zlib');

// ---------- ZIP ----------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(archivos) {
  const partes = [];
  const central = [];
  let offset = 0;

  for (const { nombre, datos } of archivos) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crudo = Buffer.from(datos, 'utf8');
    const comprimido = zlib.deflateRawSync(crudo);
    const crc = crc32(crudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versión mínima
    local.writeUInt16LE(0x0800, 6);      // nombres en UTF-8
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(0, 10);          // hora
    local.writeUInt16LE(0x21, 12);       // fecha (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nombreBuf, comprimido);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comprimido.length, 20);
    cd.writeUInt32LE(crudo.length, 24);
    cd.writeUInt16LE(nombreBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nombreBuf);

    offset += local.length + nombreBuf.length + comprimido.length;
  }

  const centralBuf = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(centralBuf.length, 12);
  fin.writeUInt32LE(offset, 16);

  return Buffer.concat([...partes, centralBuf, fin]);
}

// ---------- XML ----------
function esc(texto) {
  return String(texto)
    // caracteres de control que XML no admite
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Estilos disponibles (índices de cellXfs en styles.xml)
const ESTILO = { normal: 0, encabezado: 1, fecha: 2, clp: 3, negrita: 4, negritaDerecha: 5, negritaClp: 6 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy\\ hh:mm"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF97316"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function letraColumna(i) {           // 0 -> A, 25 -> Z, 26 -> AA
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Fecha -> número de serie de Excel, conservando la hora "de reloj" del servidor
function serieExcel(d) {
  return (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569;
}

// Celda: valor simple, o { v, f, s } (valor, fórmula, estilo)
function xmlCelda(ref, celda, estiloPorDefecto) {
  let v = celda, f = null, s = estiloPorDefecto || 0;
  if (celda !== null && typeof celda === 'object' && !(celda instanceof Date)) {
    v = celda.v; f = celda.f || null; if (celda.s !== undefined) s = celda.s;
  }
  if (v === null || v === undefined || (v === '' && !f)) return '';

  const atr = s ? ` s="${s}"` : '';
  const formula = f ? `<f>${esc(f)}</f>` : '';

  if (v instanceof Date) {
    if (isNaN(v)) return '';
    return `<c r="${ref}"${atr || ` s="${ESTILO.fecha}"`}><v>${serieExcel(v)}</v></c>`;
  }
  if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${atr}>${formula}<v>${v}</v></c>`;
  return `<c r="${ref}"${atr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/**
 * @param {Array} hojas [{ nombre, anchos:[n,...], filas:[[celda,...],...],
 *                         fijarEncabezado:bool, autofiltro:bool, estilosColumna:[estilo|undefined,...] }]
 * @returns {Buffer} contenido del .xlsx
 */
function construirXlsx(hojas) {
  const archivos = [];

  archivos.push({ nombre: '[Content_Types].xml', datos:
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` });

  archivos.push({ nombre: '_rels/.rels', datos:
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });

  archivos.push({ nombre: 'xl/workbook.xml', datos:
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` });

  archivos.push({ nombre: 'xl/_rels/workbook.xml.rels', datos:
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` });

  archivos.push({ nombre: 'xl/styles.xml', datos: STYLES_XML });

  hojas.forEach((h, i) => {
    const filas = h.filas || [];
    const maxCols = filas.reduce((m, f) => Math.max(m, f.length), (h.anchos || []).length);

    const cols = (h.anchos || []).length
      ? `<cols>${h.anchos.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';

    const vista = h.fijarEncabezado
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

    const datos = filas.map((fila, r) => {
      const celdas = fila.map((c, k) => xmlCelda(`${letraColumna(k)}${r + 1}`, c, r === 0 && h.fijarEncabezado ? ESTILO.encabezado : (h.estilosColumna || [])[k])).join('');
      const alto = r === 0 && h.fijarEncabezado ? ' ht="24" customHeight="1"' : '';
      return `<row r="${r + 1}"${alto}>${celdas}</row>`;
    }).join('');

    const filtro = h.autofiltro && h.autofiltroHasta
      ? `<autoFilter ref="A1:${letraColumna(maxCols - 1)}${h.autofiltroHasta}"/>`
      : '';

    archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vista}${cols}<sheetData>${datos}</sheetData>${filtro}</worksheet>` });
  });

  return zip(archivos);
}

module.exports = { construirXlsx, ESTILO };
