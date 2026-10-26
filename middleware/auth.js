const jwt = require('jsonwebtoken');

// Mismo secreto que usa routes/users.js al firmar el token
const JWT_SECRET = process.env.JWT_SECRET || 'servicepro_secret_2024';

function leerToken(req) {
  const header = req.headers['authorization'] || '';
  const [tipo, token] = header.split(' ');
  return tipo === 'Bearer' && token ? token : null;
}

// Exige token válido. Deja el usuario en req.user
function verificarToken(req, res, next) {
  const token = leerToken(req);
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

// Si hay token válido lo lee; si no, sigue sin usuario (no bloquea)
function tokenOpcional(req, res, next) {
  const token = leerToken(req);
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (err) { /* se ignora */ }
  }
  next();
}

// Debe ir DESPUÉS de verificarToken: deja pasar solo al administrador
function soloAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto.' });
  }
  next();
}

module.exports = { verificarToken, tokenOpcional, soloAdmin };