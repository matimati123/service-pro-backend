// =============================================
// VOLTIA PRO SPA — services/etapas.js
// Ciclo de vida de un proyecto: etapas, cuáles aplican según el tipo de servicio
// (camara / enchufe / alumbrado) y cálculo del avance.
// =============================================

const ESTADOS_ETAPA = ['pendiente', 'en_curso', 'completada', 'no_aplica'];

// Orden = orden del ciclo de vida.
//  sec:      trámite ante la SEC (por defecto no aplica a proyectos solo de cámaras)
//  opcional: no cuenta para el avance mientras siga "pendiente" (ej. instalación con pendientes)
const ETAPAS = [
  { clave: 'visita_tecnica',        nombre: 'Visita técnica',            icono: '🔎', descripcion: 'Evaluación en terreno y levantamiento de lo que hay que hacer.', refEtiqueta: 'N° de informe de visita' },
  { clave: 'solicitud_materiales',  nombre: 'Solicitud de materiales',   icono: '🧰', descripcion: 'Pedido y recepción de los materiales del proyecto.',            refEtiqueta: 'N° de pedido / orden de compra', usaMonto: true },
  { clave: 'instalacion',           nombre: 'Instalación',               icono: '🔧', descripcion: 'Ejecución de la instalación o reparación.',                      refEtiqueta: 'Referencia' },
  { clave: 'instalacion_pendientes',nombre: 'Instalación con pendientes',icono: '⚠️', descripcion: 'Trabajos que quedaron por terminar o corregir (opcional).',     refEtiqueta: 'Referencia', opcional: true },
  { clave: 'tramites_sec',          nombre: 'Trámites SEC',              icono: '📑', descripcion: 'Declaración e ingreso del proyecto en la SEC.',                  refEtiqueta: 'N° de trámite SEC', sec: true },
  { clave: 'pagos_sec',             nombre: 'Pagos SEC',                 icono: '💳', descripcion: 'Pago de los derechos y tarifas de la SEC.',                      refEtiqueta: 'N° de comprobante de pago', sec: true, usaMonto: true },
  { clave: 'informes_tecnicos',     nombre: 'Informes técnicos',         icono: '📋', descripcion: 'Informes y planos técnicos (ej. TE1) del proyecto.',             refEtiqueta: 'N° de informe técnico', sec: true },
  { clave: 'aprobacion_sec',        nombre: 'Aprobación SEC',            icono: '✅', descripcion: 'Aprobación o sello entregado por la SEC.',                        refEtiqueta: 'N° de aprobación / sello', sec: true },
  { clave: 'acta_entrega',          nombre: 'Acta de entrega',           icono: '📝', descripcion: 'Entrega del trabajo al cliente y firma del acta.',               refEtiqueta: 'N° de acta' },
  { clave: 'cierre_negocio',        nombre: 'Cierre de negocio',         icono: '🤝', descripcion: 'Cobro final, factura y cierre comercial.',                        refEtiqueta: 'N° de factura', usaMonto: true },
  { clave: 'finalizacion',          nombre: 'Finalización',              icono: '🏁', descripcion: 'Proyecto terminado. Al completarla, la orden pasa a “Completada”.', refEtiqueta: 'Referencia' }
];

const POR_CLAVE = Object.fromEntries(ETAPAS.map(e => [e.clave, e]));

// Estado inicial de una etapa que aún no se ha guardado.
// Las etapas SEC no aplican si el proyecto es solo de cámaras (u otros servicios sin trámite SEC).
function estadoInicial(etapa, servicios) {
  const lista = (servicios || []).filter(Boolean);
  if (etapa.sec && lista.length && lista.every(s => s === 'camara')) return 'no_aplica';
  return 'pendiente';
}

// filas: filas guardadas de etapas_orden de UNA orden. Devuelve todas las etapas, en orden.
function armarEtapas(filas, servicios) {
  const guardadas = new Map((filas || []).map(f => [f.etapa, f]));
  return ETAPAS.map(def => {
    const f = guardadas.get(def.clave);
    return {
      clave: def.clave,
      nombre: def.nombre,
      icono: def.icono,
      descripcion: def.descripcion,
      refEtiqueta: def.refEtiqueta,
      opcional: !!def.opcional,
      usaMonto: !!def.usaMonto,
      guardada: !!f,
      estado: f ? f.estado : estadoInicial(def, servicios),
      fecha: f && f.fecha ? f.fecha : null,
      responsable: f ? f.responsable : null,
      referencia: f ? f.referencia : null,
      monto: f && f.monto !== null && f.monto !== undefined ? Number(f.monto) : null,
      notas: f ? f.notas : null,
      actualizado_por: f ? f.actualizado_por : null,
      actualizado_en: f ? f.actualizado_en : null
    };
  });
}

// Avance: no cuentan las etapas "no aplica" ni las opcionales que siguen pendientes.
function calcularProgreso(etapas) {
  const cuentan = etapas.filter(e => e.estado !== 'no_aplica' && !(e.opcional && e.estado === 'pendiente'));
  const hechas = cuentan.filter(e => e.estado === 'completada').length;
  const actual = etapas.find(e => e.estado === 'en_curso')
    || etapas.find(e => e.estado === 'pendiente' && !e.opcional);
  return {
    total: cuentan.length,
    hechas,
    porcentaje: cuentan.length ? Math.round((hechas / cuentan.length) * 100) : 0,
    etapa_actual: actual ? actual.nombre : (cuentan.length ? 'Todo completado' : '—')
  };
}

// Valida el cuerpo del PUT. Devuelve { datos } o { error }.
function validarEtapa(body) {
  const b = body || {};
  if (!ESTADOS_ETAPA.includes(b.estado)) return { error: 'Estado de etapa no válido.' };

  let fecha = null;
  if (b.fecha) {
    const f = String(b.fecha);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T00:00:00Z') : null;
    if (!d || isNaN(d) || d.toISOString().slice(0, 10) !== f) return { error: 'La fecha no es válida.' };
    fecha = f;
  }

  const texto = (v, max, nombre) => {
    const t = String(v === undefined || v === null ? '' : v).trim();
    if (t.length > max) return { error: `${nombre} es demasiado largo (máximo ${max} caracteres).` };
    return { valor: t || null };
  };
  const resp = texto(b.responsable, 100, 'El responsable');
  if (resp.error) return resp;
  const ref = texto(b.referencia, 100, 'La referencia');
  if (ref.error) return ref;
  const notas = texto(b.notas, 1000, 'La nota');
  if (notas.error) return notas;

  let monto = null;
  if (b.monto !== undefined && b.monto !== null && String(b.monto).trim() !== '') {
    const n = Number(b.monto);
    if (!Number.isInteger(n) || n < 0 || n > 2000000000) return { error: 'El monto debe ser un número entero en pesos (0 o más).' };
    monto = n;
  }

  return { datos: { estado: b.estado, fecha, responsable: resp.valor, referencia: ref.valor, monto, notas: notas.valor } };
}

module.exports = { ETAPAS, POR_CLAVE, ESTADOS_ETAPA, armarEtapas, calcularProgreso, validarEtapa };
