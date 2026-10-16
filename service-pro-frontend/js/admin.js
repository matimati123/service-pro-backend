// =============================================
// VOLTIA PRO SPA — admin.js
// Lógica del panel de administrador
// =============================================

const API = 'https://service-pro-backend-u3wn.onrender.com';
let todasLasOrdenes = [];

// =============================================
// INICIALIZAR
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Verificar que sea admin
  const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
  if (!usuario || usuario.rol !== 'admin') {
    alert('Acceso denegado. Solo administradores.');
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('admin-nombre').textContent = usuario.nombre;
  cargarDashboard();
});

// =============================================
// NAVEGACIÓN ENTRE SECCIONES
// =============================================
function mostrarSeccion(id) {
  document.querySelectorAll('.admin-seccion').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';

  // Actualizar link activo
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  event.target.classList.add('active');

  // Actualizar título
  const titulos = {
    'seccion-dashboard': 'Dashboard',
    'seccion-ordenes': 'Órdenes',
    'seccion-ventas': 'Ventas',
    'seccion-finanzas': 'Finanzas',
    'seccion-usuarios': 'Usuarios',
    'seccion-mensajes': 'Mensajes'
  };
  document.getElementById('admin-titulo').textContent = titulos[id] || '';

  // Cargar datos según sección
  if (id === 'seccion-ordenes') cargarOrdenes();
  if (id === 'seccion-ventas') cargarVentas();
  if (id === 'seccion-finanzas') cargarFinanzas();
  if (id === 'seccion-usuarios') cargarUsuarios();
  if (id === 'seccion-mensajes') cargarMensajes();
}

