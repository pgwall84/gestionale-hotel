// backend/controllers/beds24SyncController.js
// Upsert idempotente delle prenotazioni ricevute da Beds24 — Modulo 2.3,
// Fase 1. Usata sia dal webhook (backend/routes/beds24.js) sia dal job di
// riconciliazione notturna (backend/jobs/beds24Riconciliazione.js): stessa
// funzione, stessa logica, per non avere due percorsi di scrittura da
// tenere allineati.
// Accessibile solo internamente (nessuna route la espone direttamente).

const pool = require('../config/db');
const { pushDisponibilitaImmediata } = require('../lib/beds24PushDisponibilita');

const CANALE_ORIGINE = 'beds24';

// Le colonne date di Postgres arrivano come oggetti Date via pg — booking.arrival/
// departure invece sono già stringhe ISO dal payload Beds24. Serve un'unica
// conversione per poter fare min/max tra le due provenienze quando si calcola
// il range da ripubblicare su pushDisponibilitaImmediata.
function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// Crea l'ospite se non esiste (match su email quando presente, altrimenti
// crea sempre) — solo nome+cognome, coerente con la creazione rapida già
// in uso in planning-camere. I dati regolatori (residenza, documento)
// restano raccolti al pre-checkin/check-in come per ogni altra
// prenotazione.
async function trovaOCreaOspite(client, booking) {
  if (booking.email) {
    const esistente = await client.query(
      `SELECT id FROM ospiti WHERE email = $1 ORDER BY id LIMIT 1`, [booking.email]
    );
    if (esistente.rows.length) {
      await client.query(
        `UPDATE ospiti SET nome = $2, cognome = $3 WHERE id = $1`,
        [esistente.rows[0].id, booking.firstName, booking.lastName]
      );
      return esistente.rows[0].id;
    }
  }
  const nuovo = await client.query(
    `INSERT INTO ospiti (nome, cognome, email, telefono) VALUES ($1, $2, $3, $4) RETURNING id`,
    [booking.firstName, booking.lastName, booking.email || null, booking.phone || null]
  );
  return nuovo.rows[0].id;
}

