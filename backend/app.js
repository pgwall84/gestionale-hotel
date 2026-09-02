// app.js — configura e restituisce l'istanza Express senza avviare il server.
// Importato da server.js per il deploy e da Supertest per i test API.
// Separare app da listen permette di testare le route senza occupare porte.

require('dotenv').config({ quiet: true });
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
const prenotazioniRoutes = require('./routes/prenotazioni');
const ricercaRoutes      = require('./routes/ricerca'); // CMD+K, 23/08/2026
const soggiorniRoutes    = require('./routes/soggiorni');
const gruppiRoutes       = require('./routes/gruppi');
const tipiCameraRoutes   = require('./routes/tipiCamera');
const tariffeRoutes      = require('./routes/tariffe');
const periodiStagionaliRoutes = require('./routes/periodiStagionali');
const planningTariffeRoutes = require('./routes/planningTariffe');
const tariffeDerivateRoutes = require('./routes/tariffeDerivate');
const pacchettiRoutes    = require('./routes/pacchetti');
const canaliOtaRoutes    = require('./routes/canaliOta');
const beds24Routes       = require('./routes/beds24');
const tassaSoggiornoRoutes = require('./routes/tassaSoggiorno');
const alloggiatiRoutes = require('./routes/alloggiati');
const emailTemplateRoutes = require('./routes/emailTemplate');
const offerteEmailRoutes  = require('./routes/offerteEmail');
const preCheckinRoutes         = require('./routes/preCheckin');
const preCheckinPubblicoRoutes = require('./routes/preCheckinPubblico');
const bookingPubblicoRoutes    = require('./routes/bookingPubblico');
const stripeWebhookRoutes      = require('./routes/stripeWebhook');
const nucleiFamiliariRoutes    = require('./routes/nucleiFamiliari');
const ross1000Routes           = require('./routes/ross1000');
const manutenzioneRoutes       = require('./routes/manutenzione');
const catalogoAddebitiRoutes   = require('./routes/catalogoAddebiti');
const registroHaccpRoutes      = require('./routes/registroHaccp');
const configurazioneHaccpRoutes = require('./routes/configurazioneHaccp');
const { lista: auditLista }            = require('./controllers/auditController');
const { verificaToken, soloTitolare }  = require('./middleware/auth');

const app = express();

// Necessario dietro un reverse proxy (Nginx, in produzione): senza,
// express-rate-limit rifiuta di funzionare quando vede l'header
// X-Forwarded-For che Nginx aggiunge sempre (protezione anti-spoofing
// della libreria) — e comunque, senza, tutte le richieste sembrerebbero
// arrivare dallo stesso IP (quello locale di Nginx), condividendo lo
// stesso limite di tentativi tra utenti diversi. In LAN (nessun Nginx
// davanti) è innocuo: Express usa comunque l'IP diretto del client.
app.set('trust proxy', 1);

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

// Webhook Stripe (Booking Engine Diretto, modulo 19/08/2026) — DEVE stare
// prima di express.json() globale: la route legge il body grezzo
// (express.raw, dentro routes/stripeWebhook.js) per verificare la firma
// della richiesta — un middleware express.json() a monte lo invaliderebbe,
// facendo fallire sempre stripe.webhooks.constructEvent.
app.use('/api/stripe/webhook', stripeWebhookRoutes);

app.use(express.json());

// Rate limit login: max 5 tentativi per IP ogni 15 minuti IN PRODUZIONE.
// Allargato altrove (test e sviluppo locale, 28/08/2026 — segnalato da
// Marco: durante i test manuali il limite stretto si esauriva in fretta,
// non lasciando distinguere un vero problema da un limite troppo basso
// per il lavoro di verifica). Il valore di produzione (5) è quello da
// tenere sotto osservazione una volta in uso reale — vedi
// STATO_PROGETTO.md sezione Rate limit pubblici per il dimensionamento.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 1000,
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
app.use('/api/prenotazioni', prenotazioniRoutes);
app.use('/api/ricerca',      ricercaRoutes); // CMD+K, 23/08/2026
app.use('/api/soggiorni',    soggiorniRoutes);
app.use('/api/gruppi',       gruppiRoutes);
app.use('/api/tipi-camera',  tipiCameraRoutes);
app.use('/api/tariffe',      tariffeRoutes);
app.use('/api/periodi-stagionali', periodiStagionaliRoutes);
app.use('/api/planning-tariffe', planningTariffeRoutes);
app.use('/api/tariffe-derivate', tariffeDerivateRoutes);
app.use('/api/pacchetti',    pacchettiRoutes);
app.use('/api/canali-ota',   canaliOtaRoutes);
app.use('/api/beds24',        beds24Routes);
app.use('/api/tassa-soggiorno', tassaSoggiornoRoutes);
app.use('/api/alloggiati', alloggiatiRoutes);
app.use('/api/email-template', emailTemplateRoutes);
app.use('/api/offerte-email',  offerteEmailRoutes);
app.use('/api/pre-checkin',          preCheckinRoutes);
// Pubblica (nessun verificaToken) — DEVE stare dopo /api/pre-checkin per
// evitare ambiguità di prefisso, anche se i path non si sovrappongono
// (/api/pre-checkin/:id vs /api/pre-checkin-pubblico/:token).
app.use('/api/pre-checkin-pubblico', preCheckinPubblicoRoutes);
// Percorso di TEST isolato per l'integrazione Nexi XPay Build (terminale
// XPay Only 00103562, dominio int-ecommerce.nexi.it — 31/08/2026). require
// dentro la guardia: fuori scope in produzione, dove serve solo il flusso
// reale. Vedi docs/superpowers/specs/2026-08-29-integrazione-nexi-xpay-design.md.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/xpay-test', require('./routes/xpayTest'));
}
// Pubblica (nessun verificaToken), stesso principio di /api/pre-checkin-pubblico
// — Booking Engine Diretto, modulo 19/08/2026.
app.use('/api/booking-pubblico',     bookingPubblicoRoutes);
app.use('/api/nuclei-familiari',     nucleiFamiliariRoutes);
app.use('/api/ross1000',             ross1000Routes);
// '/api/rimovcli' (Statistiche Liguria / RIMOVCLI C59) — attivata il
// 30/08/2026: backend/routes/rimovcliC59.js e le sue dipendenze
// (lib/rimovcliC59.js, lib/rimovcliResidenza.js, controller) sono ora
// committate (merge 82501da).
app.use('/api/rimovcli',             require('./routes/rimovcliC59'));
app.use('/api/manutenzione',         manutenzioneRoutes);
app.use('/api/impostazioni/catalogo-addebiti', catalogoAddebitiRoutes);
app.use('/api/registro-haccp',       registroHaccpRoutes);
app.use('/api/impostazioni/haccp',   configurazioneHaccpRoutes);
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
