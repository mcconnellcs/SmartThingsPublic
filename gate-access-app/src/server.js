const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const { requireAuth } = require('./lib/auth');
const authRoutes = require('./routes/auth');
const residentsRoutes = require('./routes/residents');
const pinsRoutes = require('./routes/pins');
const logsRoutes = require('./routes/logs');
const gateRoutes = require('./routes/gate');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Gate hardware endpoint — uses its own token, not the admin session.
app.use('/api/gate', gateRoutes);

// Admin API + session auth.
app.use('/api/auth', authRoutes);
app.use('/api/residents', requireAuth, residentsRoutes);
app.use('/api/pins', requireAuth, pinsRoutes);
app.use('/api/logs', requireAuth, logsRoutes);

// Static assets — login page is public, everything else requires auth.
const publicDir = path.join(__dirname, '..', 'public');
app.get('/login.html', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(publicDir, 'styles.css')));
app.get('/login.js', (req, res) => res.sendFile(path.join(publicDir, 'login.js')));

app.use(requireAuth, express.static(publicDir));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`Gate access app listening on http://localhost:${PORT}`);
});
