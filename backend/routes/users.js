// Route per la gestione degli utenti.
// Tutte protette: prima verificaToken (utente loggato), poi soloTitolare (solo chi ha ruolo titolare).

const express = require('express');
const router = express.Router();
const { lista, dettaglio, crea, modifica, cambiaStato } = require('../controllers/usersController');
const { verificaToken, soloTitolare } = require('../middleware/auth');

// Applica verificaToken + soloTitolare a tutte le route di questo file
router.use(verificaToken, soloTitolare);

router.get('/', lista);                         // GET  /api/users
router.get('/:id', dettaglio);                  // GET  /api/users/5
router.post('/', crea);                         // POST /api/users
router.put('/:id', modifica);                   // PUT  /api/users/5
router.patch('/:id/attivo', cambiaStato);       // PATCH /api/users/5/attivo

module.exports = router;
