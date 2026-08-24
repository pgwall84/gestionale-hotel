// backend/routes/planningTariffe.js
// Routes Planning tariffe giorno-per-giorno (Piano 3, 24/08/2026) —
// /api/planning-tariffe. Stessa sezione permesso 'tariffe' di
// routes/tariffe.js — lettura admin/titolare/receptionist, scrittura
// admin/titolare.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/planningTariffeController');

router.use(verificaToken);

router.get('/griglia', richiedeAzione('tariffe', 'lettura'),   ctrl.griglia);
router.patch('/',      richiedeAzione('tariffe', 'scrittura'), ctrl.aggiorna);

module.exports = router;
