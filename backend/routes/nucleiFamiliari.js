// Routes Nuclei familiari — /api/nuclei-familiari (modulo 5.2 Fase B,
// estensione 04/08/2026). Stessi permessi di 'ospiti' (shared/ruoli.js
// sezione 'nuclei_familiari').

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/nucleiFamiliariController');

router.use(verificaToken);

router.get('/:id',  richiedeAzione('nuclei_familiari', 'lettura'),   ctrl.dettaglio);
router.post('/',    richiedeAzione('nuclei_familiari', 'scrittura'), ctrl.crea);
router.patch('/:id', richiedeAzione('nuclei_familiari', 'scrittura'), ctrl.aggiorna);

module.exports = router;
