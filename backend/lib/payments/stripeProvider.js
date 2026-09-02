// backend/lib/payments/stripeProvider.js — wrapper del Booking Engine
// Diretto attorno a lib/stripeClient.js, con la stessa forma di risposta
// di nexiProvider.avviaPagamento() (external_payment_id + chiaveRisposta +
// datiCliente) cosi' bookingPubblicoController.prenota() non deve sapere
// quale provider e' attivo. chiaveRisposta='client_secret' e datiCliente
// come stringa (non oggetto) per restare compatibile byte-per-byte con la
// risposta che il frontend attuale gia' si aspetta.

const stripe = require('../stripeClient');

async function avviaPagamento({ prenotazioneId, importoEuro }) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(importoEuro * 100),
    currency: 'eur',
    metadata: { prenotazione_id: String(prenotazioneId) },
    description: `Caparra prenotazione #${prenotazioneId} — Hotel del Golfo`,
  });
  return {
    external_payment_id: paymentIntent.id,
    chiaveRisposta: 'client_secret',
    datiCliente: paymentIntent.client_secret,
  };
}

module.exports = { avviaPagamento };
