const express = require('express');
const router  = express.Router();
const { verificaToken, soloTitolare, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/camereController');

router.use(verificaToken);

router.get('/',        ctrl.lista);          // tutte le camere attive con stato del giorno
router.get('/oggi',    ctrl.oggi);           // solo camere con arrivo/partenza oggi
// aggiorna arrivo/partenza/note — admin/titolare/receptionist/portiere_notte
// (esteso il 31/07/2026, era soloTitolare — shared/ruoli.js sezione 'camere')
router.post('/stato',  richiedeAzione('camere', 'scrittura'), ctrl.aggiornaStato);
// Modulo 5.1 (03/08/2026): prima aperta a qualunque ruolo autenticato, ora
// ristretta su indicazione del titolare — tutti tranne cuoco (shared/ruoli.js
// sezione 'camere'.'pulizia').
router.post('/pronta', richiedeAzione('camere', 'pulizia'), ctrl.segnaPronte);
router.patch('/:id/tipo', soloTitolare, ctrl.aggiornaTipo); // assegna categoria camera (modulo 2.2, admin/titolare)

// Anagrafica camere (Impostazioni▸Camere, 31/07/2026) — admin/titolare
// (shared/ruoli.js sezione 'camere'.'anagrafica', più ristretta di
// 'scrittura' qui sopra: creare/eliminare una camera non è un'operazione
// di reception quotidiana).
router.post('/',          richiedeAzione('camere', 'anagrafica'), ctrl.crea);
router.patch('/:id',      richiedeAzione('camere', 'anagrafica'), ctrl.modifica);
router.patch('/:id/attivo', richiedeAzione('camere', 'anagrafica'), ctrl.attivaDisattiva);

module.exports = router;
