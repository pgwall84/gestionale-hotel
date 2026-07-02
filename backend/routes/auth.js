const express = require('express');
const router  = express.Router();
const { login, profilo, refresh, logout, logoutAll } = require('../controllers/authController');
const { verificaToken } = require('../middleware/auth');

router.post('/login',      login);
router.get('/me',          verificaToken, profilo);
router.post('/refresh',    refresh);
router.post('/logout',     verificaToken, logout);
router.post('/logout-all', verificaToken, logoutAll);

module.exports = router;
