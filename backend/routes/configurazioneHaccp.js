// Route Impostazioni HACCP — anagrafica apparecchiature + on/off moduli.
// Modulo 6.1, ricostruzione 16/08/2026. Anagrafica e modifica moduli riservate
// ad admin/titolare (soloTitolare), stesso livello delle altre pagine
// /impostazioni/*.
//
// GET /moduli fa eccezione (sessione 2, 16/08/2026): deve poterlo leggere
// chiunque abbia accesso alla sezione haccp, non solo il titolare — serve al
// personale in /registro-haccp per sapere se mostrare il tab A.4 buffet
// (nascosto se il modulo è spento), non solo a chi lo configura.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeSezione, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/configurazioneHaccpController');

router.use(verificaToken);

router.get('/apparecchiature',        soloTitolare,              ctrl.listaApparecchiature);
router.post('/apparecchiature',       soloTitolare,              ctrl.creaApparecchiatura);
router.put('/apparecchiature/:id',    soloTitolare,              ctrl.modificaApparecchiatura);

router.get('/moduli',                 richiedeSezione('haccp'), ctrl.listaModuli);
router.put('/moduli/:modulo',         soloTitolare,              ctrl.modificaModulo);

module.exports = router;
