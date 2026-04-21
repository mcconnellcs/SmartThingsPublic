function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  const isApi = req.originalUrl.startsWith('/api/');
  if (!isApi && req.accepts('html')) {
    return res.redirect('/login.html');
  }
  return res.status(401).json({ error: 'authentication required' });
}

module.exports = { requireAuth };
