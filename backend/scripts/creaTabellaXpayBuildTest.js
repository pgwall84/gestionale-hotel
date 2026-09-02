// scripts/creaTabellaXpayBuildTest.js — crea (se non esiste) la tabella per
// il NUOVO percorso di test XPay Build (nonce + pagaNonce, terminale XPay
// Only 00103562), riscritto da zero il 31/08/2026 dopo aver scoperto che
// l'intero flusso precedente (order/build + confirmData, hfsdk.js) era
// costruito sulle specifiche del prodotto Nexi sbagliato (Intesa Sanpaolo,
// developer.nexi.it) — vedi la conversazione Cowork del 29-31/08/2026.
//
// Tabella dedicata NUOVA (xpay_build_nonce_test) invece di riusare
// xpay_test_ordini: quest'ultima esiste già nel DB di produzione locale ma
// il file/migration che l'ha creata non è più presente nel repository (né
// qui né altrove che sia riuscito a trovare), quindi non conosco i suoi
// vincoli esatti (NOT NULL su session_id/security_token?) e non ho accesso
// diretto al DB da questa sessione Cowork per verificarli — rischio
// inutile. Questa tabella nuova ha solo le colonne che il nuovo flusso usa
// davvero.
//
// Uso: eseguire una volta, manualmente, con "node scripts/creaTabellaXpayBuildTest.js"

const pool = require('../config/db');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xpay_build_nonce_test (
      id             SERIAL PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      importo        NUMERIC(10,2) NOT NULL,
      stato          TEXT NOT NULL DEFAULT 'creato',
      xpay_nonce     TEXT,
      esito_json     JSONB,
      creato_il      TIMESTAMPTZ NOT NULL DEFAULT now(),
      aggiornato_il  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('Tabella xpay_build_nonce_test pronta.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore creazione tabella:', err.message);
  process.exit(1);
});
