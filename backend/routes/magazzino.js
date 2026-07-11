// Routes modulo magazzino — prodotti, fornitori, movimenti, alert, food cost.
// NOTA: /prodotti/lookup-ean/:ean e /prodotti/qr/:qr_code devono stare PRIMA
// di eventuali route /prodotti/:id per evitare conflitti di routing (qui non
// esiste /prodotti/:id, ma manteniamo l'ordine per coerenza col resto del progetto).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeSezione, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/magazzinoController');

router.use(verificaToken);

// ── Prodotti ──────────────────────────────────────────────────────────────────
router.get('/prodotti',                  richiedeSezione('magazzino'), ctrl.listaProdotti);
router.get('/prodotti/lookup-ean/:ean',  soloTitolare,                 ctrl.lookupEan);
router.get('/prodotti/qr/:qr_code',      richiedeSezione('magazzino'), ctrl.prodottoPerQr);
router.post('/prodotti',                 soloTitolare,                 ctrl.creaProdotto);

// ── Fornitori ─────────────────────────────────────────────────────────────────
router.get('/fornitori',  richiedeSezione('magazzino'), ctrl.listaFornitori);
router.post('/fornitori', soloTitolare,                 ctrl.creaFornitore);

// ── Movimenti ─────────────────────────────────────────────────────────────────
router.get('/movimenti',  richiedeSezione('magazzino'), ctrl.listaMovimenti);
router.post('/movimenti', richiedeSezione('magazzino'), ctrl.registraMovimento);

// ── Alert e report ───────────────────────────────────────────────────────────
router.get('/alert',      richiedeSezione('magazzino'), ctrl.alertSottoscorta);
router.get('/food-cost',  soloTitolare,                 ctrl.foodCostPeriodo);

module.exports = router;
