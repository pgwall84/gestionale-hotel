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

// Switch temporaneo modalità import (15/08/2026, vedi migration 038 e
// docs/EVOLUTIVE.md) — /configurazione va dichiarata prima di eventuali
// rotte /:id per lo stesso motivo già visto altrove nel progetto (Express
// valuta in ordine di dichiarazione), anche se qui non c'è conflitto reale
// dato che gli /:id sono tutti PATCH/DELETE, non GET — dichiarata comunque
// vicino alle altre rotte "di configurazione" per chiarezza.
router.get('/configurazione',                         ctrl.getConfigurazione);
router.patch('/configurazione',   soloTitolare,        ctrl.impostaConfigurazione);
router.post('/sincronizza-planning', soloTitolare,     ctrl.sincronizzaDaPlanning);
router.patch('/:id/targa',              ctrl.salvaTarga);
router.patch('/:id/invia',          soloTitolare, ctrl.segnaInviata);
router.patch('/:id/non-necessaria',               ctrl.segnaNonNecessaria);
router.delete('/:id',    soloTitolare,   ctrl.elimina);

module.exports = router;
