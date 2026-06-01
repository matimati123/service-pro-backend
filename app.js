require('./db');
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// === SEGURIDAD ===
var helmet = require('helmet');
var cors = require('cors');
var rateLimit = require('express-rate-limit');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var facturasModule = require('./routes/facturas');
var facturasRouter = facturasModule.router;
var ordenesRouter = require('./routes/ordenes');
var mensajesRouter = require('./routes/mensajes');

var app = express();

// =============================================
// HELMET — CSP + todos los headers de seguridad
// Fix: CSP, X-Frame-Options, X-Content-Type-Options,
//      X-Powered-By, Referrer-Policy, HSTS
// =============================================
app.use(helmet({
  // ✅ FIX: Cabecera Content Security Policy (CSP)
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "data:"],
      fontSrc:        ["'self'"],
      connectSrc:     ["'self'", "https://imaginative-gelato-77a91c.netlify.app"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },

  // ✅ FIX: Anti-Clickjacking
  frameguard: { action: 'deny' },

  // ✅ FIX: X-Content-Type-Options (nosniff)
  noSniff: true,

  // ✅ FIX: Ocultar "X-Powered-By: Express"
  hidePoweredBy: true,

  // Referrer seguro
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // ✅ FIX: HSTS activado — fuerza HTTPS en producción
  hsts: {
    maxAge: 31536000,       // 1 año
    includeSubDomains: true,
    preload: true
  },
}));

// =============================================
// CACHE-CONTROL — Fix: Recuperado de Caché +
//                Reexaminar Directivas de Caché
// =============================================
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// =============================================
// CORS — solo permite peticiones desde Netlify
// =============================================
app.use(cors({
  origin: ['https://imaginative-gelato-77a91c.netlify.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// =============================================
// RATE LIMIT — máximo 100 peticiones cada 15 min
// =============================================
var limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intenta más tarde.' }
});

// Rate limit más estricto solo para login (10 intentos por 15 min)
var limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login, espera 15 minutos.' }
});

app.use(limiterGeneral);
app.use('/users/login', limiterLogin);

// =============================================
// MIDDLEWARES ESTÁNDAR
// =============================================
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// =============================================
// RUTAS
// =============================================
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/facturas', facturasRouter);
app.use('/ordenes', ordenesRouter);
app.use('/mensajes', mensajesRouter);

// =============================================
// MANEJO DE ERRORES
// =============================================
app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;