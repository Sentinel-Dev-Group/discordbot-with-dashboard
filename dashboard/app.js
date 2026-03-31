const express        = require('express');
const expressLayouts = require('express-ejs-layouts');
const session        = require('express-session');
const passport       = require('passport');
const { Strategy }   = require('passport-discord');
const flash          = require('connect-flash');
const morgan         = require('morgan');
const path           = require('path');
require('dotenv').config();

// ─── Express app ──────────────────────────────────────────
const app = express();

// ─── View engine ──────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// ─── Static files ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Body parsing ─────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('trust proxy', 1);

// ─── HTTP logging ─────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─── Sessions ─────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
cookie: {
    secure:   false,
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 24 * 7,
  },
}));

// ─── Flash messages ───────────────────────────────────────
app.use(flash());

// ─── Passport ─────────────────────────────────────────────
passport.use(new Strategy(
  {
    clientID:     process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL:  process.env.CALLBACK_URL,
    scope:        ['identify', 'guilds'],
  },
  (accessToken, refreshToken, profile, done) => {
    profile.accessToken  = accessToken;
    profile.refreshToken = refreshToken;
    return done(null, profile);
  },
));

passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ─── Global template locals ───────────────────────────────
app.use((req, res, next) => {
  res.locals.user          = req.user   ?? null;
  res.locals.success       = req.flash('success');
  res.locals.error         = req.flash('error');
  res.locals.dashboardUrl  = process.env.DASHBOARD_URL;
  next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/',          require('./routes/index'));
app.use('/auth',      require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));

// ─── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    title:   '404 — Page not found',
    message: 'The page you are looking for does not exist.',
    code:    404,
  });
});

// ─── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Dashboard] Unhandled error:', err);
  res.status(500).render('error', {
    title:   '500 — Server error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again later.'
      : err.message,
    code: 500,
  });
});

// ─── Start server ─────────────────────────────────────────
const PORT = process.env.DASHBOARD_PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Dashboard] Running on port ${PORT}`);
  console.log(`[Dashboard] URL: ${process.env.DASHBOARD_URL}`);
});

module.exports = app;