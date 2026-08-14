const express = require('express');
const router = express.Router();
const { verificaToken, soloTitolare } = require('../middleware/auth');
const dashboardCtrl = require('../controllers/dashboardController');

router.get('/alert', verificaToken, dashboardCtrl.alert);
router.get('/kpi', verificaToken, dashboardCtrl.kpi);
router.get('/gruppi', verificaToken, dashboardCtrl.gruppiWidget);
router.post('/incassi', verificaToken, soloTitolare, dashboardCtrl.registraIncasso);
router.get('/incassi/suggerimento', verificaToken, soloTitolare, dashboardCtrl.suggerimentoIncasso);

module.exports = router;
