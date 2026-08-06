// Routes mappatura canali OTA (Modulo 2.3, Fase 1) — /api/canali-ota.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare.
// Vedi shared/ruoli.js sezione 'canali_ota'.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/canaliOtaController');

router.use(verificaToken);

router.get('/',                richiedeAzione('canali_ota', 'lettura'),   ctrl.lista);
router.put('/:tipoCameraId',   richiedeAzione('canali_ota', 'scrittura'), ctrl.upsert);

module.exports = router;
