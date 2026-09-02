// backend/lib/payments/nexiProvider.js — client Nexi XPay Build (Alias +
// Chiave MAC, terminale XPay Only), stesso schema verificato funzionante
// nel percorso di test isolato (controllers/xpayTestController.js,
// /xpay-test, 31/08/2026). Usato dal Booking Engine Diretto quando
// PAYMENT_PROVIDER=nexi — vedi lib/payments/index.js e
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.

const crypto = require('crypto');

function sha1(stringa) {
  return crypto.createHash('sha1').update(stringa, 'utf8').digest('hex');
}

function macAvvioPagamento({ transactionId, amount, currency }) {
  return sha1(`codTrans=${transactionId}divisa=${currency}importo=${amount}${process.env.XPAY_BUILD_MAC_KEY}`);
}

function macPagaNonce({ transactionId, amount, currency, xpayNonce, timeStamp }) {
  return sha1(
    `apiKey=${process.env.XPAY_BUILD_ALIAS}codiceTransazione=${transactionId}importo=${amount}divisa=${currency}xpayNonce=${xpayNonce}timeStamp=${timeStamp}${process.env.XPAY_BUILD_MAC_KEY}`
  );
}

function generaTransactionId(prenotazioneId) {
  return `PR${prenotazioneId}T${Date.now()}`;
}

function avviaPagamento({ prenotazioneId, importoEuro }) {
  if (!process.env.XPAY_BUILD_ALIAS || !process.env.XPAY_BUILD_MAC_KEY) {
    throw new Error('XPAY_BUILD_ALIAS o XPAY_BUILD_MAC_KEY non configurati in .env del backend.');
  }
  const amount = Math.round(importoEuro * 100);
  const transactionId = generaTransactionId(prenotazioneId);
  const timeStamp = Date.now();
  const mac = macAvvioPagamento({ transactionId, amount, currency: 'EUR' });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  return {
    external_payment_id: transactionId,
    chiaveRisposta: 'pagamento_nexi',
    datiCliente: {
      alias: process.env.XPAY_BUILD_ALIAS,
      environment: process.env.XPAY_BUILD_ENVIRONMENT || 'INTEG',
      scriptSrc: `https://${dominio}/ecomm/XPayBuild/js?alias=${process.env.XPAY_BUILD_ALIAS}`,
      transactionId,
      timeStamp,
      mac,
      amount,
      currency: 'EUR',
    },
  };
}

async function completaPagamento({ transactionId, xpayNonce, importoEuro }) {
  const amount = Math.round(importoEuro * 100);
  const timeStamp = Date.now();
  const mac = macPagaNonce({ transactionId, amount, currency: 'EUR', xpayNonce, timeStamp });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  const risposta = await fetch(`https://${dominio}/ecomm/api/hostedPayments/pagaNonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.XPAY_BUILD_ALIAS,
      codiceTransazione: transactionId,
      importo: amount,
      divisa: 'EUR',
      xpayNonce,
      timeStamp,
      mac,
    }),
  });
  const esito = await risposta.json().catch(() => null);
  return { httpStatus: risposta.status, esito };
}

module.exports = { avviaPagamento, completaPagamento, macAvvioPagamento, macPagaNonce };
