// Routes anagrafica ospiti (Fase 2, modulo Prenotazioni) — /api/ospiti.
// Non va confuso con routes/hr.js (sotto-rotta /ospiti = ospiti_giornalieri,
// note cucina, montata su /api/hr/ospiti): dominio diverso.
// Permessi differenziati per azione — vedi shared/ruoli.js sezione 'ospiti'
// e docs/API_PRENOTAZIONI_FASE2.md Sezione 1.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/anagraficaOspitiController');

router.use(verificaToken);

router.get('/',                     richiedeAzione('ospiti', 'lettura'),         ctrl.lista);
router.get('/:id',                  richiedeAzione('ospiti', 'lettura'),         ctrl.dettaglio);
router.post('/',                    richiedeAzione('ospiti', 'scrittura'),       ctrl.crea);
router.patch('/:id',                richiedeAzione('ospiti', 'scrittura'),       ctrl.aggiorna);
router.post('/:id/svela-documento', richiedeAzione('ospiti', 'svela_documento'), ctrl.svelaDocumento);

module.exports = router;
