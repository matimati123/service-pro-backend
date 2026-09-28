// =============================================
// VOLTIA PRO SPA — app.js Frontend
// Validaciones + Conexión al Backend
// =============================================

// ---- UTILIDADES ----

// Muestra un mensaje de error bajo un input
function mostrarError(id, mensaje) {
  const input = document.getElementById(id);
  if (!input) return;
  let error = input.parentElement.querySelector('.input-error');
  if (!error) {
    error = document.createElement('span');
    error.className = 'input-error';
    input.parentElement.appendChild(error);
  }
  error.textContent = mensaje;
  input.style.borderColor = '#ef4444';
}

// Limpia el error de un input
function limpiarError(id) {
  const input = document.getElementById(id);
  if (!input) return;
  const error = input.parentElement.querySelector('.input-error');
  if (error) error.textContent = '';
  input.style.borderColor = '';
}

// Valida que un campo no esté vacío
function campoVacio(id) {
  const el = document.getElementById(id);
  return !el || el.value.trim() === '';
}

// Valida formato de email
function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

// =============================================
// CREAR ORDEN
// =============================================
function crearOrden() {
  let valido = true;

  ['cliente', 'direccion'].forEach(limpiarError);
  const errorServicios = document.getElementById('error-servicios');
  if (errorServicios) errorServicios.textContent = '';

  // Validar nombre
  if (campoVacio('cliente')) {
    mostrarError('cliente', 'El nombre es obligatorio.');
    valido = false;
  } else if (document.getElementById('cliente').value.trim().length < 3) {
    mostrarError('cliente', 'El nombre debe tener al menos 3 caracteres.');
    valido = false;
  }

  // Validar dirección
  if (campoVacio('direccion')) {
    mostrarError('direccion', 'La dirección es obligatoria.');
    valido = false;
  }

  // Leer checkboxes seleccionados
  const checkboxes = document.querySelectorAll('.servicios-check input[type="checkbox"]:checked');
  const servicios = Array.from(checkboxes).map(cb => cb.value);

  if (servicios.length === 0) {
    if (errorServicios) errorServicios.textContent = 'Debes seleccionar al menos un servicio.';
    valido = false;
  }

  const fecha = document.getElementById('fecha-visita')?.value;
  const hora = document.getElementById('hora-visita')?.value;
  const errorFecha = document.getElementById('error-fecha');

  if (errorFecha) errorFecha.textContent = '';

  if (!fecha) {
    if (errorFecha) errorFecha.textContent = 'Selecciona una fecha para la visita.';
    valido = false;
  }

  if (!hora) {
    if (errorFecha) errorFecha.textContent = 'Selecciona una hora para la visita.';
    valido = false;
  }

  if (!valido) return;

  const cliente = document.getElementById('cliente').value.trim();
  const direccion = document.getElementById('direccion').value.trim();
  const observaciones = document.getElementById('observaciones')?.value.trim() || '';

  // Si hay sesión iniciada, mandamos el token para que la orden quede a nombre del usuario
  const token = sessionStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch('https://service-pro-backend-u3wn.onrender.com/ordenes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ cliente, direccion, servicios, observaciones, fecha_visita: fecha, hora_visita: hora })
  })
  .then(res => res.json())
  .then(data => {
    alert('✅ Solicitud enviada correctamente. Nos contactaremos contigo a la brevedad.');
    window.location.href = 'dashboard.html';
  })
  .catch(err => {
    alert('❌ Error al crear la orden. Intenta nuevamente.');
    console.error(err);
  });
}