// Trova una camera fisica libera per il tipo_camera_id e l'intervallo di
// date richiesti — stessa query (FOR UPDATE SKIP LOCKED) già in uso in
// bookingPubblicoController.js per il booking engine diretto. Restituisce
// null se nessuna camera è libera (overbooking — atteso finché non
// esiste anche l'invio disponibilità verso Beds24, punto 2 del modulo).
async function trovaCameraLibera(client, tipoCameraId, dataArrivo, dataPartenza) {
  const risultato = await client.query(
    `SELECT c.id FROM camere c
     JOIN tipi_camera_camere tcc ON tcc.camera_id = c.id
     WHERE tcc.tipo_camera_id = $1 AND c.attivo = true
       AND NOT EXISTS (
         SELECT 1 FROM soggiorni s
         WHERE s.camera_id = c.id AND s.cancellato = false
           AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($2::date, $3::date, '[)')
       )
     ORDER BY c.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );
  return risultato.rows[0]?.id || null;
}

// Scrive una prenotazione non assegnabile automaticamente nella coda di
// revisione manuale (camera non mappata o nessuna camera fisica libera).
// Va chiamata DOPO il ROLLBACK della transazione principale, come query
// indipendente (la riga di coda deve sopravvivere anche se la transazione
// che tentava l'upsert è stata annullata).
async function scriviInCoda(externalBookingId, payload, motivo) {
  await pool.query(
    `INSERT INTO beds24_prenotazioni_da_revisionare (external_booking_id, payload_raw, motivo)
     VALUES ($1, $2, $3)`,
    [externalBookingId, JSON.stringify(payload), motivo]
  );
}

// Elabora una prenotazione grezza ricevuta da Beds24 (webhook o job di
// riconciliazione). Idempotente: la stessa external_booking_id aggiorna
// la riga esistente invece di duplicarla.
async function processaBooking(booking) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const externalBookingId = String(booking.id);

    const esistente = await client.query(
      `SELECT p.id AS prenotazione_id, s.id AS soggiorno_id, s.camera_id, s.data_arrivo, s.data_partenza
       FROM prenotazioni p JOIN soggiorni s ON s.prenotazione_id = p.id
       WHERE p.canale_origine = $1 AND p.external_booking_id = $2`,
      [CANALE_ORIGINE, externalBookingId]
    );

    // Una prenotazione mai vista prima e già cancellata su Beds24 va
    // ignorata qui: il ramo di cancellazione qualche riga sotto scatta solo
    // se esiste già una riga in prenotazioni/soggiorni. Senza questo
    // controllo finirebbe nel blocco di creazione in fondo, che scrive
    // sempre stato='confermata' senza guardare booking.status, occupando
    // una camera fisica per una prenotazione che non è mai stata attiva.
    if (!esistente.rows.length && booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return { esito: 'ignorata_cancellata_alla_prima_vista' };
    }

    const mappatura = await client.query(
      `SELECT tipo_camera_id FROM tipi_camera_canali WHERE canale = 'beds24' AND codice_esterno = $1`,
      [String(booking.roomId)]
    );
    if (!mappatura.rows.length) {
      await client.query('ROLLBACK');
      await scriviInCoda(externalBookingId, booking, 'camera_non_mappata');
      return { esito: 'in_coda', dettaglio: { motivo: 'camera_non_mappata' } };
    }
    const tipoCameraId = mappatura.rows[0].tipo_camera_id;

    const ospiteId = await trovaOCreaOspite(client, booking);

    if (esistente.rows.length) {
      const riga = esistente.rows[0];

      if (booking.status === 'cancelled') {
        const soggiornoAttuale = await client.query(
          `SELECT check_in_effettuato_at FROM soggiorni WHERE id = $1`, [riga.soggiorno_id]
        );
        if (soggiornoAttuale.rows[0].check_in_effettuato_at) {
          await client.query('ROLLBACK');
          return { esito: 'cancellazione_ignorata_post_checkin' };
        }
        await client.query(`UPDATE soggiorni SET cancellato = true, updated_at = now() WHERE id = $1`, [riga.soggiorno_id]);
        await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = now() WHERE id = $1`, [riga.prenotazione_id]);
        await client.query('COMMIT');
        await pushDisponibilitaImmediata(tipoCameraId, isoData(riga.data_arrivo), isoData(riga.data_partenza));
        return { esito: 'cancellata' };
      }

      await client.query(
        `UPDATE soggiorni SET data_arrivo = $2, data_partenza = $3, num_ospiti = $4, ospite_id = $5, updated_at = now()
         WHERE id = $1`,
        [riga.soggiorno_id, booking.arrival, booking.departure, (booking.numAdult || 1) + (booking.numChild || 0), ospiteId]
      );
      await client.query('COMMIT');
      // Ripubblica l'unione vecchio+nuovo range: se le date sono cambiate,
      // sia i giorni liberati sia quelli ora occupati vanno rispecchiati su
      // Beds24, non solo i nuovi.
      const dataArrivoUnione = isoData(riga.data_arrivo) < booking.arrival ? isoData(riga.data_arrivo) : booking.arrival;
      const dataPartenzaUnione = isoData(riga.data_partenza) > booking.departure ? isoData(riga.data_partenza) : booking.departure;
      await pushDisponibilitaImmediata(tipoCameraId, dataArrivoUnione, dataPartenzaUnione);
      return { esito: 'aggiornata' };
    }

    const cameraId = await trovaCameraLibera(client, tipoCameraId, booking.arrival, booking.departure);
    if (!cameraId) {
      await client.query('ROLLBACK');
      await scriviInCoda(externalBookingId, booking, 'nessuna_camera_disponibile');
      return { esito: 'in_coda', dettaglio: { motivo: 'nessuna_camera_disponibile' } };
    }

    const prenotazioneResult = await client.query(
      `INSERT INTO prenotazioni (canale_origine, external_booking_id, stato)
       VALUES ($1, $2, 'confermata') RETURNING id`,
      [CANALE_ORIGINE, externalBookingId]
    );
    const prenotazioneId = prenotazioneResult.rows[0].id;

    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [prenotazioneId, cameraId, ospiteId, booking.arrival, booking.departure, (booking.numAdult || 1) + (booking.numChild || 0)]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '16')`,
      [soggiornoResult.rows[0].id, ospiteId]
    );

    await client.query('COMMIT');
    await pushDisponibilitaImmediata(tipoCameraId, booking.arrival, booking.departure);
    return { esito: 'creata' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { processaBooking };
