// Route archivio documentale — upload, ricerca, download, eliminazione.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verificaToken, richiedeSezione } = require('../middleware/auth');
const ctrl = require('../controllers/archivioController');

// Configurazione multer — stesso pattern di routes/hr.js (documenti dipendente)
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'archivio'),
  filename: (req, file, cb) => {
    const unico = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unico}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB
  fileFilter: (req, file, cb) => {
    const ok = /pdf|jpeg|jpg|png/.test(file.mimetype);
    cb(null, ok);
  },
});

router.use(verificaToken, richiedeSezione('archivio'));

router.get('/',              ctrl.lista);
router.post('/',             upload.single('file'), ctrl.upload);
router.get('/:id/download',  ctrl.download);
router.delete('/:id',        ctrl.elimina);

module.exports = router;
