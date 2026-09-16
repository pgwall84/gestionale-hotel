// backend/scripts/nexi-verifica-manuale.js
// Uso:
//   node scripts/nexi-verifica-manuale.js <transactionId>
//   node scripts/nexi-verifica-manuale.js <transactionId> --storna <importoEuro>
//
// Verifica manuale una tantum (16/09/2026) per jobs/nexiRiconciliazione.js:
// interroga Nexi (situazioneOrdine) su un transactionId REALE già pagato
// tramite il percorso di test isolato /xpay-test (prepara → carta/3DS →
// paga-nonce, stesso flusso verificato il 31/08/2026 — vedi
// xpayTestController.js). Non serve nessuna riga in `pagamenti`: usare un
// transactionId nato da /xpay-test è già di per sè un pagamento che il
// gestionale non conosce, esattamente la situazione che il job deve
// scoprire da solo — niente DevTools, niente currency da far coincidere a
// mano (xpayTestController usa 'EUR', nexiProvider usa 978: situazioneOrdine
// interroga per codiceTransazione, non dipende da quale valuta fu usata
// nella fase di avvio).
//
// Il valore vero da guardare nell'output è risposta.esito — serve a
// correggere pagamentoRiuscitoSecondoNexi() in jobs/nexiRiconciliazione.js
// se il campo "stato" reale non combacia con l'ipotesi scritta lì
// (case-insensitive su "autorizzat"/"contabilizzat"/"pagat").
//
// --storna è OPZIONALE e va usato solo su un transactionId di TEST (mai su
// uno vero legato a una prenotazione reale) per verificare anche
// stornaOrdine() — richiede l'importo in euro usato in fase di pagamento
// (visibile nella tabella xpay_build_nonce_test, colonna importo).

require('dotenv').config();
const nexiProvider = require('../lib/payments/nexiProvider');

async function main() {
  const transactionId = process.argv[2];
  const flagStorna = process.argv[3] === '--storna';
  const importoEuro = flagStorna ? Number(process.argv[4]) : null;

  if (!transactionId) {
    console.error('Uso: node scripts/nexi-verifica-manuale.js <transactionId> [--storna <importoEuro>]');
    process.exitCode = 1;
    return;
  }
  if (flagStorna && (!Number.isFinite(importoEuro) || importoEuro <= 0)) {
    console.error('--storna richiede un importoEuro valido, es.: node scripts/nexi-verifica-manuale.js TEST123 --storna 50');
    process.exitCode = 1;
    return;
  }

  console.log(`\n== interrogaOrdine (situazioneOrdine) — transactionId ${transactionId} ==`);
  try {
    const risposta = await nexiProvider.interrogaOrdine({ transactionId });
    console.log(`HTTP ${risposta.httpStatus}`);
    console.log(JSON.stringify(risposta.esito, null, 2));
  } catch (err) {
    console.error('interrogaOrdine fallita:', err.message);
    process.exitCode = 1;
    return;
  }

  if (flagStorna) {
    console.log(`\n== stornaOrdine — transactionId ${transactionId}, importo ${importoEuro} EUR ==`);
    try {
      const risposta = await nexiProvider.stornaOrdine({ transactionId, importoEuro });
      console.log(`HTTP ${risposta.httpStatus}`);
      console.log(JSON.stringify(risposta.esito, null, 2));
    } catch (err) {
      console.error('stornaOrdine fallita (atteso se l\'ordine non è in uno stato stornabile):', err.message);
    }
  }

  // Nessun process.exit() qui apposta: su Windows, forzare l'uscita subito
  // dopo una fetch (undici) può far crashare il processo con "Assertion
  // failed: !(handle->flags & UV_HANDLE_CLOSING)" mentre i socket sono
  // ancora in chiusura (bug noto di Node su Windows, non del nostro
  // codice — visto la prima volta il 16/09/2026). process.exitCode imposta
  // il codice di uscita e lasciamo che Node chiuda da solo una volta
  // svuotato l'event loop.
}

main();
