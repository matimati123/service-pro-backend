// =============================================
// VOLTIA PRO SPA — services/auditoria.js
// Registro de auditoría: quién hizo qué y cuándo.
//  - middleware(): anota automáticamente las acciones que modifican datos (rutas conocidas).
//  - registrar():  anota un evento puntual (por ejemplo, un inicio de sesión de admin).
// Nunca rompe la petición: si falla el registro, solo lo deja en el log del servidor.
// =============================================
const db = require('../db');

const q = (sql, params) => db.promise().query(sql, params).then(([filas]) => filas);

// [método, patrón de la ruta, entidad, etiqueta]. Las capturas del patrón se usan en la etiqueta ($1, $2).
// La primera captura es el id de la entidad.
const RUTAS = [
  ['POST',   /^\/ordenes$/,                       'ordenes',    'Creó una orden'],
  ['PUT',    /^\/ordenes\/(\d+)\/estado$/,        'ordenes',    'Cambió el estado de la orden'],
  ['PUT',    /^\/ordenes\/(\d+)\/monto$/,         'ordenes',    'Cambió el monto de la orden'],
  ['PUT',    /^\/ordenes\/(\d+)\/asignar$/,       'ordenes',    'Asignó técnico a la orden'],
  ['POST',   /^\/ordenes\/(\d+)\/calificacion$/,  'ordenes',    'Calificó la orden'],
  ['DELETE', /^\/ordenes\/(\d+)$/,                'ordenes',    'Eliminó la orden'],
  ['PUT',    /^\/etapas\/(\d+)\/([a-z_]+)$/,      'ordenes',    'Actualizó la etapa «$2» del proyecto'],
  ['POST',   /^\/materiales\/orden\/(\d+)$/,      'ordenes',    'Agregó un material a la orden'],
  ['PUT',    /^\/materiales\/(\d+)$/,             'materiales', 'Editó un material'],
  ['DELETE', /^\/materiales\/(\d+)$/,             'materiales', 'Eliminó un material'],
  ['PUT',    /^\/agenda\/(\d+)$/,                 'ordenes',    'Reprogramó la visita de la orden'],
  ['POST',   /^\/tecnicos$/,                      'tecnicos',   'Creó un técnico'],
  ['PUT',    /^\/tecnicos\/(\d+)$/,               'tecnicos',   'Editó un técnico'],
  ['PUT',    /^\/tecnicos\/(\d+)\/activo$/,       'tecnicos',   'Activó o desactivó un técnico']
];

const SENSIBLE = /pass|clave|contrase|token|secret|codigo|code|authorization/i;

// Copia del cuerpo sin datos sensibles y con textos largos recortados
function limpiar(valor, nivel = 0) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return valor.length > 120 ? valor.slice(0, 117) + '...' : valor;
  if (typeof valor !== 'object' || nivel > 2) return typeof valor === 'object' ? '[…]' : valor;
  if (Array.isArray(valor)) return valor.slice(0, 10).map(v => limpiar(v, nivel + 1));
  const salida = {};
  for (const [k, v] of Object.entries(valor)) {
    salida[k] = SENSIBLE.test(k) ? '[oculto]' : limpiar(v, nivel + 1);
  }
  return salida;
}

function detalleDe(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || !Object.keys(cuerpo).length) return null;
  const texto = JSON.stringify(limpiar(cuerpo));
  return texto.length > 700 ? texto.slice(0, 697) + '...' : texto;
}

let promesaTabla = null;
// Crea la tabla si no existe. Las llamadas simultáneas comparten el mismo intento.
function asegurarTabla() {
  if (promesaTabla) return promesaTabla;
  promesaTabla = (async () => {
    try {
      await q(`CREATE TABLE IF NOT EXISTS auditoria (
        id bigint NOT NULL AUTO_INCREMENT,
        creado_en datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        usuario_id int DEFAULT NULL,
        usuario_email varchar(150) DEFAULT NULL,
        usuario_rol varchar(20) DEFAULT NULL,
        accion varchar(120) NOT NULL,
        entidad varchar(40) DEFAULT NULL,
        entidad_id varchar(40) DEFAULT NULL,
        detalle text,
        ip varchar(64) DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_auditoria_creado (creado_en),
        KEY idx_auditoria_entidad (entidad, entidad_id),
        KEY idx_auditoria_usuario (usuario_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      return true;
    } catch (err) {
      console.error('No se pudo preparar la tabla auditoria:', err.message);
      promesaTabla = null;      // permite reintentar en la próxima acción
      return false;
    }
  })();
  return promesaTabla;
}

// usuario: { id, email, rol } | null
async function registrar({ usuario, accion, entidad, entidad_id, detalle, ip }) {
  try {
    if (!(await asegurarTabla())) return;
    await q(
      `INSERT INTO auditoria (usuario_id, usuario_email, usuario_rol, accion, entidad, entidad_id, detalle, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuario && usuario.id || null, usuario && usuario.email || null, usuario && usuario.rol || null,
       String(accion).slice(0, 120), entidad || null, entidad_id ? String(entidad_id).slice(0, 40) : null,
       detalle || null, ip ? String(ip).slice(0, 64) : null]
    );
  } catch (err) {
    console.error('No se pudo registrar la auditoría:', err.message);
  }
}

// Encuentra la regla que corresponde a la petición, o null.
function reglaDe(metodo, ruta) {
  for (const [m, patron, entidad, etiqueta] of RUTAS) {
    if (m !== metodo) continue;
    const r = patron.exec(ruta);
    if (r) return { entidad, id: r[1] && /^\d+$/.test(r[1]) ? r[1] : null, accion: etiqueta.replace(/\$(\d)/g, (_, n) => r[n] || '') };
  }
  return null;
}

// Va después de express.json() y antes de las rutas.
function middleware(req, res, next) {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

  // Guarda la respuesta para poder leer el id de lo recién creado (por ejemplo, una orden nueva)
  const jsonOriginal = res.json.bind(res);
  let respuesta = null;
  res.json = cuerpo => { respuesta = cuerpo; return jsonOriginal(cuerpo); };

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const ruta = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '') || '/';
    const regla = reglaDe(req.method, ruta);
    if (!regla) return;

    let id = regla.id;
    if (!id && respuesta && typeof respuesta === 'object') {
      id = respuesta.id || respuesta.orden_id || respuesta.ordenId || null;
    }
    registrar({
      usuario: req.user || null,
      accion: regla.accion,
      entidad: regla.entidad,
      entidad_id: id,
      detalle: detalleDe(req.body),
      ip: req.ip
    });
  });
  next();
}

module.exports = { middleware, registrar, asegurarTabla, reglaDe, limpiar };
