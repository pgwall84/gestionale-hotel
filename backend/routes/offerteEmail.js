// Routes Offerte dedicate via email — /api/offerte-email (modulo 5.3,
// estensione 04/08/2026). Riservato ad admin/titolare (shared/ruoli.js
// sezione 'offerte_email'). NOTA routing: /:id deve stare dopo la '/' per
// evitare ambiguità (stesso pattern di backend/routes/prenotazioni.js).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/offerteEmailController');

router.use(verificaToken);

router.get('/',     richiedeAzione('offerte_email', 'lettura'),   ctrl.lista);
router.get('/:id',  richiedeAzione('offerte_email', 'lettura'),   ctrl.dettaglio);
router.post('/',    richiedeAzione('offerte_email', 'scrittura'), ctrl.crea);

module.exports = router;
