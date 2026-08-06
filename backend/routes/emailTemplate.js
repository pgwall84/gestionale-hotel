// Routes gestione testi email automatiche — /api/email-template (modulo 5.3,
// estensione 04/08/2026). Riservato ad admin/titolare (shared/ruoli.js
// sezione 'email_template'). NOTA routing: /footer deve stare PRIMA di
// /:tipo, altrimenti Express interpreta "footer" come un tipo.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/emailTemplateController');

router.use(verificaToken);

router.get('/footer',    richiedeAzione('email_template', 'lettura'),   ctrl.getFooter);
router.patch('/footer',  richiedeAzione('email_template', 'scrittura'), ctrl.aggiornaFooter);
router.get('/',          richiedeAzione('email_template', 'lettura'),   ctrl.listaTemplate);
router.patch('/:tipo',   richiedeAzione('email_template', 'scrittura'), ctrl.aggiornaTemplate);

module.exports = router;
