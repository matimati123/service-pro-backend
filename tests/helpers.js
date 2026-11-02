// Utilidades de prueba: cargan módulos del backend con dependencias falsas (sin base de datos real,
// sin correo real y sin bcrypt nativo).
const Module = require('module');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Carga un archivo del proyecto reemplazando ciertos módulos por falsos.
// stubs: { 'nombre exacto del require': valor }  (también se comparan por nombre base, ej. '../db')
function cargar(archivo, stubs = {}) {
  const objetivo = path.join(RAIZ, archivo);
  const original = Module._load;
  const cacheAntes = new Map();
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return original.apply(this, arguments);
  };
  // Los módulos que programan un setInterval (limpieza de códigos 2FA) no deben impedir que termine la prueba.
  const intervaloOriginal = global.setInterval;
  global.setInterval = (...a) => { const t = intervaloOriginal(...a); if (t && t.unref) t.unref(); return t; };
  delete require.cache[require.resolve(objetivo)];
  try {
    return require(objetivo);
  } finally {
    global.setInterval = intervaloOriginal;
    Module._load = original;
    cacheAntes.clear();
  }
}

// Router falso de express: guarda los manejadores para llamarlos directamente.
function routerFalso() {
  const rutas = [];
  const r = {};
  for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
    r[m] = (ruta, ...hs) => { rutas.push({ metodo: m.toUpperCase(), ruta, hs }); return r; };
  }
  r.use = () => r;
  r.rutas = rutas;
  return r;
}
const expressFalso = () => {
  const r = routerFalso();
  const ex = () => ({});
  ex.Router = () => r;
  return { ex, r };
};

// Ejecuta la cadena de manejadores de una ruta (middlewares + final) con req/res falsos.
async function llamar(router, metodo, ruta, { body = {}, headers = {}, user } = {}) {
  const def = router.rutas.find(x => x.metodo === metodo && x.ruta === ruta);
  if (!def) throw new Error(`Ruta no encontrada: ${metodo} ${ruta}`);
  const cab = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { body, headers: cab, ip: '1.2.3.4', user, get: n => cab[n.toLowerCase()] };
  const res = {
    codigo: 200, cuerpo: undefined,
    status(c) { this.codigo = c; return this; },
    json(c) { this.cuerpo = c; return this; }
  };
  for (const h of def.hs) {
    let siguio = false;
    await h(req, res, () => { siguio = true; });
    if (!siguio) break;
  }
  return res;
}

module.exports = { cargar, routerFalso, expressFalso, llamar, RAIZ };
