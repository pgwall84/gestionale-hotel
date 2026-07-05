// Routes modulo ristorante — sala, prenotazioni, comande, SSE cucina.
// NOTA: /comande/righe/:id deve stare PRIMA di /comande/:id per evitare conflitti di routing.

const express = require('express');
const router = express.Router();
const { verificaToken } = require('../middleware/auth');

const sala         = require('../controllers/salaController');
const prenotazioni = require('../controllers/prenotazioniRistoranteController');
const comande      = require('../controllers/comandeController');

// Helper: verifica che il ruolo dell'utente sia tra quelli consentiti.
// Usato dopo verificaToken — req.utente è già popolato.
function ruoli(...ammessi) {
  return (req, res, next) => {
    if (!req.utente || !ammessi.includes(req.utente.ruolo)) {
      return res.status(403).json({ errore: 'Non hai i permessi per questa operazione.' });
    }
    next();
  };
}

// Ruoli aggregati per leggibilità
const TUTTI_OP = ['admin', 'titolare', 'receptionist', 'cameriere', 'cuoco', 'portiere_notte'];
const SALA_W   = ['admin', 'titolare'];
const PREN_W   = ['admin', 'titolare', 'receptionist', 'portiere_notte'];
const CMD_W    = ['admin', 'titolare', 'cameriere'];
const CUCINA   = ['admin', 'titolare', 'cuoco', 'cameriere'];
const SPECIALE = ['admin', 'titolare'];
const SALA_R   = ['admin', 'titolare', 'cameriere', 'receptionist'];

// ── SSE cucina ────────────────────────────────────────────────────────────────
// GET /api/ristorante/cucina/stream
router.get('/cucina/stream',
  verificaToken,
  ruoli('admin', 'titolare', 'cuoco', 'portiere_notte'),
  comande.streamCucina
);

// ── SSE sala (camerieri) ──────────────────────────────────────────────────────
// GET /api/ristorante/sala/stream — eventi riga_pronta e comanda_chiusa
router.get('/sala/stream',
  verificaToken,
  ruoli(...SALA_R),
  comande.streamSala
);

// ── Configurazioni sala ───────────────────────────────────────────────────────
router.get('/config',              verificaToken, ruoli(...TUTTI_OP), sala.listaConfig);
router.post('/config',             verificaToken, ruoli(...SALA_W),   sala.creaConfig);
router.patch('/config/:id/attiva', verificaToken, ruoli(...SALA_W),   sala.attivaConfig);

// ── Tavoli ────────────────────────────────────────────────────────────────────
router.get('/tavoli',        verificaToken, ruoli(...TUTTI_OP), sala.listaTavoli);
router.post('/tavoli',       verificaToken, ruoli(...SALA_W),   sala.creaTavolo);
router.put('/tavoli/:id',                verificaToken, ruoli(...SALA_W),   sala.modificaTavolo);
router.delete('/tavoli/:id',             verificaToken, ruoli(...SALA_W),   sala.eliminaTavolo);
router.patch('/tavoli/:id/prenotazione', verificaToken, ruoli('admin','titolare','receptionist','cameriere'), sala.associaPrenotazione);

// ── Prenotazioni ristorante ───────────────────────────────────────────────────
router.get('/prenotazioni',        verificaToken, ruoli(...TUTTI_OP), prenotazioni.lista);
router.post('/prenotazioni',       verificaToken, ruoli(...PREN_W),   prenotazioni.crea);
router.patch('/prenotazioni/:id',  verificaToken, ruoli(...PREN_W),   prenotazioni.aggiorna);
router.delete('/prenotazioni/:id', verificaToken, ruoli(...PREN_W),   prenotazioni.cancella);

// ── Comande ───────────────────────────────────────────────────────────────────
router.get('/comande',  verificaToken, ruoli(...TUTTI_OP), comande.listaComande);
router.post('/comande', verificaToken, ruoli(...CMD_W),    comande.apriComanda);

// ── Righe comanda — PRIMA di /comande/:id ────────────────────────────────────
// Express valuta le route in ordine: se /comande/:id venisse prima,
// "righe" verrebbe catturato come id e le route sottostanti non verrebbero mai raggiunte.

router.delete('/comande/righe/:rigaId',
  verificaToken, ruoli(...CMD_W),
  comande.rimuoviRiga
);

router.patch('/comande/righe/:rigaId/stato',
  verificaToken, ruoli(...CUCINA),
  comande.aggiornaStatoRiga
);

router.patch('/comande/righe/:rigaId/tipo-speciale',
  verificaToken, ruoli(...SPECIALE),
  comande.tipoSpecialeRiga
);

// ── Comande per ID — DOPO le route /righe ────────────────────────────────────
router.get('/comande/:id',                verificaToken, ruoli(...TUTTI_OP), comande.dettaglioComanda);
router.delete('/comande/:id',             verificaToken, ruoli(...CMD_W),    comande.eliminaComanda);
router.patch('/comande/:id/chiudi',       verificaToken, ruoli(...CMD_W),    comande.chiudiComanda);
router.post('/comande/:id/righe',         verificaToken, ruoli(...CMD_W),    comande.aggiungiRiga);
router.post('/comande/:id/tutto-pronto',  verificaToken, ruoli(...CUCINA),   comande.tuttoProonto);

// ── Conto ─────────────────────────────────────────────────────────────────────
router.get('/conto/:id', verificaToken, ruoli(...CMD_W), comande.conto);

module.exports = router;
