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

const preCheckinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste. Riprova tra qualche minuto.' },
});

router.use(preCheckinRateLimit);

// Suggerimenti cittadinanza/tipo documento per il form pubblico (04/08/2026,
// segnalato dal titolare) — riusa lo stesso controller di
// backend/routes/alloggiati.js (GET /api/alloggiati/codici): la funzione
// non tocca mai req.utente, i dati sono le tabelle ufficiali di codifica,
// non informazioni personali — nessun rischio a esporli senza login.
// DEVE stare prima di /:token per non essere interpretata come un token.
router.get('/codici', listaCodici);

router.get('/:token',  ctrl.dettaglio);
router.post('/:token', ctrl.invia);

module.exports = router;
