// backend/routes/beds24.js
// Rotte Beds24 — Modulo 2.3, Fase 1 (lettura prenotazioni). Il webhook è
// pubblico (nessun verificaToken: è Beds24 che chiama noi), protetto solo
// da un rate limit dedicato — stesso principio di preCheckinPubblico.js.
// Le rotte sulla coda "da revisionare" sono invece autenticate.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const { processaBooking } = require('../controllers/beds24SyncController');
const beds24Client = require('../lib/beds24Client');

const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste.' },
});

// Logga sempre il payload grezzo, anche se l'elaborazione fallisce dopo —
// stesso pattern di xpayNotificaController.js scriviLog(). hmac_valido
// resta null: Beds24 non documenta pubblicamente una firma sulle chiamate
// webhook in uscita (da verificare quando si abilita il webhook nel loro
// pannello — vedi Task 12), non è un'omissione, è un'incognita nota.
async function scriviWebhookLog(payload, errore) {
  try {
    await pool.query(
      `INSERT INTO webhook_log (fonte, payload_raw, hmac_valido, processato, errore)
       VALUES ('beds24', $1, NULL, $2, $3)`,
      [JSON.stringify(payload), !errore, errore || null]
    );
  } catch (logErr) {
    console.error('scrittura webhook_log (beds24) — errore imprevisto:', logErr.message);
  }
}

// Arricchisce una notifica webhook (di cui ci fidiamo solo per l'id della
// prenotazione) con i dati completi da GET /bookings, poi la processa.
// Usata sia dalla route POST che da quella GET qui sotto — stessa logica,
// stesso principio prudente: mai processare con dati incompleti, meglio
// lasciare che la riconciliazione notturna recuperi la prenotazione al
// giro successivo.
async function elaboraNotificaBooking(bookingId, payloadGrezzo) {
  let bookingCompleto;
  try {
    const risultati = await beds24Client.getBookings({ id: [bookingId] });
    bookingCompleto = risultati[0];
  } catch (errArricchimento) {
    await scriviWebhookLog(payloadGrezzo, `arricchimento GET /bookings fallito: ${errArricchimento.message}`);
    return;
  }

  if (!bookingCompleto) {
    await scriviWebhookLog(payloadGrezzo, `GET /bookings non ha restituito la prenotazione ${bookingId}`);
    return;
  }

  await processaBooking(bookingCompleto);
  await scriviWebhookLog(payloadGrezzo, null);
}

// POST /api/beds24/webhook/bookings — riceve le notifiche prenotazione da
// Beds24. Pubblica (nessun token: è Beds24 a chiamarci).
// Corpo incapsulato — confermato sullo Swagger reale (30/08/2026):
// { timeStamp, booking: {...}, infoItems, invoiceItems, messages, retries }
// NON un oggetto booking nudo. Logghiamo sempre il payload grezzo intero
// (con l'involucro) per tracciabilità.
//
// ATTENZIONE — il 02/09/2026 il supporto Beds24 ha confermato (log lato
// loro) che le notifiche reali per questa proprietà arrivano come GET su
// /webhook/bookings?bookid=...&status=..., non come POST con questo corpo
// — vedi la route GET subito sotto, che è quella effettivamente chiamata.
// Questa POST resta attiva (non rimossa) per compatibilità, nel caso lo
// Swagger descriva un meccanismo/tipo di evento diverso che in futuro
// venga davvero usato — ma finché non arriva mai una chiamata reale qui,
// è la route GET quella che conta.
//
// L'oggetto booking del webhook NON contiene firstName/lastName/email/
// phone (a differenza di GET /bookings) — confermato il 30/08/2026, non
// un'ipotesi. Processarlo così com'è farebbe creare a trovaOCreaOspite
// (beds24SyncController.js) un ospite vuoto ad OGNI notifica webhook,
// anche per la stessa prenotazione più volte (nessuna corrispondenza per
// email possibile con email null) — non un caso limite raro, il
// comportamento di default. Per questo arricchiamo sempre con una
// GET /bookings?id= prima di processare, invece di usare il corpo del
// webhook direttamente.
router.post('/webhook/bookings', webhookRateLimit, async (req, res) => {
  const payloadGrezzo = req.body || {};
  const bookingWebhook = payloadGrezzo.booking || {};
  try {
    if (!bookingWebhook.id || !bookingWebhook.roomId) {
      await scriviWebhookLog(payloadGrezzo, 'payload senza booking.id o booking.roomId');
      return res.status(200).json({ ricevuto: true });
    }
    await elaboraNotificaBooking(bookingWebhook.id, payloadGrezzo);
    res.status(200).json({ ricevuto: true });
  } catch (err) {
    console.error('beds24 webhook (POST) — errore elaborazione:', err.message);
    await scriviWebhookLog(payloadGrezzo, err.message);
    // 200 comunque: non vogliamo che Beds24 ripeta la stessa chiamata in
    // loop per un errore nostro — l'errore resta tracciato in webhook_log.
    res.status(200).json({ ricevuto: true });
  }
});

// GET /api/beds24/webhook/bookings?bookid=...&status=... — il formato
// REALE delle notifiche booking webhook di Beds24 per questa proprietà,
// confermato il 02/09/2026 dal supporto Beds24 tramite i loro log lato
// server (non un'ipotesi): una GET con bookid/status in query string,
// niente corpo. Ignoriamo deliberatamente "status" dalla query string e
// ci affidiamo sempre al dato fresco da GET /bookings tramite
// elaboraNotificaBooking — stessa prudenza della route POST qui sopra:
// non fidarsi di un valore che potrebbe essere superato da un evento
// successivo arrivato nel frattempo.
router.get('/webhook/bookings', webhookRateLimit, async (req, res) => {
  const payloadGrezzo = { bookid: req.query.bookid, status: req.query.status };
  try {
    if (!req.query.bookid) {
      await scriviWebhookLog(payloadGrezzo, 'notifica GET senza bookid');
      return res.status(200).json({ ricevuto: true });
    }
    await elaboraNotificaBooking(req.query.bookid, payloadGrezzo);
    res.status(200).json({ ricevuto: true });
  } catch (err) {
    console.error('beds24 webhook (GET) — errore elaborazione:', err.message);
    await scriviWebhookLog(payloadGrezzo, err.message);
    res.status(200).json({ ricevuto: true });
  }
});

// GET /api/beds24/da-revisionare — lista prenotazioni non assegnabili
// automaticamente, ancora da risolvere manualmente in reception.
// Accessibile a: admin, titolare, receptionist
router.get('/da-revisionare', verificaToken, richiedeAzione('beds24', 'lettura'), async (req, res) => {
  try {
    const risultato = await pool.query(
      `SELECT * FROM beds24_prenotazioni_da_revisionare WHERE risolto = false ORDER BY created_at`
    );
    res.json(risultato.rows);
  } catch (err) {
    console.error('lista beds24_prenotazioni_da_revisionare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// PATCH /api/beds24/da-revisionare/:id/risolvi — marca una riga della coda
// come risolta manualmente (la prenotazione è stata creata a mano).
// Accessibile a: admin, titolare, receptionist
router.patch('/da-revisionare/:id/risolvi', verificaToken, richiedeAzione('beds24', 'scrittura'), async (req, res) => {
  try {
    const risultato = await pool.query(
      `UPDATE beds24_prenotazioni_da_revisionare SET risolto = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!risultato.rows.length) {
      return res.status(404).json({ error: 'Riga non trovata.' });
    }
    res.json(risultato.rows[0]);
  } catch (err) {
    console.error('risolvi beds24_prenotazioni_da_revisionare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

module.exports = router;