// =============================================
// DASHBOARD — Estadísticas + recientes
// =============================================
async function cargarDashboard() {
  try {
    const token = sessionStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    const [resOrdenes, resUsuarios] = await Promise.all([
      fetch(`${API}/ordenes`, { headers }),
      fetch(`${API}/users`, { headers })
    ]);

    const ordenes = await resOrdenes.json();
    const usuarios = await resUsuarios.json();

    // Estadísticas
    document.getElementById('stat-total').textContent = ordenes.length;
    document.getElementById('stat-pendientes').textContent = ordenes.filter(o => o.estado === 'pendiente').length;
    document.getElementById('stat-completadas').textContent = ordenes.filter(o => o.estado === 'completado').length;
    document.getElementById('stat-usuarios').textContent = usuarios.length;

    // Órdenes recientes (últimas 5)
    todasLasOrdenes = ordenes;
    const recientes = ordenes.slice(0, 5);
    renderTablaRecientes(recientes);

  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

function escapeHtml(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Botón de detalle: "📷 N" si hay fotos y "💬" si hay descripción.
// Abre un solo cuadro con las fotos y, más abajo, la descripción del problema.
function botonDetalle(o) {
  const nFotos = Number(o.total_fotos) || 0;
  const hayTexto = !!(o.observaciones || '').trim();
  if (!nFotos && !hayTexto) return '';

  const partes = [];
  if (nFotos) partes.push(`📷 ${nFotos}`);
  if (hayTexto) partes.push('💬');

  return `<button class="btn-tabla" onclick="verDetalle(${Number(o.id)})" title="Ver fotos y descripción del problema">${partes.join(' ')}</button>`;
}

// Formato en pesos chilenos: 45000 -> $45.000
function formatoCLP(n) {
  return (Number(n) || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

// Botón para registrar el monto de la orden (muestra el valor si ya existe)
function botonMonto(o) {
  const tieneMonto = o.monto !== null && o.monto !== undefined;
  const etiqueta = tieneMonto ? `💲 ${formatoCLP(o.monto)}` : '💲 Monto';
  return `<button class="btn-tabla" onclick="abrirModalMonto(${Number(o.id)})" title="Registrar el monto de esta orden">${etiqueta}</button>`;
}

function renderCalificacion(estrellas, comentario) {
  if (!estrellas) {
    return '<span style="color:#555; font-size:0.8rem;">Sin calificar</span>';
  }
  const cantidad = Number(estrellas) || 0;
  const estrellasLlenas = '★'.repeat(cantidad);
  const estrellasVacias = '☆'.repeat(Math.max(0, 5 - cantidad));
  const comentarioEscapado = escapeHtml(comentario || '');

  return `
    <div class="calificacion-celda">
      <div>
        <span class="estrellas-rating">${estrellasLlenas}</span><span style="color:#444; font-size:0.95rem;">${estrellasVacias}</span>
        <span style="font-size:0.75rem; color:var(--gris-texto); font-weight:600; margin-left:4px;">(${cantidad}/5)</span>
      </div>
      ${comentarioEscapado ? `<p class="comentario-preview" title="${comentarioEscapado}">💬 "${comentarioEscapado}"</p>` : ''}
    </div>
  `;
}

function renderTablaRecientes(ordenes) {
  const tbody = document.getElementById('body-recientes');
  if (!ordenes.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="tabla-loading">No hay órdenes aún.</td></tr>';
    return;
  }
  tbody.innerHTML = ordenes.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.cliente}</td>
      <td>${o.direccion}</td>
      <td><span class="estado-badge ${o.estado}">${o.estado}</span></td>
      <td>${renderCalificacion(o.estrellas, o.comentario)}</td>
      <td>${new Date(o.created_at).toLocaleDateString('es-CL')}</td>
      <td>
        ${botonDetalle(o)}${botonMonto(o)}<button class="btn-tabla" onclick="abrirModalTecnico(${o.id})">Asignar</button>
        <select class="select-estado" onchange="cambiarEstado(${o.id}, this.value)">
          <option value="">Cambiar estado</option>
          <option value="pendiente">Pendiente</option>
          <option value="evaluada">Evaluada</option>
          <option value="cotizada">Cotizada</option>
          <option value="aprobada">Aprobada</option>
          <option value="completado">Completada</option>
          <option value="rechazada">Rechazada</option>
        </select>
      </td>
    </tr>
  `).join('');
}

// =============================================
// ÓRDENES
// =============================================
async function cargarOrdenes() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    todasLasOrdenes = await res.json();
    renderTablaOrdenes(todasLasOrdenes);
  } catch (err) {
    console.error('Error cargando órdenes:', err);
  }
}

function renderTablaOrdenes(ordenes) {
  const tbody = document.getElementById('body-ordenes');
  if (!ordenes.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="tabla-loading">No hay órdenes.</td></tr>';
    return;
  }
  tbody.innerHTML = ordenes.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.cliente}</td>
      <td>${o.direccion}</td>
      <td>${o.servicios || '—'}</td>
      <td><span class="estado-badge ${o.estado}">${o.estado}</span></td>
      <td>${o.tecnico_nombre ? `👷 ${o.tecnico_nombre}` : '<span style="color:#555">Sin asignar</span>'}</td>
      <td>${renderCalificacion(o.estrellas, o.comentario)}</td>
      <td>${new Date(o.created_at).toLocaleDateString('es-CL')}</td>
      <td>
        ${botonDetalle(o)}${botonMonto(o)}<button class="btn-tabla" onclick="abrirModalTecnico(${o.id})">Asignar</button>
        <select class="select-estado" onchange="cambiarEstado(${o.id}, this.value)">
          <option value="">Estado</option>
          <option value="pendiente">Pendiente</option>
          <option value="evaluada">Evaluada</option>
          <option value="cotizada">Cotizada</option>
          <option value="aprobada">Aprobada</option>
          <option value="completado">Completada</option>
          <option value="rechazada">Rechazada</option>
        </select>
      </td>
    </tr>
  `).join('');
}

function filtrarOrdenes() {
  const estado = document.getElementById('filtro-estado').value;
  const filtradas = estado ? todasLasOrdenes.filter(o => o.estado === estado) : todasLasOrdenes;
  renderTablaOrdenes(filtradas);
}

async function cambiarEstado(ordenId, nuevoEstado) {
  if (!nuevoEstado) return;
  try {
    const token = sessionStorage.getItem('token');
    await fetch(`${API}/ordenes/${ordenId}/estado`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    alert(`✅ Estado actualizado a: ${nuevoEstado}`);
    cargarOrdenes();
    cargarDashboard();
  } catch (err) {
    alert('❌ Error al cambiar estado.');
  }
}

// =============================================
// MODAL TÉCNICO
// =============================================
function abrirModalTecnico(ordenId) {
  document.getElementById('modal-orden-id').value = ordenId;
  document.getElementById('tecnico-nombre').value = '';
  document.getElementById('tecnico-email').value = '';
  document.getElementById('tecnico-telefono').value = '';
  document.getElementById('modal-tecnico').style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal-tecnico').style.display = 'none';
}

async function asignarTecnico() {
  const ordenId = document.getElementById('modal-orden-id').value;
  const nombre = document.getElementById('tecnico-nombre').value.trim();
  const email = document.getElementById('tecnico-email').value.trim();
  const telefono = document.getElementById('tecnico-telefono').value.trim();

  if (!nombre || !email || !telefono) {
    alert('Completa el nombre, email y WhatsApp del técnico.');
    return;
  }

  // WhatsApp: celular chileno (+56 9 XXXX XXXX)
  const digitos = telefono.replace(/\D/g, '');
  const normalizado = (digitos.length === 9 && digitos.startsWith('9')) ? '56' + digitos : digitos;
  if (!/^569\d{8}$/.test(normalizado)) {
    alert('Ingresa un WhatsApp válido para el técnico, por ejemplo +56 9 1234 5678.');
    return;
  }

  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/${ordenId}/asignar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tecnico_nombre: nombre, tecnico_email: email, tecnico_telefono: telefono })
    });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ Técnico asignado. Se envió notificación a ${email}`);
      cerrarModal();
      cargarOrdenes();
      cargarDashboard();
    } else {
      alert('❌ ' + (data.error || 'Error al asignar técnico.'));
    }
  } catch (err) {
    alert('❌ Error al asignar técnico.');
  }
}

// =============================================
// DETALLE DE LA ORDEN (modal): fotos + descripción del problema
// La descripción sale de la lista de órdenes ya cargada.
// Las fotos exigen token, así que se piden con fetch y se muestran como data URL.
// =============================================
function mensajeGaleria(texto) {
  const galeria = document.getElementById('fotos-galeria');
  galeria.textContent = '';
  const p = document.createElement('p');
  p.className = 'fotos-galeria-msg';
  p.textContent = texto;
  galeria.appendChild(p);
}

async function verDetalle(ordenId) {
  const orden = todasLasOrdenes.find(o => Number(o.id) === Number(ordenId));
  if (!orden) return;

  document.getElementById('modal-detalle-titulo').textContent = `Detalle de la orden #${ordenId}`;
  document.getElementById('modal-detalle-cliente').textContent = orden.cliente ? `Cliente: ${orden.cliente}` : '';

  // Descripción (textContent, no innerHTML: el texto lo escribe el cliente)
  const texto = (orden.observaciones || '').trim();
  const cajaTexto = document.getElementById('detalle-descripcion');
  cajaTexto.textContent = texto || 'El cliente no escribió una descripción.';
  cajaTexto.classList.toggle('vacio', !texto);

  // Fotos: el bloque solo se muestra si la orden tiene
  const hayFotos = (Number(orden.total_fotos) || 0) > 0;
  document.getElementById('detalle-fotos-bloque').style.display = hayFotos ? 'block' : 'none';
  document.getElementById('modal-detalle').style.display = 'flex';
  if (!hayFotos) return;

  mensajeGaleria('Cargando fotos…');

  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/${ordenId}/fotos`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const fotos = await res.json();
    if (!res.ok) throw new Error(fotos.error || 'Error');

    if (!fotos.length) { mensajeGaleria('Esta orden no tiene fotos.'); return; }

    const galeria = document.getElementById('fotos-galeria');
    galeria.textContent = '';
    fotos.forEach((f, i) => {
      const img = document.createElement('img');
      img.src = f.data;
      img.alt = `Foto ${i + 1} de la orden #${ordenId}`;
      img.addEventListener('click', () => ampliarFoto(f.data));
      galeria.appendChild(img);
    });
  } catch (err) {
    console.error('Error cargando fotos:', err);
    mensajeGaleria('No se pudieron cargar las fotos. Intenta nuevamente.');
  }
}

