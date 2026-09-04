// backend/lib/beds24PushDisponibilita.js
// Push disponibilità immediato — Modulo 2.3, Fase 2/3. Chiamato dopo
// COMMIT da beds24SyncController.processaBooking e da
// bookingPubblicoController.js (creazione/modifica/cancellazione diretta),
// qualunque canale abbia generato la modifica: la disponibilità fisica
// del tipo_camera_id è cambiata, e va rispecchiata su Beds24 a
// prescindere da dove sia partita la modifica.
// Best-effort: non deve mai interrompere il flusso che lo chiama, stesso
// principio del webhook (la scrittura sul nostro DB ha sempre priorità).
const pool = require('../config/db');
const beds24Client = require('./beds24Client');
const { calcolaDisponibilitaBeds24Range } = require('./beds24PrezziDisponibilita');
const { scriviInvioLog } = require('./beds24InvioLog');

async function pushDisponibilitaImmediata(tipoCameraId, dataArrivo, dataPartenza) {
  try {
    const mappatura = await pool.query(
      `SELECT codice_esterno FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24' AND codice_esterno IS NOT NULL`,
      [tipoCameraId]
    );
    if (!mappatura.rows.length) {
      return; // nessuna mappatura Beds24 per questa tipologia — nulla da inviare
    }
    const roomId = Number(mappatura.rows[0].codice_esterno);

    const righe = await calcolaDisponibilitaBeds24Range(tipoCameraId, dataArrivo, dataPartenza);
    if (!righe.length) return;

    const calendar = righe.map((r, idx) => ({
      from: r.giorno,
      to: idx < righe.length - 1 ? righe[idx + 1].giorno : r.giorno,
      numAvail: r.numAvail,
    }));

    const risultato = await beds24Client.pushCalendario([{ roomId, calendar }]);
    await scriviInvioLog({ tipo: 'disponibilita', tipoCameraId, esito: 'successo', dettaglio: risultato.risposta });
  } catch (err) {
    await scriviInvioLog({ tipo: 'disponibilita', tipoCameraId, esito: 'errore', dettaglio: { messaggio: err.message } });
  }
}

module.exports = { pushDisponibilitaImmediata };
