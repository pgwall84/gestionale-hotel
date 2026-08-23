// Route pubbliche Booking Engine Diretto — /api/booking-pubblico (modulo
// 19/08/2026). NESSUN verificaToken: protette da rate limit dedicato,
// stesso principio di routes/preCheckinPubblico.js.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/bookingPubblicoController');

const bookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste. Riprova tra qualche minuto.' },
});

router.use(bookingRateLimit);

router.get('/disponibilita', ctrl.disponibilita);
router.post('/prenota', ctrl.prenota);
router.get('/termini-cancellazione', ctrl.terminiCancellazione);
router.get('/configurazione', ctrl.configurazione);

module.exports = router;
