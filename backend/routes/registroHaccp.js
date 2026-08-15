// Route registro HACCP — temperature e scongelamento/cottura (modulo 6.1,
// punti 1+2, 15/08/2026). Stesso schema di permessi già in uso per la
// checklist pulizie in routes/hr.js: richiedeSezione('haccp') per lettura/
// scrittura quotidiana (admin/titolare/cuoco), soloTitolare per lo storico
// consultabile in ispezione — coerente col resto del modulo HACCP, non una
// scelta nuova.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeSezione, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/registroHaccpController');
const exportCtrl = require('../controllers/esportazioneHaccpController');

router.use(verificaToken);

router.get('/apparecchiature',       richiedeSezione('haccp'), ctrl.apparecchiatureAttive);

router.get('/temperature',           richiedeSezione('haccp'), ctrl.listaTemperature);
router.post('/temperature',          richiedeSezione('haccp'), ctrl.creaTemperatura);
router.delete('/temperature/:id',    richiedeSezione('haccp'), ctrl.eliminaTemperatura);
router.get('/temperature/storico',   soloTitolare,              ctrl.storicoTemperature);

router.get('/cottura',               richiedeSezione('haccp'), ctrl.listaCottura);
router.post('/cottura',              richiedeSezione('haccp'), ctrl.creaCottura);
router.delete('/cottura/:id',        richiedeSezione('haccp'), ctrl.eliminaCottura);
router.get('/cottura/storico',       soloTitolare,              ctrl.storicoCottura);

// A.1 ricevimento merci + A.4 buffet (sessione 2, 16/08/2026)
router.get('/ricevimento',           richiedeSezione('haccp'), ctrl.listaRicevimento);
router.post('/ricevimento',          richiedeSezione('haccp'), ctrl.creaRicevimento);
router.delete('/ricevimento/:id',    richiedeSezione('haccp'), ctrl.eliminaRicevimento);
router.get('/ricevimento/storico',   soloTitolare,              ctrl.storicoRicevimento);

router.get('/buffet',                richiedeSezione('haccp'), ctrl.listaBuffet);
router.post('/buffet',               richiedeSezione('haccp'), ctrl.creaBuffet);
router.delete('/buffet/:id',         richiedeSezione('haccp'), ctrl.eliminaBuffet);
router.get('/buffet/storico',        soloTitolare,              ctrl.storicoBuffet);

// A.6 manutenzioni + A.7 formazione + A.8 infestanti (sessione 3, 16/08/2026)
router.get('/manutenzioni',          richiedeSezione('haccp'), ctrl.listaManutenzioni);
router.post('/manutenzioni',         richiedeSezione('haccp'), ctrl.creaManutenzione);
router.delete('/manutenzioni/:id',   richiedeSezione('haccp'), ctrl.eliminaManutenzione);
router.get('/manutenzioni/storico',  soloTitolare,              ctrl.storicoManutenzioni);

router.get('/formazione',            richiedeSezione('haccp'), ctrl.listaFormazione);
router.post('/formazione',           richiedeSezione('haccp'), ctrl.creaFormazione);
router.delete('/formazione/:id',     richiedeSezione('haccp'), ctrl.eliminaFormazione);
router.get('/formazione/storico',    soloTitolare,              ctrl.storicoFormazione);

router.get('/infestanti',            richiedeSezione('haccp'), ctrl.listaInfestanti);
router.post('/infestanti',           richiedeSezione('haccp'), ctrl.creaInfestanti);
router.delete('/infestanti/:id',     richiedeSezione('haccp'), ctrl.eliminaInfestanti);
router.get('/infestanti/storico',    soloTitolare,              ctrl.storicoInfestanti);

// Export per singolo registro + omnicomprensivo (sessione 4, 16/08/2026) —
// sostituisce il vecchio /ispezione: stesse intestazioni ESATTE del template
// registri_HACCP_A1_A8.xlsx, non più un formato inventato. Riservato al
// titolare, stesso livello dello storico sopra. ':registro' deve essere una
// delle 8 chiavi in esportazioneHaccpController.REGISTRI (es.
// 'A1_Ricevimento_merci') — 404 se non riconosciuta.
router.get('/export/omnicomprensivo/dati',   soloTitolare, exportCtrl.datiOmnicomprensivo);
router.get('/export/omnicomprensivo/excel',  soloTitolare, exportCtrl.excelOmnicomprensivo);
router.get('/export/:registro/dati',         soloTitolare, exportCtrl.datiRegistro);
router.get('/export/:registro/excel',        soloTitolare, exportCtrl.excelRegistro);

module.exports = router;