// =============================================
// LOGIN
// =============================================
function login() {
  let valido = true;

  ['email', 'password'].forEach(limpiarError);

  const emailVal = document.getElementById('email')?.value.trim();
  const passVal = document.getElementById('password')?.value;

  // Validar email
  if (!emailVal || emailVal === '') {
    mostrarError('email', 'El correo es obligatorio.');
    valido = false;
  } else if (!emailValido(emailVal)) {
    mostrarError('email', 'Ingresa un correo válido.');
    valido = false;
  }

  // Validar contraseña
  if (!passVal || passVal === '') {
    mostrarError('password', 'La contraseña es obligatoria.');
    valido = false;
  } else if (passVal.length < 6) {
    mostrarError('password', 'La contraseña debe tener al menos 6 caracteres.');
    valido = false;
  }

  if (!valido) return;

  fetch('https://service-pro-backend-u3wn.onrender.com/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailVal, password: passVal })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      mostrarError('password', data.error);
    } else if (data.requiere2FA) {
      // Admin: guardamos el correo para el segundo paso y mostramos el panel del código
      sessionStorage.setItem('email_2fa_pendiente', data.email);
      mostrarPanel('panel-2fa');
    } else {
      // Guardar token y datos del usuario
      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
      // Redirigir según rol
      if (data.usuario.rol === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    }
  })
  .catch(err => {
    alert('❌ Error al iniciar sesión. Intenta nuevamente.');
    console.error(err);
  });
}

// =============================================
// VERIFICAR CÓDIGO 2FA (segundo paso, solo admin)
// =============================================
function verificar2FA() {
  limpiarError('codigo-2fa');

  const codigo = document.getElementById('codigo-2fa')?.value.trim();
  const email = sessionStorage.getItem('email_2fa_pendiente');

  if (!codigo || codigo.length !== 6) {
    mostrarError('codigo-2fa', 'Ingresa el código de 6 dígitos.');
    return;
  }

  if (!email) {
    alert('❌ Tu sesión de verificación expiró. Inicia sesión de nuevo.');
    mostrarPanel('panel-login');
    return;
  }

  fetch('https://service-pro-backend-u3wn.onrender.com/users/verificar-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, codigo })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      mostrarError('codigo-2fa', data.error);
    } else {
      sessionStorage.removeItem('email_2fa_pendiente');
      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
      window.location.href = 'admin.html';
    }
  })
  .catch(err => {
    alert('❌ Error al verificar el código. Intenta nuevamente.');
    console.error(err);
  });
}

// =============================================
// REGISTRO
// =============================================
function registrar() {
  let valido = true;

  ['reg-nombre', 'reg-email', 'reg-password', 'reg-confirm'].forEach(limpiarError);

  const nombre = document.getElementById('reg-nombre')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pass = document.getElementById('reg-password')?.value;
  const confirm = document.getElementById('reg-confirm')?.value;

  if (!nombre || nombre.length < 3) {
    mostrarError('reg-nombre', 'El nombre debe tener al menos 3 caracteres.');
    valido = false;
  }

  if (!email || !emailValido(email)) {
    mostrarError('reg-email', 'Ingresa un correo válido.');
    valido = false;
  }

  if (!pass || pass.length < 6) {
    mostrarError('reg-password', 'La contraseña debe tener al menos 6 caracteres.');
    valido = false;
  }

  if (pass !== confirm) {
    mostrarError('reg-confirm', 'Las contraseñas no coinciden.');
    valido = false;
  }

  if (!valido) return;

  fetch('https://service-pro-backend-u3wn.onrender.com/users/registro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, email, password: pass })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      mostrarError('reg-email', data.error);
    } else {
      alert('✅ Cuenta creada correctamente. Ya puedes iniciar sesión.');
      mostrarPanel('panel-login');
    }
  })
  .catch(err => {
    alert('❌ Error al registrarse. Intenta nuevamente.');
    console.error(err);
  });
}

// =============================================
// RECUPERAR CONTRASEÑA
// =============================================
function recuperarPassword() {
  limpiarError('rec-email');

  const email = document.getElementById('rec-email')?.value.trim();

  if (!email || !emailValido(email)) {
    mostrarError('rec-email', 'Ingresa un correo válido.');
    return;
  }

  fetch('https://service-pro-backend-u3wn.onrender.com/users/recuperar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
  .then(res => res.json())
  .then(data => {
    alert('📧 Si el correo existe, recibirás un enlace para restablecer tu contraseña.');
    mostrarPanel('panel-login');
  })
  .catch(err => {
    alert('❌ Error al enviar. Intenta nuevamente.');
    console.error(err);
  });
}

// =============================================
// CAMBIAR PANEL (login / registro / recuperar)
// =============================================
function mostrarPanel(id) {
  document.querySelectorAll('.auth-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(id);
  if (panel) {
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '16px';
  }
}