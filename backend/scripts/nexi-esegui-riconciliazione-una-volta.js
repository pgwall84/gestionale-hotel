// backend/scripts/nexi-esegui-riconciliazione-una-volta.js
// Uso: node scripts/nexi-esegui-riconciliazione-una-volta.js
//
// Test manuale una tantum (16/09/2026) per verificare il collegamento tra
// jobs/nexiRiconciliazione.js e i dati veri in `pagamenti`/`prenotazioni`,
// senza aspettare il cron (ogni 2 minuti, avviato solo da server.js). Fa
// esattamente un giro di eseguiRiconciliazioneNexi() e termina — nessun
// cron viene registrato, nessun altro job del progetto viene toccato.
//
// Procedura consigliata (vedi conversazione 16/09/2026):
//   1. Fai una prenotazione reale sul sito, in locale, con
//      PAYMENT_PROVIDER=nexi e una carta di test "accettata", fino alla
//      conferma normale.
//   2. Riporta a mano quella riga di `pagamenti` a stato='pending' e
//      retrocedi created_at oltre ETA_MINIMA_SECONDI (90s), es.:
//        UPDATE pagamenti SET stato = 'pending', created_at = NOW() - INTERVAL '5 minutes' WHERE id = <id>;
//   3. Lancia questo script. Atteso: la prenotazione è GIÀ confermata, quindi
//      confermaPrenotazione() deve rispondere 'gia_gestita' — vedi il log
//      "nessuna azione: confermaPrenotazione ha risposto 'gia_gestita'" in
//      jobs/nexiRiconciliazione.js. Se invece tenta uno storno, FERMA e
//      controlla subito: significa che sta trattando un pagamento vero e
//      già incassato come se fosse da rimborsare.
//   4. Riporta a mano `pagamenti.stato` al valore originale.
//
// ATTENZIONE: questo script scrive per davvero sul DB configurato nel
// backend/.env corrente (config/db.js) — verificare che punti al DB giusto
// (locale, non produzione) prima di eseguirlo.

require('dotenv').config();
const { eseguiRiconciliazioneNexi } = require('../jobs/nexiRiconciliazione');
const pool = require('../config/db');

async function main() {
  console.log(`[test manuale] DB: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log('[test manuale] Avvio eseguiRiconciliazioneNexi() — un giro solo, nessun cron registrato...\n');

  await eseguiRiconciliazioneNexi();

  console.log('\n[test manuale] Giro completato. Se non hai visto nessun log con prefisso [riconciliazione nexi] sopra, significa che la query non ha trovato nessun pagamento pending da esaminare — controlla stato/created_at della riga di test.');

  // Chiude il pool esplicitamente invece di forzare process.exit(): stesso
  // principio già applicato in scripts/nexi-verifica-manuale.js (16/09/2026)
  // per evitare il crash "Assertion failed: UV_HANDLE_CLOSING" su Windows
  // quando si termina il processo mentre ci sono ancora handle (qui: il
  // pool Postgres) in fase di chiusura.
  await pool.end();
}

main().catch(err => {
  console.error('[test manuale] errore imprevisto:', err);
  process.exitCode = 1;
});