function ampliarFoto(src) {
  const visor = document.createElement('div');
  visor.className = 'foto-lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Foto ampliada';
  visor.appendChild(img);
  visor.addEventListener('click', () => visor.remove());
  document.body.appendChild(visor);
}

function cerrarModalDetalle() {
  document.getElementById('modal-detalle').style.display = 'none';
}

// =============================================
// VENTAS (resumen por mes)
// =============================================
let datosVentas = { meses: [], servicios: [] };

const NOMBRES_SERVICIO_ADMIN = {
  camara: 'Cámaras',
  enchufe: 'Enchufes',
  alumbrado: 'Alumbrado'
};

// "2026-10" -> "Octubre 2026"
function nombreMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// completadas / (completadas + rechazadas)
function tasaCierre(completadas, rechazadas) {
  const cerradas = completadas + rechazadas;
  return cerradas ? Math.round((completadas / cerradas) * 100) + '%' : '—';
}

async function cargarVentas() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/ventas`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    datosVentas = data;

    const select = document.getElementById('filtro-mes-ventas');
    const anterior = select.value;

    if (!datosVentas.meses.length) {
      select.innerHTML = '<option value="">Sin datos</option>';
    } else {
      select.innerHTML = datosVentas.meses
        .map(m => `<option value="${m.mes}">${nombreMes(m.mes)}</option>`)
        .join('');
      // Mantener el mes que estaba viendo, si existe
      if (datosVentas.meses.some(m => m.mes === anterior)) select.value = anterior;
    }
    mostrarMesVentas();
  } catch (err) {
    console.error('Error cargando ventas:', err);
    document.getElementById('body-ventas-meses').innerHTML =
      '<tr><td colspan="6" class="tabla-loading">No se pudieron cargar las ventas.</td></tr>';
  }
}

function seleccionarMesVentas(mes) {
  document.getElementById('filtro-mes-ventas').value = mes;
  mostrarMesVentas();
}

function mostrarMesVentas() {
  const mes = document.getElementById('filtro-mes-ventas').value;
  const fila = datosVentas.meses.find(m => m.mes === mes);

  // Tarjetas del mes elegido
  document.getElementById('ventas-titulo-mes').textContent = mes ? `Resumen de ${nombreMes(mes)}` : 'Resumen del mes';
  document.getElementById('v-total').textContent = fila ? fila.total : 0;
  document.getElementById('v-completadas').textContent = fila ? fila.completadas : 0;
  document.getElementById('v-rechazadas').textContent = fila ? fila.rechazadas : 0;
  document.getElementById('v-proceso').textContent = fila ? fila.en_proceso : 0;
  document.getElementById('v-tasa').textContent = fila ? tasaCierre(fila.completadas, fila.rechazadas) : '—';

  // Desglose por servicio del mes elegido
  const deMes = datosVentas.servicios.filter(s => s.mes === mes);
  document.getElementById('body-ventas-servicios').innerHTML = deMes.length
    ? deMes.map(s => `
        <tr>
          <td>${escapeHtml(NOMBRES_SERVICIO_ADMIN[s.servicio] || s.servicio)}</td>
          <td>${s.total}</td>
          <td>${s.completadas}</td>
          <td>${s.rechazadas}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" class="tabla-loading">Sin datos para este mes.</td></tr>';

  // Historial de todos los meses (clic en una fila para ver ese mes)
  document.getElementById('body-ventas-meses').innerHTML = datosVentas.meses.length
    ? datosVentas.meses.map(m => `
        <tr class="fila-clic ${m.mes === mes ? 'fila-activa' : ''}" onclick="seleccionarMesVentas('${m.mes}')">
          <td>${nombreMes(m.mes)}</td>
          <td>${m.total}</td>
          <td>${m.completadas}</td>
          <td>${m.rechazadas}</td>
          <td>${m.en_proceso}</td>
          <td>${tasaCierre(m.completadas, m.rechazadas)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" class="tabla-loading">Aún no hay órdenes registradas.</td></tr>';
}

// =============================================
// MONTO DE LA ORDEN (modal)
// =============================================
function abrirModalMonto(ordenId) {
  const orden = todasLasOrdenes.find(o => Number(o.id) === Number(ordenId));
  if (!orden) return;

  document.getElementById('modal-monto-titulo').textContent = `Monto de la orden #${ordenId}`;
  document.getElementById('monto-orden-id').value = ordenId;
  document.getElementById('monto-valor').value =
    (orden.monto !== null && orden.monto !== undefined) ? orden.monto : '';
  document.getElementById('modal-monto').style.display = 'flex';
}

