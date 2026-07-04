const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool    = require('../config/db');
const { logAudit } = require('./auditController');

const REFRESH_EXPIRES_DAYS = 30;

function generaRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function salvaRefreshToken(userId, rawToken) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt]
  );
  return { hash, expiresAt };
}

function setRefreshCookie(res, rawToken, expiresAt) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refresh_token', rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    expires: expiresAt,
    path: '/api/auth',
  });
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ errore: 'Email e password sono obbligatorie.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND attivo = true',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ errore: 'Credenziali non valide.' });
    }

    const utente = result.rows[0];
    const passwordCorretta = await bcrypt.compare(password, utente.password_hash);

    if (!passwordCorretta) {
      await logAudit(utente.id, 'login_fallito', 'users', utente.id, req, { email: utente.email });
      return res.status(401).json({ errore: 'Credenziali non valide.' });
    }

    const payload = { id: utente.id, nome: utente.nome, cognome: utente.cognome, ruolo: utente.ruolo };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    const rawRefresh = generaRefreshToken();
    const { expiresAt } = await salvaRefreshToken(utente.id, rawRefresh);
    setRefreshCookie(res, rawRefresh, expiresAt);

    await logAudit(utente.id, 'login', 'users', utente.id, req, { email: utente.email, ruolo: utente.ruolo });

    res.json({
      token,
      utente: { id: utente.id, nome: utente.nome, cognome: utente.cognome, email: utente.email, ruolo: utente.ruolo },
    });

  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/auth/me
async function profilo(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, nome, cognome, email, ruolo, created_at FROM users WHERE id = $1 AND attivo = true',
      [req.utente.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Utente non trovato o disattivato.' });
    }
    res.json({ utente: result.rows[0] });
  } catch (err) {
    console.error('Errore profilo:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/auth/refresh — emette nuovo access token usando refresh token dal cookie
async function refresh(req, res) {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ errore: 'Refresh token mancante.' });

  try {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const r = await pool.query(
      `SELECT rt.*, u.nome, u.cognome, u.ruolo, u.attivo
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
      [hash]
    );

    if (!r.rows.length) return res.status(401).json({ errore: 'Refresh token non valido o scaduto.' });

    const row = r.rows[0];
    if (!row.attivo) return res.status(403).json({ errore: 'Utente disattivato.' });

    const payload = { id: row.user_id, nome: row.nome, cognome: row.cognome, ruolo: row.ruolo };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    // Ruota il refresh token (revoca vecchio, emette nuovo)
    await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]);
    const newRaw = generaRefreshToken();
    const { expiresAt } = await salvaRefreshToken(row.user_id, newRaw);
    setRefreshCookie(res, newRaw, expiresAt);

    res.json({ token });
  } catch (err) {
    console.error('Errore refresh:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/auth/logout — revoca il refresh token corrente
async function logout(req, res) {
  const rawToken = req.cookies?.refresh_token;
  if (rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]).catch(() => {});
  }
  res.clearCookie('refresh_token', { path: '/api/auth' });
  if (req.utente) await logAudit(req.utente.id, 'logout', 'users', req.utente.id, req, null);
  res.json({ messaggio: 'Logout effettuato.' });
}

// POST /api/auth/logout-all — revoca tutti i refresh token dell'utente (tutti i dispositivi)
async function logoutAll(req, res) {
  try {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [req.utente.id]
    );
    res.clearCookie('refresh_token', { path: '/api/auth' });
    await logAudit(req.utente.id, 'logout_all', 'users', req.utente.id, req, null);
    res.json({ messaggio: 'Disconnesso da tutti i dispositivi.' });
  } catch (err) {
    console.error('Errore logout-all:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { login, profilo, refresh, logout, logoutAll };
