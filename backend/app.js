// app.js — configura e restituisce l'istanza Express senza avviare il server.
// Importato da server.js per il deploy e da Supertest per i test API.
// Separare app da listen permette di testare le route senza occupare porte.

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes      = require('./routes/auth');
const usersRoutes     = require('./routes/users');
const hrRoutes        = require('./routes/hr');
const camereRoutes    = require('./routes/camere');
const ztlRoutes       = require('./routes/ztl');
const menuRoutes      = require('./routes/menu');
const dashboardRoutes    = require('./routes/dashboard');
const ristoranteRoutes   = require('./routes/ristorante');
const magazzinoRoutes    = require('./routes/magazzino');
const archivioRoutes     = require('./routes/archivio');
const ospitiRoutes       = require('./routes/ospiti');
const { lista: auditLista }            = require('./controllers/auditController');
const { verificaToken, soloTitolare }  = require('./middleware/auth');

const app = express();

// ─── Middleware globali ───────────────────────────────────────────────────────

// Helmet imposta già di default CSP, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy — stesso standard applicato esplicitamente in sito-hotel/next.config.ts.
// Unica differenza esplicitata qui: HSTS a 2 anni + preload (default Helmet: 180 giorni),
// per allinearsi al valore già in produzione sul sito.
app.use(helmet({
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}));
app.use(cookieParser());

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : true,
  credentials: true,
}));

app.use(express.json());

// Rate limit login: max 5 tentativi per IP ogni 15 minuti.
// In ambiente test viene disabilitato impostando NODE_ENV=test.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
  skipSuccessfulRequests: true,
});

// ─── Route ───────────────────────────────────────────────────────────────────

app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth',      authRoutes);
app.use('/api/users',     usersRoutes);
app.use('/api/hr',        hrRoutes);
app.use('/api/camere',    camereRoutes);
app.use('/api/ztl',       ztlRoutes);
app.use('/api/menu',      menuRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/ristorante', ristoranteRoutes);
app.use('/api/magazzino', magazzinoRoutes);
app.use('/api/archivio', archivioRoutes);
app.use('/api/ospiti',   ospitiRoutes);
app.get('/api/audit', verificaToken, soloTitolare, auditLista);

app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// Health check — utile anche nei test per verificare che l'app sia pronta
app.get('/api/health', (req, res) => {
  res.json({ stato: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ errore: `Route non trovata: ${req.method} ${req.path}` });
});

// Errori non gestiti
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  res.status(500).json({ errore: 'Errore interno del server.' });
});

module.exports = app;
