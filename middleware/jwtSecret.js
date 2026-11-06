// =============================================
// VOLTIA PRO SPA — middleware/jwtSecret.js
// Secreto con el que se firman las sesiones (JWT). Siempre viene de la variable JWT_SECRET.
// Si falta, el servidor NO arranca: antes caía en una clave pública escrita en el código,
// con la que cualquiera podría fabricarse una sesión de administrador.
// =============================================
function leerSecreto() {
  const s = process.env.JWT_SECRET;
  if (s) {
    if (s.length < 16) console.warn('Aviso: JWT_SECRET es corto (menos de 16 caracteres). Conviene cambiarlo por uno largo y aleatorio.');
    return s;
  }
  // Solo para las pruebas automáticas (`node --test` marca sus procesos con NODE_TEST_CONTEXT)
  if (process.env.NODE_TEST_CONTEXT) return 'servicepro_secret_2024';
  throw new Error('Falta JWT_SECRET. Defínela en las variables de entorno antes de iniciar el servidor.');
}

module.exports = leerSecreto();
module.exports.leerSecreto = leerSecreto;
