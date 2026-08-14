// Routes Alloggiati Web (Modulo 2.5, Fase 1b) — /api/alloggiati.
// 'sincronizza' più ristretto di 'lettura': tocca le credenziali del
// servizio esterno, è una configurazione, non un'operazione di reception.
// Vedi shared/ruoli.js sezione 'alloggiati'.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/alloggiatiController');

router.use(verificaToken);

router.post('/sincronizza', richiedeAzione('alloggiati', 'sincronizza'), ctrl.sincronizzaTabelle);
router.get('/stato',        richiedeAzione('alloggiati', 'sincronizza'), ctrl.statoSincronizzazione);
router.get('/codici',       richiedeAzione('alloggiati', 'lettura'),     ctrl.listaCodici);

// Fase 2 (11/08/2026) — verifica credenziali sempre sicura, Test verifica
// solo il formato (nessuna acquisizione), Invia è l'unico che registra
// davvero presso la Polizia di Stato (gated nel controller da
// conferma_dati_reali). Stessa azione 'invio' per tutti e 3: chi può
// mandare una schedina reale deve poter anche verificarla prima.
router.post('/verifica-credenziali',  richiedeAzione('alloggiati', 'invio'), ctrl.verificaCredenziali);
router.post('/soggiorni/:id/test',    richiedeAzione('alloggiati', 'invio'), ctrl.testSchedineSoggiorno);
router.post('/soggiorni/:id/invia',   richiedeAzione('alloggiati', 'invio'), ctrl.inviaSchedineSoggiorno);

// Fase 2 (13/08/2026) — coda invii per la pagina Impostazioni: stessa
// azione 'invio', chi può inviare deve poter vedere anche cosa c'è da inviare.
router.get('/coda', richiedeAzione('alloggiati', 'invio'), ctrl.codaInvii);

// Fase B (13/08/2026) — ricevute ufficiali (obbligo conservazione 5 anni).
// Azione dedicata 'ricevute': contengono i dati di più ospiti in un solo
// PDF, stesso giro ristretto di 'invio' ma tenuta separata in
// shared/ruoli.js per poterla evolvere indipendentemente in futuro.
router.get('/ricevute',                    richiedeAzione('alloggiati', 'ricevute'), ctrl.listaRicevute);
router.post('/ricevute/:data/scarica',     richiedeAzione('alloggiati', 'ricevute'), ctrl.scaricaRicevutaManuale);
router.get('/ricevute/:data/file',         richiedeAzione('alloggiati', 'ricevute'), ctrl.downloadRicevutaFile);

module.exports = router;