function cerrarModalMonto() {
  document.getElementById('modal-monto').style.display = 'none';
}

async function guardarMonto() {
  const ordenId = document.getElementById('monto-orden-id').value;
  const valor = document.getElementById('monto-valor').value.trim();

  if (valor !== '' && (!/^\d+$/.test(valor) || Number(valor) > 100000000)) {
    alert('Ingresa un monto válido en pesos (solo números, sin puntos).');
    return;
  }

  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/${ordenId}/monto`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ monto: valor === '' ? null : Number(valor) })
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.error || 'No se pudo guardar el monto.'));
      return;
    }
    cerrarModalMonto();
    cargarOrdenes();
    cargarDashboard();
  } catch (err) {
    alert('❌ Error al guardar el monto.');
  }
}

// =============================================
// FINANZAS (ingresos por mes)
// =============================================
let datosFinanzas = { meses: [] };

async function cargarFinanzas() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/finanzas`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    datosFinanzas = data;

    const select = document.getElementById('filtro-mes-finanzas');
    const anterior = select.value;

    if (!datosFinanzas.meses.length) {
      select.innerHTML = '<option value="">Sin datos</option>';
    } else {
      select.innerHTML = datosFinanzas.meses
        .map(m => `<option value="${m.mes}">${nombreMes(m.mes)}</option>`)
        .join('');
      if (datosFinanzas.meses.some(m => m.mes === anterior)) select.value = anterior;
    }
    mostrarMesFinanzas();
  } catch (err) {
    console.error('Error cargando finanzas:', err);
    document.getElementById('body-finanzas-meses').innerHTML =
      '<tr><td colspan="6" class="tabla-loading">No se pudieron cargar las finanzas.</td></tr>';
  }
}

