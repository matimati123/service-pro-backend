// =============================================
// VOLTIA PRO SPA — fotos.js
// Adjuntar fotos del problema al crear una orden.
// Las fotos se redimensionan y comprimen en el navegador antes de enviarlas
// (una foto de celular de 5 MB queda en ~200 KB), así la subida es rápida
// incluso con datos móviles.
// =============================================

const FOTOS_MAX = 3;            // debe coincidir con MAX_FOTOS del backend            // debe coincidir con MAX_FOTOS del backend
const FOTOS_LADO_MAX = 1280;    // px del lado más largo
const FOTOS_CALIDADES = [0.72, 0.55, 0.4];
const FOTOS_MAX_BYTES = 1.4 * 1024 * 1024; // el backend rechaza sobre 1.5 MB

let fotosAdjuntas = [];   // [{ id, dataUrl }]
let fotosProcesando = 0;  // cuántas se están comprimiendo ahora
let fotoSeq = 0;

// ---- API para app.js ----
function obtenerFotosParaEnviar() {
  return fotosAdjuntas.map(f => f.dataUrl);
}

function fotosEstanProcesando() {
  return fotosProcesando > 0;
}

// ---- Utilidades ----
function errorFotos(texto) {
  const e = document.getElementById('error-fotos');
  if (e) e.textContent = texto || '';
}

function bytesDeDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor(base64.length * 3 / 4);
}

// Carga la imagen respetando la orientación EXIF (fotos de celular)
async function cargarImagen(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) { /* cae al método clásico */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Devuelve un data URL JPEG liviano
async function comprimirImagen(file) {
  const img = await cargarImagen(file);
  const ancho = img.width;
  const alto = img.height;
  const escala = Math.min(1, FOTOS_LADO_MAX / Math.max(ancho, alto));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ancho * escala));
  canvas.height = Math.max(1, Math.round(alto * escala));

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // los PNG con transparencia no quedan negros al pasar a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (img.close) img.close();

  for (const calidad of FOTOS_CALIDADES) {
    const dataUrl = canvas.toDataURL('image/jpeg', calidad);
    if (bytesDeDataUrl(dataUrl) <= FOTOS_MAX_BYTES) return dataUrl;
  }
  throw new Error('La foto sigue siendo demasiado pesada');
}

// ---- Vista previa ----
function renderFotos() {
  const cont = document.getElementById('fotos-previews');
  const btn = document.getElementById('btn-agregar-fotos');
  if (!cont || !btn) return;

  cont.textContent = '';

  fotosAdjuntas.forEach(foto => {
    const item = document.createElement('div');
    item.className = 'foto-item';

    const img = document.createElement('img');
    img.src = foto.dataUrl;
    img.alt = 'Foto del problema';
    item.appendChild(img);

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'foto-quitar';
    quitar.textContent = '✕';
    quitar.setAttribute('aria-label', 'Quitar foto');
    quitar.addEventListener('click', () => {
      fotosAdjuntas = fotosAdjuntas.filter(f => f.id !== foto.id);
      errorFotos('');
      renderFotos();
    });
    item.appendChild(quitar);

    cont.appendChild(item);
  });

  if (fotosProcesando > 0) {
    const cargando = document.createElement('div');
    cargando.className = 'foto-item foto-cargando';
    cargando.textContent = 'Procesando…';
    cont.appendChild(cargando);
  }

  const llena = fotosAdjuntas.length >= FOTOS_MAX;
  btn.disabled = llena;
  btn.textContent = llena
    ? `Máximo ${FOTOS_MAX} fotos`
    : `＋ Agregar fotos (${fotosAdjuntas.length}/${FOTOS_MAX})`;
}

// ---- Selección de archivos ----
async function agregarFotos(archivos) {
  errorFotos('');
  const lista = Array.from(archivos);
  const cupo = FOTOS_MAX - fotosAdjuntas.length - fotosProcesando;

  if (lista.length > cupo) {
    errorFotos(`Solo puedes adjuntar ${FOTOS_MAX} fotos. Se agregaron las primeras ${Math.max(cupo, 0)}.`);
  }

  for (const file of lista.slice(0, Math.max(cupo, 0))) {
    if (!file.type.startsWith('image/')) {
      errorFotos('Solo se pueden adjuntar imágenes.');
      continue;
    }

    fotosProcesando++;
    renderFotos();
    try {
      const dataUrl = await comprimirImagen(file);
      fotosAdjuntas.push({ id: ++fotoSeq, dataUrl });
    } catch (err) {
      console.error(err);
      errorFotos('No pudimos leer una de las fotos. Prueba con una imagen JPG o PNG.');
    } finally {
      fotosProcesando--;
      renderFotos();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('input-fotos');
  const btn = document.getElementById('btn-agregar-fotos');
  if (!input || !btn) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    agregarFotos(input.files);
    input.value = ''; // permite volver a elegir la misma foto
  });
  renderFotos();
});