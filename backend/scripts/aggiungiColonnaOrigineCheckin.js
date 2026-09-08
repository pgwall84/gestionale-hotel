// scripts/aggiungiColonnaOrigineCheckin.js — aggiunge (se non esiste) la
// colonna prenotazioni.pre_checkin_origine ('manuale' | 'automatico'), per
// distinguere l'invio dell'invito pre-checkin fatto a mano dalla reception
// (prenotazioniController.inviaPreCheckin) da quello automatico incluso nel
// promemoria a 3 giorni dall'arrivo (jobs/promemoriaEmail.js,
// inviaPromemoriaPreArrivo) — richiesta di Marco del 07/09/2026, contestuale
// alla rimozione dell'invio prematuro e automatico che partiva subito alla
// conferma pagamento (bug arrivato insieme al flusso Nexi, commit d512d435
// del 03/09/2026, presente sia in stripeWebhookController.js che in
// bookingPagamentoNexiController.js).
//
// Le prenotazioni con invito già inviato prima di questa modifica restano
// con pre_checkin_origine NULL (non è possibile ricostruire retroattivamente
// se fu manuale o automatico).
//
// Uso: eseguire una volta, manualmente, con
//   node scripts/aggiungiColonnaOrigineCheckin.js

const pool = require('../config/db');

async function main() {
  await pool.query(`
    ALTER TABLE prenotazioni
    ADD COLUMN IF NOT EXISTS pre_checkin_origine TEXT
  `);
  console.log('Colonna prenotazioni.pre_checkin_origine pronta.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore aggiunta colonna:', err.message);
  process.exit(1);
});
