require('./db');
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var jwt = require('jsonwebtoken');

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

var db = require('./db');
var app = express();

// =============================================
// HELMET
// =============================================
app.use(helmet({
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
  frameguard: { action: 'deny' },
  noSniff: true,
  hidePoweredBy: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
}));

// =============================================
// CACHE-CONTROL
// =============================================
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// =============================================
// CORS
// =============================================
app.use(cors({
  origin: ['https://imaginative-gelato-77a91c.netlify.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// =============================================
// RATE LIMIT
// =============================================
var limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intenta más tarde.' }
});

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

// =============================================
// SESSION Y PASSPORT
// =============================================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// =============================================
// GOOGLE OAUTH STRATEGY
// =============================================
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const nombre = profile.displayName;

    // Buscar si el usuario ya existe en la BD
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
      if (err) return done(err);

      if (results.length > 0) {
        // Usuario ya existe → retornarlo
        return done(null, results[0]);
      } else {
        // Usuario nuevo → crearlo
        db.query(
          'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
          [nombre, email, 'google_oauth', 'cliente'],
          (err2, result) => {
            if (err2) return done(err2);
            db.query('SELECT * FROM usuarios WHERE id = ?', [result.insertId], (err3, rows) => {
              if (err3) return done(err3);
              return done(null, rows[0]);
            });
          }
        );
      }
    });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.query('SELECT * FROM usuarios WHERE id = ?', [id], (err, results) => {
    done(err, results[0]);
  });
});

// =============================================
// RUTAS GOOGLE OAUTH
// =============================================
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: process.env.FRONTEND_URL + '/login.html' }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, rol: req.user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.redirect(`${process.env.FRONTEND_URL}/oauth-callback.html?token=${token}`);
  }
);

// =============================================
// VIEW ENGINE
// =============================================
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