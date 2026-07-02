const express = require('express');
const router = express.Router();
const { verificaToken } = require('../middleware/auth');
const dashboardCtrl = require('../controllers/dashboardController');

router.get('/alert', verificaToken, dashboardCtrl.alert);

module.exports = router;
