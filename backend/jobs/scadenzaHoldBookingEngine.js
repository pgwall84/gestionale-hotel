// Cron di scadenza per gli hold del Booking Engine Diretto (modulo
// 19/08/2026) — SOLO canale_origine='sito_diretto', TTL 15 minuti. Non
// tocca mai le opzioni prese per telefono (canale 'diretta', TTL 48h,
// restano nella evolutiva separata "Cron scadenza automatica Opzione",
// docs/EVOLUTIVE.md — decisione deliberata di scope, non un oversight).
// Girano ogni minuto: la finestra di hold è breve (15 minuti), un
// intervallo più largo lascerebbe camere bloccate a vuoto troppo a lungo
// nella griglia planning vista da reception.
//
// NIENTE email e NIENTE rimborso qui: questo job intercetta gli hold la
// cui scadenza non è mai stata gestita da una nuova richiesta (sweep
// pigro in bookingPubblicoController.prenota) né dal webhook Stripe — il
// caso comune è un ospite che ha abbandonato il form prima di pagare,
// quindi non c'è nulla da rimborsare. Il rimborso "pagamento arrivato
// dopo la scadenza" resta gestito solo da stripeWebhookController.js, che
// vede l'evento Stripe reale. Il testo dell'email di rimborso
// (inviaNotificaHoldScaduto) parla esplicitamente di un addebito
// rimborsato — inviarla qui, senza sapere se un pagamento è mai avvenuto,
// sarebbe fuorviante per la maggioranza dei casi intercettati da questo
// job.
//
// Stessa ragione di promemoriaEmail.js/invioAlloggiatiWeb.js per essere
// avviato solo da server.js: app.js è importato anche dai test Jest
// (Supertest), un cron avviato lì girerebbe anche durante la suite di test.

const cron = require('node-cron');
const pool = require('../config/db');

const CANALE_ORIGINE_BOOKING_ENGINE = 'sito_diretto';

async function scadenzaHold() {
  try {
    await pool.query(
      `UPDATE soggiorni s SET cancellato = true
       FROM prenotazioni p
       WHERE s.prenotazione_id = p.id
         AND p.canale_origine = $1 AND p.stato = 'opzione'
         AND p.data_scadenza_opzione < NOW() AND s.cancellato = false`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    const result = await pool.query(
      `UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW()
       WHERE canale_origine = $1 AND stato = 'opzione' AND data_scadenza_opzione < NOW()
       RETURNING id`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    if (result.rows.length) {
      console.log(`[cron scadenza hold booking engine] interrotte ${result.rows.length} prenotazioni scadute: ${result.rows.map(r => r.id).join(', ')}`);
    }
  } catch (err) {
    console.error('[cron scadenza hold booking engine] errore:', err.message);
  }
}

function avviaJobScadenzaHoldBookingEngine() {
  cron.schedule('* * * * *', scadenzaHold);
  console.log('[cron scadenza hold booking engine] avviato (ogni minuto)');
}

module.exports = { avviaJobScadenzaHoldBookingEngine, scadenzaHold };
