const express = require('express');
const router  = express.Router();
const { verificaToken, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/camereController');

router.use(verificaToken);

router.get('/',        ctrl.lista);          // tutte le camere con stato del giorno
router.get('/oggi',    ctrl.oggi);           // solo camere con arrivo/partenza oggi
router.post('/stato',  soloTitolare, ctrl.aggiornaStato); // aggiorna arrivo/partenza/note (admin/titolare)
router.post('/pronta', ctrl.segnaPronte);                 // marca camera pronta (cameriere)

module.exports = router;
