// Routes anagrafica ospiti (Fase 2, modulo Prenotazioni) — /api/ospiti.
// Non va confuso con routes/hr.js (sotto-rotta /ospiti = ospiti_giornalieri,
// note cucina, montata su /api/hr/ospiti): dominio diverso.
// Permessi differenziati per azione — vedi shared/ruoli.js sezione 'ospiti'
// e docs/PRENOTAZIONI_FASE2.md Parte A.1.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/anagraficaOspitiController');

router.use(verificaToken);

// CRM ospiti (14/08/2026) — /tag e /duplicati-sospetti DEVONO stare prima
// di /:id: Express valuta le route nell'ordine di dichiarazione, altrimenti
// verrebbero interpretate come richiedeAzione('ospiti','lettura') su un
// id letterale "tag" o "duplicati-sospetti".
router.get('/tag',                  richiedeAzione('ospiti', 'lettura'),         ctrl.tagSuggeriti);
router.get('/duplicati-sospetti',   richiedeAzione('ospiti', 'unisci'),          ctrl.duplicatiSospetti);

router.get('/',                     richiedeAzione('ospiti', 'lettura'),         ctrl.lista);
router.get('/:id',                  richiedeAzione('ospiti', 'lettura'),         ctrl.dettaglio);
router.post('/',                    richiedeAzione('ospiti', 'scrittura'),       ctrl.crea);
router.patch('/:id',                richiedeAzione('ospiti', 'scrittura'),       ctrl.aggiorna);
router.post('/:id/svela-documento', richiedeAzione('ospiti', 'svela_documento'), ctrl.svelaDocumento);
// Nucleo familiare (modulo 5.2 Fase B, 04/08/2026) — collega/scollega un
// cliente esistente, stesso permesso di 'scrittura' su ospiti.
router.post('/:id/nucleo',          richiedeAzione('ospiti', 'scrittura'),       ctrl.impostaNucleo);
// Unione duplicati (14/08/2026) — permesso dedicato più stretto della
// scrittura normale (niente receptionist), vedi shared/ruoli.js.
router.post('/:id/unisci',          richiedeAzione('ospiti', 'unisci'),          ctrl.unisci);

module.exports = router;
