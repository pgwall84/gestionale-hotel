// Route ricerca globale (CMD+K, 23/08/2026) — /api/ricerca?q=...
// Un solo endpoint GET, nessuna scrittura. Permesso: 'prenotazioni'.'lettura'
// — stesso gruppo di ruoli di 'ospiti'.'lettura' in shared/ruoli.js
// (admin/titolare/receptionist/portiere_notte), quindi copre già ospiti e
// prenotazioni; 'camere' non ha un permesso di lettura dedicato (la lista
// camere è aperta a chiunque autenticato, vedi routes/camere.js), quindi
// non serve un controllo aggiuntivo per quella parte.
const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/ricercaController');

router.use(verificaToken);
router.get('/', richiedeAzione('prenotazioni', 'lettura'), ctrl.cerca);

module.exports = router;
