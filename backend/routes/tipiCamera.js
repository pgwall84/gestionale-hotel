// Routes Tipi Camera (Modulo 2.2, Fase 2A) — /api/tipi-camera.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare.
// Vedi shared/ruoli.js sezione 'tipi_camera' e docs/PRENOTAZIONI_FASE2.md.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/tipiCameraController');

router.use(verificaToken);

router.get('/',       richiedeAzione('tipi_camera', 'lettura'),   ctrl.lista);
router.post('/',      richiedeAzione('tipi_camera', 'scrittura'), ctrl.crea);
router.patch('/:id',  richiedeAzione('tipi_camera', 'scrittura'), ctrl.aggiorna);
router.delete('/:id', richiedeAzione('tipi_camera', 'scrittura'), ctrl.elimina);

module.exports = router;
