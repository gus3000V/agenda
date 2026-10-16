const { randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const rateLimit = require('express-rate-limit');

const matches = (a, b) => typeof a === 'string' && typeof b === 'string' && b.length > 0 &&
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

function installSecurity(app) {
  const sessions = new Map();
  const ttl = 8 * 60 * 60 * 1000;
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' }
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.post('/api/auth/login', loginLimiter, (req, res) => {
    if (!process.env.ADMIN_PIN) return res.status(503).json({ error: 'Acceso administrativo no configurado.' });
    if (!matches(req.body?.pin, process.env.ADMIN_PIN)) return res.status(401).json({ error: 'Credencial incorrecta.' });
    const now = Date.now();
    for (const [token, expiry] of sessions) if (expiry <= now) sessions.delete(token);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now + ttl);
    res.json({ token, expiresAt: now + ttl });
  });
  const auth = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || !sessions.has(token) || sessions.get(token) <= Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ error: 'Inicia sesión para acceder a la agenda.' });
    }
    next();
  };
  app.use('/api/admin', auth);
  app.post('/api/auth/logout', auth, (req, res) => {
    sessions.delete(req.headers.authorization.slice(7));
    res.sendStatus(204);
  });
  return auth;
}

module.exports = { installSecurity };
