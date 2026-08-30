// backend/jobs/beds24Riconciliazione.js
// Rete di sicurezza contro webhook Beds24 persi — Modulo 2.3, Fase 1.
// Ogni notte alle 03:00 (basso traffico) recupera le prenotazioni
// modificate dall'ultima sincronizzazione e le passa alla stessa
// funzione di upsert del webhook, per non avere due logiche di
// scrittura da mantenere allineate.
// Avviato solo da server.js, mai da app.js (stesso motivo di
// avviaJobPromemoriaEmail: app.js è importato anche dai test Jest).

const cron = require('node-cron');
const pool = require('../config/db');
const beds24Client = require('../lib/beds24Client');
// Riferimento all'intero modulo (non destrutturato) — permette a
// jest.spyOn(beds24SyncController, 'processaBooking') di intercettare la
// chiamata nei test, stessa ragione per cui beds24Client è importato
// così sopra invece che con { getBookings }.
const beds24SyncController = require('../controllers/beds24SyncController');

// Beds24 vuole modifiedFrom/modifiedTo in formato YYYY-MM-DDTHH:MM:SS —
// niente millisecondi, niente Z (confermato sullo Swagger reale,
// 30/08/2026). toISOString() produce invece ".123Z" in coda: lo togliamo.
function formattaDataBeds24(data) {
  return data.toISOString().replace(/\.\d{3}Z$/, '');
}

async function eseguiRiconciliazione() {
  const config = await pool.query('SELECT ultima_sincronizzazione_at FROM beds24_config WHERE id = 1');
  if (!config.rows.length || !config.rows[0].ultima_sincronizzazione_at) {
    console.log('Riconciliazione Beds24: nessuna sincronizzazione precedente, salto questo giro (richiede prima il setup, vedi beds24Setup.js).');
    return;
  }

  const modifiedFrom = formattaDataBeds24(new Date(config.rows[0].ultima_sincronizzazione_at));
  const inizioGiro = new Date();

  try {
    // status non passato: getBookings usa il suo default (confirmed,
    // new, request, cancelled) — include sempre le cancellazioni, vedi
    // commento in beds24Client.js.
    const prenotazioni = await beds24Client.getBookings({ modifiedFrom });
    let elaborate = 0;
    for (const booking of prenotazioni) {
      try {
        await beds24SyncController.processaBooking(booking);
        elaborate += 1;
      } catch (err) {
        console.error(`Riconciliazione Beds24 — errore su prenotazione ${booking.id}:`, err.message);
      }
    }
    await pool.query('UPDATE beds24_config SET ultima_sincronizzazione_at = $1 WHERE id = 1', [inizioGiro]);
    console.log(`Riconciliazione Beds24 completata: ${elaborate}/${prenotazioni.length} prenotazioni elaborate.`);
  } catch (err) {
    console.error('Riconciliazione Beds24 — chiamata a Beds24 fallita:', err.message);
  }
}

function avviaJobRiconciliazioneBeds24() {
  cron.schedule('0 3 * * *', eseguiRiconciliazione);
}

module.exports = { avviaJobRiconciliazioneBeds24, eseguiRiconciliazione };
