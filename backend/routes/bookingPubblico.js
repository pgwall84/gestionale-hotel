// Route pubbliche Booking Engine Diretto — /api/booking-pubblico (modulo
// 19/08/2026). NESSUN verificaToken: protette da rate limit dedicato,
// stesso principio di routes/preCheckinPubblico.js.

const express = require('express');
const router = express.Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/bookingPubblicoController');

// CORS dedicato — audit mini-sicurezza pre-deploy 23/08/2026. Il CORS
// globale di app.js consente una sola origine (FRONTEND_URL, il gestionale
// stesso) perché protegge route autenticate con cookie/credentials. Queste
// route pubbliche vengono invece chiamate da sito-hotel, un'origine
// DIVERSA (dominio del sito, non del gestionale) — senza questo middleware
// dedicato il browser blocca la risposta in produzione (stesso sintomo già
// visto con la CSP del sito: nessun errore visibile, solo "Failed to
// fetch"). Nessun cookie/credenziale qui: sono route pubbliche, non serve
// credentials:true. SITO_HOTEL_ORIGINS: lista separata da virgole, per
// coprire sia il dominio provvisorio Vercel sia quello finale una volta
// collegato (vedi backend/.env.example).
const originiSitoConsentite = (process.env.SITO_HOTEL_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

router.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? originiSitoConsentite
    : true,
}));

// Max 30 richieste per IP ogni 15 minuti IN PRODUZIONE. Allargato altrove
// (test e sviluppo locale, 28/08/2026 — stesso principio applicato agli
// altri due rate limit pubblici, login in app.js e pre-checkin in
// preCheckinPubblico.js, per lo stesso motivo: i test manuali esaurivano
// in fretta una quota pensata per il traffico reale). Il valore di
// produzione (30) resta da verificare sul campo — vedi STATO_PROGETTO.md
// sezione Rate limit pubblici.
const bookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste. Riprova tra qualche minuto.' },
});

router.use(bookingRateLimit);

router.get('/disponibilita', ctrl.disponibilita);
router.get('/disponibilita-mese', ctrl.disponibilitaMese);
router.post('/prenota', ctrl.prenota);
router.get('/termini-cancellazione', ctrl.terminiCancellazione);
router.get('/configurazione', ctrl.configurazione);

module.exports = router;
