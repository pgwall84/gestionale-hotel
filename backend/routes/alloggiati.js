// Routes Alloggiati Web (Modulo 2.5, Fase 1b) — /api/alloggiati.
// 'sincronizza' più ristretto di 'lettura': tocca le credenziali del
// servizio esterno, è una configurazione, non un'operazione di reception.
// Vedi shared/ruoli.js sezione 'alloggiati'.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/alloggiatiController');

router.use(verificaToken);

router.post('/sincronizza', richiedeAzione('alloggiati', 'sincronizza'), ctrl.sincronizzaTabelle);
router.get('/stato',        richiedeAzione('alloggiati', 'sincronizza'), ctrl.statoSincronizzazione);
router.get('/codici',       richiedeAzione('alloggiati', 'lettura'),     ctrl.listaCodici);

module.exports = router;
