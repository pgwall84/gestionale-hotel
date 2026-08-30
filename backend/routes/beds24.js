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

// POST /api/beds24/webhook/bookings — riceve le notifiche prenotazione da
// Beds24. Pubblica (nessun token: è Beds24 a chiamarci).
// Corpo incapsulato — confermato sullo Swagger reale (30/08/2026):
// { timeStamp, booking: {...}, infoItems, invoiceItems, messages, retries }
// NON un oggetto booking nudo. Logghiamo sempre il payload grezzo intero
// (con l'involucro) per tracciabilità, ma processiamo solo booking.
// ATTENZIONE — nota aperta: l'oggetto booking del webhook NON contiene
// firstName/lastName/email/phone (a differenza di GET /bookings). Finché
// non si decide una correzione, processaBooking crea/aggiorna con questi
// campi vuoti sul percorso webhook — vedi conversazione 30/08/2026.
router.post('/webhook/bookings', webhookRateLimit, async (req, res) => {
  const payloadGrezzo = req.body || {};
  const booking = payloadGrezzo.booking || {};
  try {
    if (!booking.id || !booking.roomId) {
      await scriviWebhookLog(payloadGrezzo, 'payload senza booking.id o booking.roomId');
      return res.status(200).json({ ricevuto: true });
    }
    await processaBooking(booking);
    await scriviWebhookLog(payloadGrezzo, null);
    res.status(200).json({ ricevuto: true });
  } catch (err) {
    console.error('beds24 webhook — errore elaborazione:', err.message);
    await scriviWebhookLog(payloadGrezzo, err.message);
    // 200 comunque: non vogliamo che Beds24 ripeta la stessa chiamata in
    // loop per un errore nostro — l'errore resta tracciato in webhook_log.
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
