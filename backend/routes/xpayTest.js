// routes/xpayTest.js — /api/xpay-test, percorso di test isolato per Nexi
// XPay Build (nonce + pagaNonce). NESSUN verificaToken: pagina pubblica
// non linkata (app/[locale]/xpay-test in sito-hotel), stesso principio di
// bookingPubblico.js/preCheckinPubblico.js — protetta da rate limit
// dedicato invece che da autenticazione, e chiamata da un'origine diversa
// (sito-hotel) quindi CORS dedicato come le altre route pubbliche.

const express = require('express');
const router = express.Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/xpayTestController');

const originiSitoConsentite = (process.env.SITO_HOTEL_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

router.use(cors({
  origin: process.env.NODE_ENV === 'production' ? originiSitoConsentite : true,
}));

const xpayTestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppe richieste. Riprova tra qualche minuto.' },
});
router.use(xpayTestRateLimit);

router.post('/prepara', ctrl.prepara);
router.post('/paga-nonce', ctrl.pagaNonce);

module.exports = router;
