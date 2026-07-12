const express = require('express');
const router = express.Router();
const { verificaToken, soloTitolare } = require('../middleware/auth');
const dashboardCtrl = require('../controllers/dashboardController');

router.get('/alert', verificaToken, dashboardCtrl.alert);
router.get('/kpi', verificaToken, dashboardCtrl.kpi);
router.post('/incassi', verificaToken, soloTitolare, dashboardCtrl.registraIncasso);

module.exports = router;
