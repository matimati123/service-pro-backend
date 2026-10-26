// =============================================
// VOLTIA PRO SPA — services/excelOrdenes.js
// Arma el Excel del reporte de órdenes.
// No toca la base de datos: recibe las filas ya consultadas.
// =============================================

const { construirXlsx, ESTILO } = require('./xlsxMin');

const ESTADOS = {
  pendiente: 'Pendiente',
  evaluada: 'Evaluada',
  rechazada: 'Rechazada',
  cotizada: 'Cotizada',
  aprobada: 'Aprobada',
  completado: 'Completada'
};

function claveMes(fecha) {
  const d = fecha ? new Date(fecha) : null;
  if (!d || isNaN(d)) return 'Sin fecha';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const num = (v) => Number(v) || 0;

/**
 * @param {Array} ordenes filas con: id, created_at, cliente, direccion, servicios,
 *   estado, tecnico_nombre, fecha_visita, hora_visita, monto, estrellas
 * @param {Object} filtros { desde, hasta, estado, tecnico } (se muestran en una hoja)
 * @returns {Buffer} archivo .xlsx
 */
function construirExcelOrdenes(ordenes, filtros = {}) {
  // ---------- Hoja 1: Órdenes ----------
  const filasOrdenes = [[
    'N° orden', 'Fecha solicitud', 'Cliente', 'Dirección', 'Servicios',
    'Estado', 'Técnico', 'Visita', 'Monto (CLP)', 'Calificación'
  ]];

  for (const o of ordenes) {
    let visita = '';
    if (o.fecha_visita) {
      const d = new Date(o.fecha_visita);
      if (!isNaN(d)) visita = d.toLocaleDateString('es-CL') + (o.hora_visita ? ' ' + o.hora_visita : '');
    }
    filasOrdenes.push([
      o.id,
      o.created_at ? new Date(o.created_at) : null,
      o.cliente || '',
      o.direccion || '',
      o.servicios || '',
      ESTADOS[o.estado] || o.estado || '',
      o.tecnico_nombre || '',
      visita,
      o.monto === null || o.monto === undefined ? null : num(o.monto),
      o.estrellas ? num(o.estrellas) : null
    ]);
  }

  const ultima = filasOrdenes.length;     // número de la última fila con datos
  if (ordenes.length) {
    const ingresos = ordenes.filter(o => o.estado === 'completado').reduce((s, o) => s + num(o.monto), 0);
    filasOrdenes.push([
      null, null, null, null, null, null, null,
      { v: 'Ingresos (completadas):', s: ESTILO.negritaDerecha },
      { v: ingresos, f: `SUMIF(F2:F${ultima},"Completada",I2:I${ultima})`, s: ESTILO.negritaClp }
    ]);
  }

  // ---------- Hoja 2: Resumen por mes ----------
  const meses = new Map();
  for (const o of ordenes) {
    const k = claveMes(o.created_at);
    if (!meses.has(k)) meses.set(k, { total: 0, completadas: 0, rechazadas: 0, ingresos: 0 });
    const m = meses.get(k);
    m.total++;
    if (o.estado === 'completado') { m.completadas++; m.ingresos += num(o.monto); }
    if (o.estado === 'rechazada') m.rechazadas++;
  }
  const filasMes = [['Mes', 'Órdenes', 'Completadas', 'Rechazadas', 'Ingresos (CLP)']];
  [...meses.keys()].sort().reverse().forEach(k => {
    const m = meses.get(k);
    filasMes.push([k, m.total, m.completadas, m.rechazadas, m.ingresos]);
  });

  // ---------- Hoja 3: Por técnico ----------
  const tecnicos = new Map();
  for (const o of ordenes) {
    const k = o.tecnico_nombre || 'Sin técnico asignado';
    if (!tecnicos.has(k)) tecnicos.set(k, { total: 0, completadas: 0, ingresos: 0 });
    const t = tecnicos.get(k);
    t.total++;
    if (o.estado === 'completado') { t.completadas++; t.ingresos += num(o.monto); }
  }
  const filasTec = [['Técnico', 'Órdenes', 'Completadas', 'Ingresos (CLP)']];
  [...tecnicos.entries()]
    .sort((a, b) => b[1].ingresos - a[1].ingresos)
    .forEach(([nombre, t]) => filasTec.push([nombre, t.total, t.completadas, t.ingresos]));

  // ---------- Hoja 4: Filtros usados ----------
  const filasFiltros = [
    [{ v: 'Generado', s: ESTILO.negrita }, new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })],
    [{ v: 'Desde', s: ESTILO.negrita }, filtros.desde || 'Sin límite'],
    [{ v: 'Hasta', s: ESTILO.negrita }, filtros.hasta || 'Sin límite'],
    [{ v: 'Estado', s: ESTILO.negrita }, filtros.estado ? (ESTADOS[filtros.estado] || filtros.estado) : 'Todos'],
    [{ v: 'Técnico', s: ESTILO.negrita }, filtros.tecnico || 'Todos'],
    [{ v: 'Órdenes incluidas', s: ESTILO.negrita }, ordenes.length]
  ];

  return construirXlsx([
    {
      nombre: 'Órdenes',
      anchos: [10, 18, 24, 32, 30, 14, 22, 18, 15, 13],
      filas: filasOrdenes,
      fijarEncabezado: true,
      autofiltro: ordenes.length > 0,
      autofiltroHasta: ultima,
      // fecha en B, monto en I
      estilosColumna: [undefined, ESTILO.fecha, undefined, undefined, undefined, undefined, undefined, undefined, ESTILO.clp]
    },
    {
      nombre: 'Resumen por mes',
      anchos: [14, 11, 14, 13, 17],
      filas: filasMes,
      fijarEncabezado: true,
      estilosColumna: [undefined, undefined, undefined, undefined, ESTILO.clp]
    },
    {
      nombre: 'Por técnico',
      anchos: [28, 11, 14, 17],
      filas: filasTec,
      fijarEncabezado: true,
      estilosColumna: [undefined, undefined, undefined, ESTILO.clp]
    },
    { nombre: 'Filtros del reporte', anchos: [22, 30], filas: filasFiltros }
  ]);
}

module.exports = { construirExcelOrdenes, ESTADOS };
