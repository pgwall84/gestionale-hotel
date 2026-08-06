// Routes Export ROSS1000/ISTAT — /api/ross1000 (modulo 2.6, Fase 1,
// 04/08/2026). Riservato ad admin/titolare (shared/ruoli.js sezione 'ross1000').

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/ross1000Controller');

router.use(verificaToken);

router.get('/export', richiedeAzione('ross1000', 'lettura'), ctrl.esporta);

module.exports = router;
