// Route dedicata al webhook Stripe (Booking Engine Diretto, 19/08/2026) —
// DEVE ricevere il body grezzo (Buffer), non JSON già parsato, altrimenti
// stripe.webhooks.constructEvent non può verificare la firma. Per questo è
// montata in app.js PRIMA di app.use(express.json()) globale — vedi
// commento in app.js.

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stripeWebhookController');

router.post('/', express.raw({ type: 'application/json' }), ctrl.webhook);

module.exports = router;
