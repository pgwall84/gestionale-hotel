// Routes Prenotazioni (Fase 2) — /api/prenotazioni.
// Permessi differenziati per azione — vedi shared/ruoli.js sezione
// 'prenotazioni' e docs/API_PRENOTAZIONI_FASE2.md Sezione 2.
// NOTA routing: /griglia deve stare PRIMA di /:id per evitare che Express
// interpreti "griglia" come un id.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const { puoCompiereAzione } = require('../../shared/ruoli');
const ctrl = require('../controllers/prenotazioniController');
const pagamentiCtrl = require('../controllers/pagamentiController');

// Permesso per PATCH .../stato: non un semplice array di ruoli, perché
// portiere_notte può fare SOLO la transizione verso 'check_in' (check-in
// notturno), nessun'altra. Va combinato col valore di 'stato' nel body —
// per questo non usa richiedeAzione (che guarda solo il ruolo), ma un
// middleware dedicato che consulta anche req.body.stato.
function richiedeTransizioneStato(req, res, next) {
  if (!req.utente) {
    return res.status(401).json({ errore: 'Non autenticato.' });
  }
  const ruolo = req.utente.ruolo;
  const statoRichiesto = req.body?.stato;
  const permessoGenerale = puoCompiereAzione(ruolo, 'prenotazioni', 'stato');
  const permessoSoloCheckIn = statoRichiesto === 'check_in' && puoCompiereAzione(ruolo, 'prenotazioni', 'stato_check_in');
  if (!permessoGenerale && !permessoSoloCheckIn) {
    return res.status(403).json({ errore: 'Non hai i permessi per questa operazione.' });
  }
  next();
}

router.use(verificaToken);

router.get('/griglia',      richiedeAzione('prenotazioni', 'lettura'),   ctrl.griglia);
router.get('/:id',          richiedeAzione('prenotazioni', 'lettura'),   ctrl.dettaglio);
router.post('/',            richiedeAzione('prenotazioni', 'scrittura'), ctrl.crea);
router.post('/:id/soggiorni', richiedeAzione('prenotazioni', 'scrittura'), ctrl.aggiungiSoggiorno);
router.patch('/:id',        richiedeAzione('prenotazioni', 'scrittura'), ctrl.aggiorna);
router.patch('/:id/stato',  richiedeTransizioneStato,                    ctrl.aggiornaStato);
router.get('/:id/pagamenti',  richiedeAzione('pagamenti', 'lettura'),   pagamentiCtrl.listaPerPrenotazione);
router.post('/:id/pagamenti', richiedeAzione('pagamenti', 'scrittura'), pagamentiCtrl.creaPerPrenotazione);

module.exports = router;
