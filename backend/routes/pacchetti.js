// Routes Pacchetti (Modulo 2.2, Fase 2A) — /api/pacchetti.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare.
// Nessuna DELETE: la disattivazione si fa con PATCH { attivo: false }.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/pacchettiController');

router.use(verificaToken);

router.get('/',      richiedeAzione('pacchetti', 'lettura'),   ctrl.lista);
router.post('/',     richiedeAzione('pacchetti', 'scrittura'), ctrl.crea);
router.patch('/:id', richiedeAzione('pacchetti', 'scrittura'), ctrl.aggiorna);

module.exports = router;
