// =============================================
// VOLTIA PRO SPA — dashboard.js
// Panel de usuario: Resumen, Historial de órdenes y Calificaciones
// =============================================

const API_URL = 'https://service-pro-backend-u3wn.onrender.com';

const NOMBRES_SERVICIO = {
  camara: 'Cámaras de seguridad',
  enchufe: 'Instalación de enchufes',
  alumbrado: 'Alumbrado e iluminación'
};

const NOMBRES_ESTADO = {
  pendiente: 'Pendiente',
  evaluada: 'Evaluada',
  cotizada: 'Cotizada',
  aprobada: 'Aprobada',
  completado: 'Completada',
  rechazada: 'Rechazada'
};

let misOrdenesData = [];
let filtroActual = 'todas';

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

// ---- Estrellas fijas ----
function estrellasFijas(cantidad) {
  const cont = el('span', 'estrellas-fijas');
  cont.setAttribute('aria-label', `${cantidad} de 5 estrellas`);
  for (let i = 1; i <= 5; i++) {
    cont.appendChild(el('span', i <= cantidad ? 'estrella llena' : 'estrella', '★'));
  }
  return cont;
}

// ---- Bloque de calificación ya realizada ----
function bloqueCalificada(estrellas, comentario) {
  const bloque = el('div', 'calificada');
  bloque.appendChild(el('p', 'calificar-titulo', 'Tu calificación'));
  bloque.appendChild(estrellasFijas(estrellas));
  if (comentario) bloque.appendChild(el('p', 'calificada-comentario', comentario));
  return bloque;
}

// ---- Formulario para calificar orden completada ----
function formularioCalificar(orden) {
  const form = el('div', 'calificar-form');
  let seleccion = 0;

  form.appendChild(el('p', 'calificar-titulo', '¿Cómo fue tu experiencia con este servicio?'));

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
  comentario.placeholder = 'Escribe un comentario sobre el servicio (opcional)...';
  comentario.maxLength = 500;
  comentario.rows = 2;
  form.appendChild(comentario);

  const msg = el('span', 'input-error');
  form.appendChild(msg);

  const enviar = el('button', 'btn', 'Enviar calificación');
  enviar.type = 'button';
  enviar.addEventListener('click', async () => {
    if (!seleccion) {
      msg.textContent = 'Selecciona al menos 1 estrella.';
      return;
    }

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

      // Actualizar dato local
      orden.estrellas = seleccion;
      orden.comentario = comentario.value.trim();

      // Reemplazar formulario por bloque de calificación
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

// ---- Tarjeta de orden ----
function tarjetaOrden(orden) {
  const card = el('div', 'orden-card');

  const cab = el('div', 'orden-cab');
  cab.appendChild(el('strong', '', `Orden #${orden.id}`));
  cab.appendChild(el('span', `estado-badge ${orden.estado}`, NOMBRES_ESTADO[orden.estado] || orden.estado));
  card.appendChild(cab);

  card.appendChild(el('p', 'orden-dato', `📍 ${orden.direccion}`));
  card.appendChild(el('p', 'orden-dato', `🔧 ${nombresServicios(orden.servicios)}`));
  card.appendChild(el('p', 'orden-dato', `📅 ${new Date(orden.created_at).toLocaleDateString('es-CL')}`));

  if (orden.estrellas) {
    card.appendChild(bloqueCalificada(orden.estrellas, orden.comentario));
  } else if (orden.estado === 'completado') {
    card.appendChild(formularioCalificar(orden));
  }

  return card;
}

// ---- Renderizar órdenes con filtro ----
function renderOrdenes() {
  const contenedor = document.getElementById('historial-ordenes-lista');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  let filtradas = misOrdenesData;
  if (filtroActual === 'activas') {
    filtradas = misOrdenesData.filter(o => o.estado !== 'completado' && o.estado !== 'rechazada');
  } else if (filtroActual === 'completadas') {
    filtradas = misOrdenesData.filter(o => o.estado === 'completado');
  }

  if (!filtradas.length) {
    const empty = el('div', 'empty-ordenes');
    const icon = el('div', 'empty-icon', filtroActual === 'completadas' ? '🏁' : '⚡');
    empty.appendChild(icon);

    const titulo = el('h4', '', 
      filtroActual === 'completadas' 
        ? 'No tienes órdenes completadas aún'
        : (filtroActual === 'activas' 
            ? 'No tienes órdenes en curso'
            : 'Aún no tienes órdenes registradas')
    );
    empty.appendChild(titulo);

    const desc = el('p', '', 'Solicita tu servicio eléctrico cuando lo necesites de forma rápida y sencilla.');
    empty.appendChild(desc);

    const btn = el('a', 'btn', 'Solicitar un servicio');
    btn.href = 'ordenes.html';
    empty.appendChild(btn);

    contenedor.appendChild(empty);
    return;
  }

  const grid = el('div', 'ordenes-grid');
  filtradas.forEach(o => grid.appendChild(tarjetaOrden(o)));
  contenedor.appendChild(grid);
}

// ---- Actualizar contadores en las tarjetas de estadísticas ----
function actualizarStats(ordenes) {
  const statTotal = document.getElementById('stat-user-total');
  const statEnProceso = document.getElementById('stat-user-proceso');
  const statCompletadas = document.getElementById('stat-user-completadas');

  if (statTotal) statTotal.textContent = ordenes.length;
  if (statEnProceso) {
    statEnProceso.textContent = ordenes.filter(o => o.estado !== 'completado' && o.estado !== 'rechazada').length;
  }
  if (statCompletadas) {
    statCompletadas.textContent = ordenes.filter(o => o.estado === 'completado').length;
  }
}

// ---- Cargar historial de órdenes del usuario ----
async function cargarHistorialDashboard() {
  const contenedor = document.getElementById('historial-ordenes-lista');
  const token = sessionStorage.getItem('token');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

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
    if (!res.ok) throw new Error(ordenes.error || 'Error al obtener órdenes');

    misOrdenesData = ordenes;
    actualizarStats(ordenes);
    renderOrdenes();
  } catch (err) {
    console.error('Error cargando historial:', err);
    if (contenedor) {
      contenedor.innerHTML = '<p class="ordenes-estado-msg">No se pudo cargar el historial de órdenes en este momento.</p>';
    }
  }
}

// ---- Configurar botones de filtro ----
function initFiltros() {
  const botones = document.querySelectorAll('.filtro-btn');
  botones.forEach(btn => {
    btn.addEventListener('click', () => {
      botones.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroActual = btn.getAttribute('data-filtro') || 'todas';
      renderOrdenes();
    });
  });
}

// ---- Inicializar al cargar el DOM ----
document.addEventListener('DOMContentLoaded', () => {
  initFiltros();
  cargarHistorialDashboard();
});
