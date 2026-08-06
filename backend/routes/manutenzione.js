// Route segnalazioni manutenzione/guasti — lista, creazione (foto opzionale),
// download foto, aggiornamento stato riservato ad admin/titolare.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/manutenzioneController');

// Configurazione multer — stesso pattern di routes/archivio.js. La foto è
// opzionale: se il form non allega nulla, multer lascia semplicemente
// req.file undefined, il controller gestisce entrambi i casi.
const uploadDir = path.join(__dirname, '..', 'uploads', 'manutenzione');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unico = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unico}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png/.test(file.mimetype);
    cb(null, ok);
  },
});

router.use(verificaToken);

router.get('/',              richiedeAzione('manutenzione', 'lettura'),  ctrl.lista);
router.post('/',             richiedeAzione('manutenzione', 'crea'),     upload.single('foto'), ctrl.crea);
router.get('/:id/foto',      richiedeAzione('manutenzione', 'lettura'),  ctrl.foto);
router.patch('/:id/stato',   richiedeAzione('manutenzione', 'gestione'), ctrl.aggiornaStato);

module.exports = router;
