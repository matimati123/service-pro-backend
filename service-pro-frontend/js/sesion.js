// =============================================
// SERVICE PRO SPA — sesion.js
// Maneja la sesión en todas las páginas
// =============================================

// ✅ FIX: Validación de token antes de usar la sesión
function tokenValido() {
  const token = sessionStorage.getItem('token');
  if (!token) return false;
  try {
    // Decodifica el payload del JWT (sin verificar firma — eso lo hace el backend)
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Verifica que no haya expirado
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      sessionStorage.clear();
      return false;
    }
    return true;
  } catch (e) {
    sessionStorage.clear();
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // ✅ FIX: Usar sessionStorage en lugar de localStorage
  // localStorage persiste aunque cierres el navegador (riesgo XSS mayor)
  // sessionStorage solo dura mientras la pestaña esté abierta
  const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
  const navUsuario = document.getElementById('nav-usuario');
  const navSesion = document.getElementById('nav-sesion');

  if (!navSesion) return;

  // ✅ FIX: Verificar que el token sea válido antes de mostrar sesión
  if (usuario && usuario.nombre && tokenValido()) {
    // Mostrar nombre — ✅ FIX: usar textContent, nunca innerHTML (previene XSS)
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
        // ✅ FIX: Limpiar TODO sessionStorage al cerrar sesión
        sessionStorage.clear();
        window.location.href = 'login.html';
      };
      nav.appendChild(btnCerrar);
    }

  } else {
    // No hay sesión válida — limpiar y mostrar Login
    sessionStorage.clear();
    if (navUsuario) navUsuario.textContent = '';
    navSesion.textContent = 'Login';
    navSesion.href = 'login.html';
    navSesion.onclick = null;
  }
});