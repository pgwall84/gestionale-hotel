// Route pubbliche Booking Engine Diretto — /api/booking-pubblico (modulo
// 19/08/2026). NESSUN verificaToken: protette da rate limit dedicato,
// stesso principio di routes/preCheckinPubblico.js.

const express = require('express');
const router = express.Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/bookingPubblicoController');
const ctrlPagamentoNexi = require('../controllers/bookingPagamentoNexiController');

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

// BUGFIX/redesign (16/09/2026): un unico bucket da 30/15min copriva sia
// le chiamate di sola lettura (disponibilita, disponibilita-mese,
// configurazione, termini-cancellazione — invocate ad ogni cambio di
// data/camera nel widget) sia le azioni sensibili (prenota,
// completa-pagamento-nexi) — un ospite che si limita a guardare il
// calendario può esaurire la quota prima di arrivare a pagare, l'esatto
// opposto dello scopo del rate limit. Separato in due bucket: "lettura"
// (permissivo) e "scrittura" (stretto, resta l'unico traffico che vale
// davvero la pena limitare: crea hold reali e muove pagamenti). Entrambi
// loggano quando bloccano davvero una richiesta — prima non c'era nessuna
// visibilità lato server, quindi "tarare il valore sul traffico reale"
// (STATO_PROGETTO.md, Rate limit pubblici) era impossibile per
// definizione. Valore di "lettura" (120) è una stima ragionata, non
// misurata — da rivedere con i primi log reali.
const bookingLetturaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[rate-limit] booking lettura bloccato — IP ${req.ip}, path ${req.path}, ${new Date().toISOString()}`);
    res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  },
});

const bookingScritturaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[rate-limit] booking scrittura bloccato — IP ${req.ip}, path ${req.path}, ${new Date().toISOString()}`);
    res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  },
});

router.get('/disponibilita', bookingLetturaRateLimit, ctrl.disponibilita);
router.get('/disponibilita-mese', bookingLetturaRateLimit, ctrl.disponibilitaMese);
router.post('/prenota', bookingScritturaRateLimit, ctrl.prenota);
router.get('/termini-cancellazione', bookingLetturaRateLimit, ctrl.terminiCancellazione);
router.get('/configurazione', bookingLetturaRateLimit, ctrl.configurazione);
router.post('/completa-pagamento-nexi', bookingScritturaRateLimit, ctrlPagamentoNexi.completaPagamentoNexi);

module.exports = router;
