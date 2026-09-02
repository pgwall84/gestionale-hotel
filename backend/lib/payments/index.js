// backend/lib/payments/index.js — selettore del provider di pagamento
// attivo per il Booking Engine Diretto. Vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.
// Default 'stripe' se PAYMENT_PROVIDER non e' impostata: comportamento
// invariato per ogni ambiente che non conosce ancora questa variabile
// (produzione oggi non ce l'ha) — MAI un default silenzioso su 'nexi',
// che non ha credenziali di produzione.

const stripeProvider = require('./stripeProvider');
const nexiProvider = require('./nexiProvider');

const PROVIDER_VALIDI = ['stripe', 'nexi'];

function nomeProviderAttivo() {
  const valore = process.env.PAYMENT_PROVIDER || 'stripe';
  if (!PROVIDER_VALIDI.includes(valore)) {
    console.error(`PAYMENT_PROVIDER='${valore}' non riconosciuto, ricado su 'stripe'. Valori validi: ${PROVIDER_VALIDI.join(', ')}.`);
    return 'stripe';
  }
  return valore;
}

function providerAttivo() {
  return nomeProviderAttivo() === 'nexi' ? nexiProvider : stripeProvider;
}

module.exports = { nomeProviderAttivo, providerAttivo };
