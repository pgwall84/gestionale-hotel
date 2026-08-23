// backend/lib/stripeClient.js — istanza condivisa dell'SDK Stripe.
// Usata da bookingPubblicoController (creazione PaymentIntent) e da
// stripeWebhookController (verifica firma webhook). Modulo Booking Engine
// Diretto, 19/08/2026 — vedi
// docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md.

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
  console.error('STRIPE_SECRET_KEY non configurata in .env — le route booking-pubblico falliranno.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_solo_per_test');

module.exports = stripe;
