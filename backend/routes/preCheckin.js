// Routes Pre check-in — lato reception, /api/pre-checkin (modulo 5.2 Fase B,
// 04/08/2026). Riservato ad admin/titolare/receptionist (shared/ruoli.js
// sezione 'pre_checkin'). Non va confuso con
// backend/routes/preCheckinPubblico.js (nessuna autenticazione, /:token).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/preCheckinController');

router.use(verificaToken);

router.get('/',              richiedeAzione('pre_checkin', 'lettura'),   ctrl.lista);
router.get('/:id',           richiedeAzione('pre_checkin', 'lettura'),   ctrl.dettaglio);
router.post('/:id/applica',  richiedeAzione('pre_checkin', 'scrittura'), ctrl.applica);
router.post('/:id/scarta',   richiedeAzione('pre_checkin', 'scrittura'), ctrl.scarta);

module.exports = router;
