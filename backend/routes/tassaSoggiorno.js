// Routes tassa di soggiorno (Modulo 2.4, Fase 2A) — /api/tassa-soggiorno.
// Permessi differenziati per azione (sezione 'tassa_soggiorno' in
// shared/ruoli.js): 'configurazione' più ristretta di 'lettura'/'scrittura'
// perché cambiare l'aliquota è una decisione, non un'operazione di reception.
// Route non ancora montata in server.js (step successivo).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/tassaSoggiornoController');

router.use(verificaToken);

router.get('/configurazione',            richiedeAzione('tassa_soggiorno', 'configurazione'), ctrl.listaConfigurazione);
router.post('/configurazione',           richiedeAzione('tassa_soggiorno', 'configurazione'), ctrl.creaConfigurazione);
router.get('/calcolo/:soggiorno_id',     richiedeAzione('tassa_soggiorno', 'lettura'),         ctrl.calcola);
router.post('/:soggiorno_id/riscuoti',   richiedeAzione('tassa_soggiorno', 'scrittura'),       ctrl.riscuoti);
router.get('/report',                    richiedeAzione('tassa_soggiorno', 'lettura'),         ctrl.report);
router.get('/report/export',             richiedeAzione('tassa_soggiorno', 'lettura'),         ctrl.esportaExcel);

module.exports = router;
