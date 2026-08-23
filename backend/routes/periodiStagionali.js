// Routes Periodi stagionali (Modulo tariffe derivate, 20/08/2026) —
// /api/periodi-stagionali. Stessa azione permesso 'tariffe' di
// routes/tariffe.js — vedi controller per il perché.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/periodiStagionaliController');

router.use(verificaToken);

router.get('/',       richiedeAzione('tariffe', 'lettura'),   ctrl.lista);
router.post('/',      richiedeAzione('tariffe', 'scrittura'), ctrl.crea);
router.patch('/:id',  richiedeAzione('tariffe', 'scrittura'), ctrl.aggiorna);
router.delete('/:id', richiedeAzione('tariffe', 'scrittura'), ctrl.elimina);

module.exports = router;
