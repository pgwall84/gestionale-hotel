// Routes Tariffe (Modulo 2.2, Fase 2A) — /api/tariffe.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare.
// NOTA routing: /calcola deve stare PRIMA di /:id, stesso motivo di /griglia
// in routes/prenotazioni.js (altrimenti Express interpreta "calcola" come id).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/tariffeController');

router.use(verificaToken);

router.get('/calcola', richiedeAzione('tariffe', 'lettura'),   ctrl.calcola);
router.get('/',        richiedeAzione('tariffe', 'lettura'),   ctrl.lista);
router.post('/',       richiedeAzione('tariffe', 'scrittura'), ctrl.crea);
router.patch('/:id',   richiedeAzione('tariffe', 'scrittura'), ctrl.aggiorna);
router.delete('/:id',  richiedeAzione('tariffe', 'scrittura'), ctrl.elimina);

module.exports = router;
