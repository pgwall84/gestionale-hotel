// Routes Tariffe derivate (Modulo tariffe derivate, 20/08/2026) — montate
// sotto /api/tariffe (derivazione, trattamento, configurazione-bambini),
// stessa azione permesso 'tariffe' di routes/tariffe.js.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/tariffeDerivateController');

router.use(verificaToken);

router.get('/derivazione',       richiedeAzione('tariffe', 'lettura'),   ctrl.listaDerivazioni);
router.post('/derivazione',      richiedeAzione('tariffe', 'scrittura'), ctrl.creaDerivazione);
router.patch('/derivazione/:id', richiedeAzione('tariffe', 'scrittura'), ctrl.aggiornaDerivazione);
router.delete('/derivazione/:id', richiedeAzione('tariffe', 'scrittura'), ctrl.eliminaDerivazione);

router.get('/trattamento',        richiedeAzione('tariffe', 'lettura'),   ctrl.listaSupplementiTrattamento);
router.post('/trattamento',       richiedeAzione('tariffe', 'scrittura'), ctrl.creaSupplementoTrattamento);
router.delete('/trattamento/:id', richiedeAzione('tariffe', 'scrittura'), ctrl.eliminaSupplementoTrattamento);

router.get('/configurazione-bambini',   richiedeAzione('tariffe', 'lettura'),   ctrl.getConfigurazioneBambini);
router.patch('/configurazione-bambini', richiedeAzione('tariffe', 'scrittura'), ctrl.aggiornaConfigurazioneBambini);

module.exports = router;
