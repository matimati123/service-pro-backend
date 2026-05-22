// =============================================
// SERVICE PRO SPA — admin.js
// Lógica del panel de administrador
// =============================================

const API = 'http://localhost:3000';
let todasLasOrdenes = [];

// =============================================
// INICIALIZAR
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Verificar que sea admin
  const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
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
    'seccion-usuarios': 'Usuarios',
    'seccion-mensajes': 'Mensajes'
  };
  document.getElementById('admin-titulo').textContent = titulos[id] || '';

  // Cargar datos según sección
  if (id === 'seccion-ordenes') cargarOrdenes();
  if (id === 'seccion-usuarios') cargarUsuarios();
  if (id === 'seccion-mensajes') cargarMensajes();
}

// =============================================
// DASHBOARD — Estadísticas + recientes
// =============================================
async function cargarDashboard() {
  try {
    const token = localStorage.getItem('token');
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

function renderTablaRecientes(ordenes) {
  const tbody = document.getElementById('body-recientes');
  if (!ordenes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tabla-loading">No hay órdenes aún.</td></tr>';
    return;
  }
  tbody.innerHTML = ordenes.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.cliente}</td>
      <td>${o.direccion}</td>
      <td><span class="estado-badge ${o.estado}">${o.estado}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('es-CL')}</td>
      <td>
        <button class="btn-tabla" onclick="abrirModalTecnico(${o.id})">Asignar</button>
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
    const token = localStorage.getItem('token');
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
    tbody.innerHTML = '<tr><td colspan="8" class="tabla-loading">No hay órdenes.</td></tr>';
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
      <td>${new Date(o.created_at).toLocaleDateString('es-CL')}</td>
      <td>
        <button class="btn-tabla" onclick="abrirModalTecnico(${o.id})">Asignar</button>
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
    const token = localStorage.getItem('token');
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
  document.getElementById('modal-tecnico').style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal-tecnico').style.display = 'none';
}

async function asignarTecnico() {
  const ordenId = document.getElementById('modal-orden-id').value;
  const nombre = document.getElementById('tecnico-nombre').value.trim();
  const email = document.getElementById('tecnico-email').value.trim();

  if (!nombre || !email) {
    alert('Completa el nombre y email del técnico.');
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/ordenes/${ordenId}/asignar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tecnico_nombre: nombre, tecnico_email: email })
    });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ Técnico asignado. Se envió notificación a ${email}`);
      cerrarModal();
      cargarOrdenes();
      cargarDashboard();
    } else {
      alert('❌ Error al asignar técnico.');
    }
  } catch (err) {
    alert('❌ Error al asignar técnico.');
  }
}

// =============================================
// USUARIOS
// =============================================
async function cargarUsuarios() {
  try {
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
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
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = 'login.html';
}