// Routes Soggiorni + Soggiorno_ospiti (Fase 2) — /api/soggiorni.
// Un'unica sezione permessi 'soggiorni' in shared/ruoli.js (lettura/
// scrittura) copre sia PATCH /:id che i 3 endpoint .../ospiti, perché il
// contratto API li tratta con permessi identici — vedi
// docs/API_PRENOTAZIONI_FASE2.md Sezione 3-4 (tabella riepilogativa,
// colonna unica "Soggiorni/ospiti").

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/soggiorniController');

router.use(verificaToken);

router.patch('/:id',                     richiedeAzione('soggiorni', 'scrittura'), ctrl.aggiorna);
router.get('/:id/ospiti',                richiedeAzione('soggiorni', 'lettura'),   ctrl.listaOspiti);
router.post('/:id/ospiti',               richiedeAzione('soggiorni', 'scrittura'), ctrl.aggiungiOspite);
router.delete('/:id/ospiti/:ospiteId',   richiedeAzione('soggiorni', 'scrittura'), ctrl.rimuoviOspite);

module.exports = router;