function seleccionarMesFinanzas(mes) {
  document.getElementById('filtro-mes-finanzas').value = mes;
  mostrarMesFinanzas();
}

// Ticket promedio = ingresos / completadas que tienen monto
function ticketPromedio(m) {
  const conMonto = m.completadas - m.completadas_sin_monto;
  return conMonto > 0 ? Math.round(m.ingresos / conMonto) : 0;
}

function mostrarMesFinanzas() {
  const mes = document.getElementById('filtro-mes-finanzas').value;
  const fila = datosFinanzas.meses.find(m => m.mes === mes);

  document.getElementById('finanzas-titulo-mes').textContent = mes ? `Finanzas de ${nombreMes(mes)}` : 'Finanzas del mes';
  document.getElementById('f-ingresos').textContent = formatoCLP(fila ? fila.ingresos : 0);
  document.getElementById('f-ticket').textContent = formatoCLP(fila ? ticketPromedio(fila) : 0);
  document.getElementById('f-proceso').textContent = formatoCLP(fila ? fila.en_proceso : 0);
  document.getElementById('f-perdido').textContent = formatoCLP(fila ? fila.perdido : 0);

  // Aviso si hay órdenes completadas sin monto (los ingresos quedarían incompletos)
  const aviso = document.getElementById('f-aviso');
  if (fila && fila.completadas_sin_monto > 0) {
    const n = fila.completadas_sin_monto;
    aviso.textContent = `⚠️ Hay ${n} ${n === 1 ? 'orden completada' : 'órdenes completadas'} sin monto: los ingresos están incompletos. Regístralo con el botón 💲 en la sección Órdenes.`;
    aviso.style.display = 'block';
  } else {
    aviso.style.display = 'none';
  }

  // Historial de todos los meses (clic en una fila para ver ese mes)
  document.getElementById('body-finanzas-meses').innerHTML = datosFinanzas.meses.length
    ? datosFinanzas.meses.map(m => `
        <tr class="fila-clic ${m.mes === mes ? 'fila-activa' : ''}" onclick="seleccionarMesFinanzas('${m.mes}')">
          <td>${nombreMes(m.mes)}</td>
          <td>${formatoCLP(m.ingresos)}</td>
          <td>${m.completadas}</td>
          <td>${formatoCLP(ticketPromedio(m))}</td>
          <td>${formatoCLP(m.en_proceso)}</td>
          <td>${formatoCLP(m.perdido)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" class="tabla-loading">Aún no hay órdenes registradas.</td></tr>';
}

// =============================================
// USUARIOS
// =============================================
async function cargarUsuarios() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const usuarios = await res.json();
    const tbody = document.getElementById('body-usuarios');
    if (!usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="tabla-loading">No hay usuarios.</td></tr>';
      return;
    }
    tbody.innerHTML = usuarios.map(u => `
      <tr>
        <td>#${u.id}</td>
        <td>${u.nombre}</td>
        <td>${u.email}</td>
        <td><span class="estado-badge ${u.rol}">${u.rol}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString('es-CL')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando usuarios:', err);
  }
}

// =============================================
// MENSAJES
// =============================================
async function cargarMensajes() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`${API}/mensajes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const mensajes = await res.json();
    const tbody = document.getElementById('body-mensajes');
    if (!mensajes.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="tabla-loading">No hay mensajes.</td></tr>';
      return;
    }
    tbody.innerHTML = mensajes.map(m => `
      <tr>
        <td>#${m.id}</td>
        <td>${m.nombre}</td>
        <td>${m.email || '—'}</td>
        <td>${m.mensaje}</td>
        <td>${new Date(m.created_at).toLocaleDateString('es-CL')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando mensajes:', err);
  }
}

// =============================================
// CERRAR SESIÓN
// =============================================
function cerrarSesion() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html';
}