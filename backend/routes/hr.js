// Route HR — tutte le API del Modulo 2 (personale).
// Ogni gruppo di route usa i middleware appropriati per ruolo.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const { verificaToken, soloTitolare, richiedeSezione } = require('../middleware/auth');

const timbratureCtrl    = require('../controllers/timbratureController');
const turniCtrl         = require('../controllers/turniController');
const assenzeCtrl       = require('../controllers/assenzeController');
const scadenzeCtrl      = require('../controllers/scadenzeController');
const documentiCtrl     = require('../controllers/documentiController');
const comunicazioniCtrl = require('../controllers/comunicazioniController');
const haccpCtrl         = require('../controllers/haccpController');
const turniStandardCtrl = require('../controllers/turniStandardController');
const ospitiCtrl        = require('../controllers/ospitiController');

// Configurazione multer per upload documenti
// I file vengono salvati con nome univoco per evitare collisioni
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'documenti'),
  filename: (req, file, cb) => {
    const unico = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unico}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB per file
  fileFilter: (req, file, cb) => {
    // Accetta solo PDF e immagini
    const ok = /pdf|jpeg|jpg|png/.test(file.mimetype);
    cb(null, ok);
  },
});

// Tutte le route richiedono token valido
router.use(verificaToken);

// ── Timbrature ────────────────────────────────────────────────────────────────
router.post('/timbrature',               timbratureCtrl.timbra);
router.get('/timbrature/stato',          timbratureCtrl.statoCorrente);
router.get('/timbrature/storico',        timbratureCtrl.storico);
router.get('/timbrature/presenti',       soloTitolare, timbratureCtrl.presenti);
router.get('/timbrature/export',         soloTitolare, timbratureCtrl.exportExcel);
router.get('/timbrature/report-mensile', soloTitolare, timbratureCtrl.reportMensile);

// ── Turni ─────────────────────────────────────────────────────────────────────
router.get('/turni',                     turniCtrl.lista);
router.post('/turni',                    soloTitolare, turniCtrl.crea);
router.put('/turni/:id',                 soloTitolare, turniCtrl.modifica);
router.delete('/turni/:id',              soloTitolare, turniCtrl.elimina);

// ── Turni standard ────────────────────────────────────────────────────────────
router.get('/turni-standard',            soloTitolare, turniStandardCtrl.lista);
router.post('/turni-standard',           soloTitolare, turniStandardCtrl.salva);
router.delete('/turni-standard/:user_id',soloTitolare, turniStandardCtrl.elimina);

// ── Assenze (ferie/permessi/malattia) ─────────────────────────────────────────
router.get('/assenze',                   assenzeCtrl.lista);
router.post('/assenze',                  assenzeCtrl.crea);
router.patch('/assenze/:id/stato',       soloTitolare, assenzeCtrl.aggiornaStato);

// ── Scadenze ─────────────────────────────────────────────────────────────────
router.get('/scadenze',                  soloTitolare, scadenzeCtrl.lista);
router.get('/scadenze/alert',            soloTitolare, scadenzeCtrl.alert);
router.post('/scadenze',                 soloTitolare, scadenzeCtrl.crea);
router.put('/scadenze/:id',              soloTitolare, scadenzeCtrl.modifica);
router.delete('/scadenze/:id',           soloTitolare, scadenzeCtrl.elimina);

// ── Documenti dipendente ──────────────────────────────────────────────────────
router.get('/documenti',                 documentiCtrl.lista);
router.get('/documenti/download-zip',    soloTitolare, documentiCtrl.downloadZip);
router.post('/documenti',                soloTitolare, upload.single('file'), documentiCtrl.upload);
router.get('/documenti/:id/download',    documentiCtrl.download);
router.delete('/documenti/:id',          soloTitolare, documentiCtrl.elimina);

// ── Comunicazioni (bacheca) ───────────────────────────────────────────────────
router.get('/comunicazioni',             comunicazioniCtrl.lista);
router.post('/comunicazioni',            soloTitolare, comunicazioniCtrl.crea);
router.delete('/comunicazioni/:id',      soloTitolare, comunicazioniCtrl.elimina);

// ── HACCP ─────────────────────────────────────────────────────────────────────
router.get('/haccp',                     haccpCtrl.lista);
router.post('/haccp',                    haccpCtrl.salva);
router.get('/haccp/storico',             soloTitolare, haccpCtrl.storico);

// ── Ospiti giornalieri (note cucina) ─────────────────────────────────────────
router.get('/ospiti',                    ospitiCtrl.get);
router.post('/ospiti',                   richiedeSezione('ristorante_prenotazioni'), ospitiCtrl.salva);

module.exports = router;
