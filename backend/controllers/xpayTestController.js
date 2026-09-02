// controllers/xpayTestController.js — logica per il percorso di test
// isolato di Nexi XPay Build (flusso nonce + pagaNonce), terminale XPay
// Only 00103562 (int-ecommerce.nexi.it). Riscritto da zero il 31/08/2026:
// il flusso precedente (order/build + confirmData, libreria hfsdk.js) era
// costruito sulle specifiche del prodotto Intesa Sanpaolo (developer.nexi.it),
// diverso dal terminale reale del titolare — confermato da Nexi stessa
// (email tech.ecommerce@nexi.it, 31/08/2026). Vedi
// docs/superpowers/specs/2026-08-29-integrazione-nexi-xpay-design.md e la
// conversazione Cowork 29-31/08/2026 per il percorso completo.

const pool = require('../config/db');
// macAvvioPagamento/macPagaNonce riusate da lib/payments/nexiProvider.js
// (02/09/2026, Task 8 dello switch provider di pagamento) — stesso calcolo
// verificato qui in isolamento il 31/08/2026, ora condiviso col percorso
// di produzione (PAYMENT_PROVIDER=nexi) invece di duplicato.
const { macAvvioPagamento, macPagaNonce } = require('../lib/payments/nexiProvider');

const ALIAS = process.env.XPAY_BUILD_ALIAS;
// "int-" = ambiente di test/integrazione, stesso dominio del backoffice del
// terminale 00103562 — NON xpaysandbox.nexigroup.com (quello era il
// prodotto Intesa, sbagliato).
const DOMINIO_TEST = process.env.XPAY_BUILD_TEST_HOST || 'int-ecommerce.nexi.it';
const CURRENCY = 'EUR'; // unico valore ammesso per pagaNonce, per XPay.setConfig è lo stesso codice

function generaTransactionId() {
  // AN MIN 2 MAX 30, esclusi i caratteri # _ ' " (per pagaNonce; per il
  // messaggio di avvio pagamento è escluso invece "_" — evitiamo entrambi
  // per sicurezza usando solo alfanumerico).
  return `TEST${Date.now()}`;
}

// POST /api/xpay-test/prepara — genera i dati che il client deve passare a
// XPay.setConfig(), incluso il MAC calcolato qui (la chiave segreta non
// deve MAI arrivare al browser).
exports.prepara = async (req, res) => {
  try {
    if (!ALIAS || !process.env.XPAY_BUILD_MAC_KEY) {
      return res.status(500).json({
        errore: 'XPAY_BUILD_ALIAS o XPAY_BUILD_MAC_KEY non configurati in .env del backend.',
      });
    }
    const importoEuro = Number(req.body?.importo);
    if (!Number.isFinite(importoEuro) || importoEuro <= 0) {
      return res.status(400).json({ errore: 'Importo non valido.' });
    }
    const amount = Math.round(importoEuro * 100); // centesimi, senza separatore
    const transactionId = generaTransactionId();
    const timeStamp = Date.now();
    const mac = macAvvioPagamento({ transactionId, amount, currency: CURRENCY });

    await pool.query(
      `INSERT INTO xpay_build_nonce_test (transaction_id, importo, stato) VALUES ($1, $2, 'creato')`,
      [transactionId, importoEuro.toFixed(2)]
    );

    res.json({
      alias: ALIAS,
      environment: 'INTEG',
      scriptSrc: `https://${DOMINIO_TEST}/ecomm/XPayBuild/js?alias=${ALIAS}`,
      transactionId,
      timeStamp,
      mac,
      amount,
      currency: CURRENCY,
    });
  } catch (err) {
    console.error('xpay-test/prepara:', err);
    res.status(500).json({ errore: err.message });
  }
};

// POST /api/xpay-test/paga-nonce — riceve il nonce generato dall'SDK
// client-side e completa il pagamento server-to-server con l'API pagaNonce
// di Nexi. L'importo/divisa usati per il MAC e per la chiamata vengono
// ripresi dal DB (dall'ordine creato in /prepara), MAI da quanto manda il
// client, per lo stesso motivo per cui pagaNonce stessa fa un controllo di
// coerenza tra le due fasi.
exports.pagaNonce = async (req, res) => {
  try {
    const { transactionId, xpayNonce } = req.body || {};
    if (!transactionId || !xpayNonce) {
      return res.status(400).json({ errore: 'transactionId e xpayNonce sono obbligatori.' });
    }

    const { rows } = await pool.query(
      `SELECT importo FROM xpay_build_nonce_test WHERE transaction_id = $1`,
      [transactionId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ errore: `Ordine di test ${transactionId} non trovato.` });
    }
    const amount = Math.round(Number(rows[0].importo) * 100);
    const timeStamp = Date.now();
    const mac = macPagaNonce({ transactionId, amount, currency: CURRENCY, xpayNonce, timeStamp });

    const rispostaNexi = await fetch(`https://${DOMINIO_TEST}/ecomm/api/hostedPayments/pagaNonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        apiKey: ALIAS,
        codiceTransazione: transactionId,
        importo: amount,
        divisa: CURRENCY,
        xpayNonce,
        timeStamp,
        mac,
      }),
    });
    const esito = await rispostaNexi.json().catch(() => null);
    console.log('xpay-test/pagaNonce, risposta Nexi (status ' + rispostaNexi.status + '):', JSON.stringify(esito, null, 2));

    const successo = esito?.esito === 'OK';
    await pool.query(
      `UPDATE xpay_build_nonce_test SET stato = $1, xpay_nonce = $2, esito_json = $3, aggiornato_il = now() WHERE transaction_id = $4`,
      [successo ? 'pagato' : 'fallito', xpayNonce, esito ? JSON.stringify(esito) : null, transactionId]
    );

    res.status(rispostaNexi.status).json(esito ?? { errore: 'Risposta non JSON da Nexi.' });
  } catch (err) {
    console.error('xpay-test/pagaNonce:', err);
    res.status(500).json({ errore: err.message });
  }
};
