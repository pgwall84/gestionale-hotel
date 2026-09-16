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
  // 978 = codice ISO 4217 numerico dell'EUR, unico valore ammesso da XPay per
  // 'divisa' (specifiche tecniche XPay v20.4, pag. 175) — NON la stringa
  // 'EUR'. Deve restare identico al valore usato in completaPagamento() per
  // lo stesso ordine, altrimenti XPay risponde 'Dati non validi' (pag. 179).
  const currency = 978;
  const mac = macAvvioPagamento({ transactionId, amount, currency });
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
      currency,
    },
  };
}

function macInterrogazione({ transactionId, timeStamp }) {
  return sha1(`apiKey=${process.env.XPAY_BUILD_ALIAS}codiceTransazione=${transactionId}timeStamp=${timeStamp}${process.env.XPAY_BUILD_MAC_KEY}`);
}

function macStorno({ transactionId, amount, currency, timeStamp }) {
  return sha1(
    `apiKey=${process.env.XPAY_BUILD_ALIAS}codiceTransazione=${transactionId}divisa=${currency}importo=${amount}timeStamp=${timeStamp}${process.env.XPAY_BUILD_MAC_KEY}`
  );
}

// Interrogazione dettaglio ordine (ecomm/api/bo/situazioneOrdine, pag. 617
// delle specifiche) — usata SOLO da jobs/nexiRiconciliazione.js: rete di
// sicurezza contro un pagamento andato a buon fine su Nexi ma di cui il
// nostro server non ha mai saputo nulla (completaPagamento sopra fallito
// per un problema di rete/processo DOPO che Nexi ha già incassato — vedi
// commento in testa a nexiRiconciliazione.js). XPay Build "pagamento base"
// non offre un webhook per questo caso (urlPost è documentato solo per i
// metodi di pagamento alternativi, pag. 163-164) — questa interrogazione è
// l'unico modo per scoprirlo in un secondo momento.
async function interrogaOrdine({ transactionId }) {
  const timeStamp = Date.now();
  const mac = macInterrogazione({ transactionId, timeStamp });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  const risposta = await fetch(`https://${dominio}/ecomm/api/bo/situazioneOrdine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.XPAY_BUILD_ALIAS,
      codiceTransazione: transactionId,
      timeStamp,
      mac,
    }),
  });
  const esito = await risposta.json().catch(() => null);
  return { httpStatus: risposta.status, esito };
}

// Storno/rimborso (ecomm/api/bo/storna, pag. 613) — usata SOLO da
// jobs/nexiRiconciliazione.js quando interrogaOrdine() scopre un pagamento
// riuscito su una prenotazione non più valida (opzione scaduta, camera
// potenzialmente riassegnata: stesso caso 'race'/'scaduta' già gestito per
// Stripe con stripe.refunds.create() in stripeWebhookController.js). Nexi
// decide da solo se si tratta di un annullo autorizzativo o di un vero
// rimborso in base allo stato contabile dell'ordine (pag. 615) — non
// dobbiamo distinguerlo qui.
// NOTA: nessun collegamento con "Incasso senza Pensieri" (prodotto Nexi
// per garanzie no-show, decisione ancora bloccata — vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md):
// questo è l'endpoint di storno standard, sempre disponibile, nessuna
// attivazione commerciale richiesta.
// BUGFIX (16/09/2026, verificato con chiamata reale in sandbox): la tabella
// "Messaggio di Avvio" per questo endpoint (pag. 613) documenta il campo
// come "apikey" minuscolo, diversamente da "apiKey" usato in
// avviaPagamento/completaPagamento/interrogaOrdine. Seguendo alla lettera
// la doc, Nexi rispondeva 200 OK ma con esito KO e
// errore.messaggio = 'Campo "apikey" non riconosciuto" — la documentazione
// era semplicemente sbagliata su questo punto. Il nome corretto è "apiKey",
// coerente con tutti gli altri endpoint e con la formula del MAC qui sopra
// (che infatti usa già "apiKey=" e non è mai stata toccata).
async function stornaOrdine({ transactionId, importoEuro }) {
  const amount = Math.round(importoEuro * 100);
  const currency = 978;
  const timeStamp = Date.now();
  const mac = macStorno({ transactionId, amount, currency, timeStamp });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  const risposta = await fetch(`https://${dominio}/ecomm/api/bo/storna`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.XPAY_BUILD_ALIAS,
      codiceTransazione: transactionId,
      importo: amount,
      divisa: currency,
      timeStamp,
      mac,
    }),
  });
  const esito = await risposta.json().catch(() => null);
  if (!risposta.ok || !esito || esito.esito !== 'OK') {
    throw new Error(`Storno Nexi non riuscito per transazione ${transactionId}: ${JSON.stringify(esito)}`);
  }
  return { httpStatus: risposta.status, esito };
}

async function completaPagamento({ transactionId, xpayNonce, importoEuro }) {
  const amount = Math.round(importoEuro * 100);
  const timeStamp = Date.now();
  // Stesso 978 (non 'EUR') usato in avviaPagamento — deve coincidere,
  // altrimenti XPay risponde 'Dati non validi' pur con MAC corretto (pag.
  // 179 delle specifiche: codiceTransazione, importo, divisa e apiKey
  // devono essere identici fra generazione xpayNonce e pagaNonce).
  const currency = 978;
  const mac = macPagaNonce({ transactionId, amount, currency, xpayNonce, timeStamp });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  const risposta = await fetch(`https://${dominio}/ecomm/api/hostedPayments/pagaNonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.XPAY_BUILD_ALIAS,
      codiceTransazione: transactionId,
      importo: amount,
      divisa: currency,
      xpayNonce,
      timeStamp,
      mac,
    }),
  });
  const esito = await risposta.json().catch(() => null);
  return { httpStatus: risposta.status, esito };
}

module.exports = {
  avviaPagamento, completaPagamento, interrogaOrdine, stornaOrdine,
  macAvvioPagamento, macPagaNonce, macInterrogazione, macStorno,
};
