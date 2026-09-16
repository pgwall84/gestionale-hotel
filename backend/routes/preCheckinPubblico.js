// Routes pubbliche Pre check-in — /api/pre-checkin-pubblico (modulo 5.2
// Fase B, 04/08/2026). NESSUN verificaToken: protetto solo dal token nel
// link e da un rate limit dedicato (endpoint esposto a internet dopo il
// deploy — stesso principio del rate limit sul login in backend/app.js,
// ma qui per IP invece che per credenziali).

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/preCheckinPubblicoController');
const { listaCodici } = require('../controllers/alloggiatiController');

// BUGFIX/redesign (16/09/2026): un unico bucket da 30/15min copriva sia
// GET /codici (chiamata ad ogni digitazione nei campi con suggerimenti)
// sia POST /:token (l'invio vero) — il commento originale già segnalava
// che questo aveva causato un problema reale il 28/08 (bastano pochi
// minuti di digitazione per esaurire la quota prima di arrivare
// all'invio). Separato in due bucket: "lettura" (permissivo, sola
// lettura — /codici e il GET del dettaglio) e "scrittura" (stretto, resta
// l'unica azione che vale davvero la pena limitare). Entrambi loggano
// quando bloccano davvero una richiesta — prima non c'era nessuna
// visibilità lato server, quindi "tarare il valore sul traffico reale"
// (STATO_PROGETTO.md, Rate limit pubblici) era impossibile per
// definizione. Valore di "lettura" (120) è una stima ragionata, non
// misurata — da rivedere con i primi log reali.
const preCheckinLetturaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[rate-limit] pre-checkin lettura bloccato — IP ${req.ip}, path ${req.path}, ${new Date().toISOString()}`);
    res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  },
});

const preCheckinScritturaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[rate-limit] pre-checkin invio bloccato — IP ${req.ip}, ${new Date().toISOString()}`);
    res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  },
});

// Suggerimenti cittadinanza/tipo documento per il form pubblico (04/08/2026,
// segnalato dal titolare) — riusa lo stesso controller di
// backend/routes/alloggiati.js (GET /api/alloggiati/codici): la funzione
// non tocca mai req.utente, i dati sono le tabelle ufficiali di codifica,
// non informazioni personali — nessun rischio a esporli senza login.
// DEVE stare prima di /:token per non essere interpretata come un token.
router.get('/codici', preCheckinLetturaRateLimit, listaCodici);

router.get('/:token',  preCheckinLetturaRateLimit, ctrl.dettaglio);
router.post('/:token', preCheckinScritturaRateLimit, ctrl.invia);

module.exports = router;
