// Routes Gruppi di prenotazione (Fase 2) — /api/gruppi.
// Include anche i 2 endpoint pagamenti-di-gruppo (Sezione 5 del contratto,
// permessi differenziati sulla sezione 'pagamenti' — portiere_notte escluso).
// Vedi shared/ruoli.js sezioni 'gruppi'/'pagamenti' e
// docs/API_PRENOTAZIONI_FASE2.md Sezione 6.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const gruppiCtrl = require('../controllers/gruppiController');
const pagamentiCtrl = require('../controllers/pagamentiController');

router.use(verificaToken);

router.get('/:id',            richiedeAzione('gruppi', 'lettura'),      gruppiCtrl.dettaglio);
router.post('/',              richiedeAzione('gruppi', 'scrittura'),    gruppiCtrl.crea);
router.patch('/:id',          richiedeAzione('gruppi', 'scrittura'),    gruppiCtrl.aggiorna);
router.get('/:id/pagamenti',  richiedeAzione('pagamenti', 'lettura'),   pagamentiCtrl.listaPerGruppo);
router.post('/:id/pagamenti', richiedeAzione('pagamenti', 'scrittura'), pagamentiCtrl.creaPerGruppo);

module.exports = router;
