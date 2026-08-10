// Routes catalogo addebiti rapidi — /api/impostazioni/catalogo-addebiti.
// Voci bar per la griglia a quadratoni (modulo addebiti extra, 10/08/2026).

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/addebitiExtraController');

router.use(verificaToken);

router.get('/',      richiedeAzione('catalogo_addebiti_rapidi', 'lettura'),   ctrl.listaCatalogo);
router.post('/',     richiedeAzione('catalogo_addebiti_rapidi', 'scrittura'), ctrl.creaVoceCatalogo);
router.patch('/:id', richiedeAzione('catalogo_addebiti_rapidi', 'scrittura'), ctrl.modificaVoceCatalogo);

module.exports = router;
