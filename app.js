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
// HELMET — protege headers HTTP automáticamente
// =============================================
app.use(helmet());

// =============================================
// CORS — solo permite peticiones desde tu frontend
// Cambia la URL cuando tengas dominio real
// =============================================
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// =============================================
// RATE LIMIT — máximo 100 peticiones cada 15 min
// Protege contra fuerza bruta y spam
// =============================================
var limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
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