const express  = require('express');
const passport = require('passport');
const router   = express.Router();

// ─── GET /auth/login ──────────────────────────────────────
// Redirects to Discord OAuth
router.get('/login', (req, res, next) => {
  // If already logged in just go home
  if (req.isAuthenticated()) return res.redirect('/servers');
  passport.authenticate('discord')(req, res, next);
});

// ─── GET /auth/callback ───────────────────────────────────
// Discord redirects back here after the user authorises
router.get('/callback',
  passport.authenticate('discord', {
    failureRedirect: '/',
    failureFlash:    'Authentication failed. Please try again.',
  }),
  (req, res) => {
    // Successful login
    console.log(`[Auth] User logged in: ${req.user.username}#${req.user.discriminator}`);

    // Redirect to the page they were trying to reach, or /servers
    const returnTo = req.session.returnTo ?? '/servers';
    delete req.session.returnTo;

    res.redirect(returnTo);
  },
);

// ─── GET /auth/logout ─────────────────────────────────────
router.get('/logout', (req, res, next) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  const username = req.user?.username ?? 'Unknown';

  req.logout(err => {
    if (err) return next(err);

    req.session.destroy(err => {
      if (err) console.error('[Auth] Session destroy error:', err);
      console.log(`[Auth] User logged out: ${username}`);
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

// ─── Middleware: save return URL ──────────────────────────
// Call this before requireAuth redirects so we can bounce
// the user back to where they wanted to go after login
router.use((req, res, next) => {
  if (!req.isAuthenticated() && req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  next();
});

module.exports = router;