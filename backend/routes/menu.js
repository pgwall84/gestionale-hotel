const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const fs = require('fs');
const { verificaToken, soloTitolare } = require('../middleware/auth');
const menuCtrl = require('../controllers/menuController');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'menu'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const logoStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'logo'),
  filename: (req, file, cb) => cb(null, `logo${path.extname(file.originalname)}`),
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// Pubblica — senza auth
router.get('/pubblico', menuCtrl.menuPubblico);

// Logo — lettura pubblica, upload solo titolare
router.get('/logo', (req, res) => {
  const dir = path.join(__dirname, '..', 'uploads', 'logo');
  const exts = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const file = exts.map(e => path.join(dir, `logo${e}`)).find(f => fs.existsSync(f));
  if (!file) return res.status(404).json({ errore: 'Logo non caricato.' });
  res.sendFile(file);
});
router.post('/logo', verificaToken, soloTitolare, uploadLogo.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ errore: 'Nessun file.' });
  res.json({ url: `/uploads/logo/${req.file.filename}` });
});

// Tutto il resto richiede login
router.use(verificaToken);

// Categorie
router.get('/categorie',          menuCtrl.listCategorie);
router.post('/categorie',         soloTitolare, menuCtrl.creaCategoria);
router.put('/categorie/:id',      soloTitolare, menuCtrl.modificaCategoria);
router.delete('/categorie/:id',   soloTitolare, menuCtrl.eliminaCategoria);

// Piatti
router.get('/piatti',             menuCtrl.listPiatti);
router.post('/piatti',            soloTitolare, upload.single('immagine'), menuCtrl.creaPiatto);
router.put('/piatti/:id',         soloTitolare, upload.single('immagine'), menuCtrl.modificaPiatto);
router.patch('/piatti/:id/toggle',verificaToken, menuCtrl.toggleDisponibile);
router.delete('/piatti/:id',      soloTitolare, menuCtrl.eliminaPiatto);

module.exports = router;
