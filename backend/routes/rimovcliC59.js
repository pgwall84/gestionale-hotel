// Routes Export RIMOVCLI/ISTAT C/59 — /api/rimovcli (Modulo 2.6, Fase 1,
// 28/08/2026). Riservato ad admin/titolare (shared/ruoli.js sezione
// 'rimovcli'). Diverso da /api/ross1000 (webservice nazionale, non toccato).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/rimovcliC59Controller');

router.use(verificaToken);

router.get('/export-c59',     richiedeAzione('rimovcli', 'lettura'), ctrl.esporta);
router.get('/export-c59.zip', richiedeAzione('rimovcli', 'lettura'), ctrl.esportaZip);

module.exports = router;
