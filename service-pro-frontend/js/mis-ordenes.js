// =============================================
// VOLTIA PRO SPA — mis-ordenes.js
// Lista las órdenes del cliente y permite calificar las completadas
// =============================================

const API_URL = 'https://service-pro-backend-u3wn.onrender.com';

const NOMBRES_SERVICIO = { camara: 'Cámaras', enchufe: 'Enchufes', alumbrado: 'Alumbrado' };
const NOMBRES_ESTADO = {
  pendiente: 'Pendiente', evaluada: 'Evaluada', cotizada: 'Cotizada',
  aprobada: 'Aprobada', completado: 'Completada', rechazada: 'Rechazada'
};

function nombresServicios(texto) {
  if (!texto) return '—';
  return texto.split(', ').map(s => NOMBRES_SERVICIO[s] || s).join(', ');
}

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---- Estrellas de solo lectura ----
function estrellasFijas(cantidad) {
  const cont = el('span', 'estrellas-fijas');
  cont.setAttribute('aria-label', `${cantidad} de 5 estrellas`);
  for (let i = 1; i <= 5; i++) {
    cont.appendChild(el('span', i <= cantidad ? 'estrella llena' : 'estrella', '★'));
  }
  return cont;
}

// ---- Formulario para calificar ----
function formularioCalificar(orden) {
  const form = el('div', 'calificar-form');
  let seleccion = 0;

  form.appendChild(el('p', 'calificar-titulo', '¿Cómo fue el servicio?'));

  const fila = el('div', 'estrellas-input');
  const botones = [];

  function pintar(hasta) {
    botones.forEach((b, i) => b.classList.toggle('llena', i < hasta));
  }

  for (let i = 1; i <= 5; i++) {
    const b = el('button', 'estrella-btn', '★');
    b.type = 'button';
    b.setAttribute('aria-label', `${i} ${i === 1 ? 'estrella' : 'estrellas'}`);
    b.addEventListener('mouseenter', () => pintar(i));
    b.addEventListener('mouseleave', () => pintar(seleccion));
    b.addEventListener('click', () => { seleccion = i; pintar(i); msg.textContent = ''; });
    botones.push(b);
    fila.appendChild(b);
  }
  form.appendChild(fila);

  const comentario = el('textarea', 'calificar-comentario');
  comentario.placeholder = 'Cuéntanos tu experiencia (opcional)';
  comentario.maxLength = 500;
  comentario.rows = 3;
  form.appendChild(comentario);

  const msg = el('span', 'input-error');
  form.appendChild(msg);

  const enviar = el('button', 'btn', 'Enviar calificación');
  enviar.type = 'button';
  enviar.addEventListener('click', async () => {
    if (!seleccion) { msg.textContent = 'Selecciona de 1 a 5 estrellas.'; return; }

    enviar.disabled = true;
    enviar.textContent = 'Enviando…';
    try {
      const res = await fetch(`${API_URL}/ordenes/${orden.id}/calificacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ estrellas: seleccion, comentario: comentario.value.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        msg.textContent = data.error || 'No se pudo guardar la calificación.';
        enviar.disabled = false;
        enviar.textContent = 'Enviar calificación';
        return;
      }

      // Reemplazar el formulario por la calificación ya guardada
      form.replaceWith(bloqueCalificada(seleccion, comentario.value.trim()));
    } catch (err) {
      console.error(err);
      msg.textContent = 'Error de conexión. Intenta nuevamente.';
      enviar.disabled = false;
      enviar.textContent = 'Enviar calificación';
    }
  });
  form.appendChild(enviar);

  return form;
}

function bloqueCalificada(estrellas, comentario) {
  const bloque = el('div', 'calificada');
  bloque.appendChild(el('p', 'calificar-titulo', 'Tu calificación'));
  bloque.appendChild(estrellasFijas(estrellas));
  if (comentario) bloque.appendChild(el('p', 'calificada-comentario', comentario));
  return bloque;
}

// ---- Tarjeta de cada orden ----
function tarjetaOrden(orden) {
  const t = el('div', 'orden-card');

  const cab = el('div', 'orden-cab');
  cab.appendChild(el('strong', '', `Orden #${orden.id}`));
  cab.appendChild(el('span', `estado-badge ${orden.estado}`, NOMBRES_ESTADO[orden.estado] || orden.estado));
  t.appendChild(cab);

  t.appendChild(el('p', 'orden-dato', `📍 ${orden.direccion}`));
  t.appendChild(el('p', 'orden-dato', `🔧 ${nombresServicios(orden.servicios)}`));
  t.appendChild(el('p', 'orden-dato', `📅 ${new Date(orden.created_at).toLocaleDateString('es-CL')}`));

  if (orden.estrellas) {
    t.appendChild(bloqueCalificada(orden.estrellas, orden.comentario));
  } else if (orden.estado === 'completado') {
    t.appendChild(formularioCalificar(orden));
  }

  return t;
}

// ---- Carga inicial ----
async function cargarOrdenes() {
  const lista = document.getElementById('lista-ordenes');
  const token = sessionStorage.getItem('token');

  if (!token) { window.location.href = 'login.html'; return; }

  try {
    const res = await fetch(`${API_URL}/ordenes/mias`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    const ordenes = await res.json();
    if (!res.ok) throw new Error(ordenes.error || 'Error');

    lista.textContent = '';
    if (!ordenes.length) {
      lista.appendChild(el('p', 'ordenes-estado-msg', 'Aún no tienes órdenes. ¡Solicita tu primer servicio!'));
      return;
    }
    ordenes.forEach(o => lista.appendChild(tarjetaOrden(o)));
  } catch (err) {
    console.error(err);
    lista.textContent = '';
    lista.appendChild(el('p', 'ordenes-estado-msg', 'No pudimos cargar tus órdenes. Intenta nuevamente.'));
  }
}

document.addEventListener('DOMContentLoaded', cargarOrdenes);