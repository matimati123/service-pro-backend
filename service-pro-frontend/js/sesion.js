// =============================================
// SERVICE PRO SPA — sesion.js
// Maneja la sesión en todas las páginas
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
  const navUsuario = document.getElementById('nav-usuario');
  const navSesion = document.getElementById('nav-sesion');

  if (!navSesion) return;

  if (usuario && usuario.nombre) {
    // Mostrar nombre
    if (navUsuario) navUsuario.textContent = '👤 ' + usuario.nombre;

    // Cambiar botón según rol
    if (usuario.rol === 'admin') {
      navSesion.textContent = '⚙️ Admin';
      navSesion.href = 'admin.html';
      navSesion.onclick = null;
    } else {
      navSesion.textContent = 'Mi cuenta';
      navSesion.href = 'dashboard.html';
      navSesion.onclick = null;
    }

    // Agregar botón cerrar sesión si no existe
    const nav = navSesion.parentElement;
    if (!document.getElementById('btn-cerrar-sesion')) {
      const btnCerrar = document.createElement('a');
      btnCerrar.id = 'btn-cerrar-sesion';
      btnCerrar.href = '#';
      btnCerrar.className = 'nav-login';
      btnCerrar.textContent = 'Cerrar sesión';
      btnCerrar.style.background = '#333';
      btnCerrar.onclick = function(e) {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.href = 'login.html';
      };
      nav.appendChild(btnCerrar);
    }

  } else {
    // No hay sesión — mostrar Login
    if (navUsuario) navUsuario.textContent = '';
    navSesion.textContent = 'Login';
    navSesion.href = 'login.html';
    navSesion.onclick = null;
  }
});