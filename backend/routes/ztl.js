const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { verificaToken, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/ztlController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verificaToken);

router.get('/',                          ctrl.lista);
router.get('/alert',                     ctrl.alert);
router.get('/export',    soloTitolare,   ctrl.esportaVigiPass);
router.post('/import',   soloTitolare,   upload.single('file'), ctrl.importExcel);
router.post('/manuale',                  ctrl.inserisciManuale);
router.patch('/:id/targa',              ctrl.salvaTarga);
router.patch('/:id/invia',          soloTitolare, ctrl.segnaInviata);
router.patch('/:id/non-necessaria',               ctrl.segnaNonNecessaria);
router.delete('/:id',    soloTitolare,   ctrl.elimina);

module.exports = router;
