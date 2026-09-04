// backend/lib/beds24InvioLog.js
// Log degli invii verso Beds24 (disponibilità/tariffe) — Modulo 2.3, Fase
// 2/3. Stesso principio prudente di scriviWebhookLog (routes/beds24.js):
// non deve mai interrompere il flusso che lo chiama, un log fallito non è
// un motivo per far fallire un push o un intero batch.
const pool = require('../config/db');

async function scriviInvioLog({ tipo, tipoCameraId, esito, dettaglio }) {
  try {
    await pool.query(
      `INSERT INTO beds24_invio_log (tipo, tipo_camera_id, esito, dettaglio) VALUES ($1, $2, $3, $4)`,
      [tipo, tipoCameraId, esito, dettaglio ? JSON.stringify(dettaglio) : null]
    );
  } catch (err) {
    console.error('scrittura beds24_invio_log — errore imprevisto:', err.message);
  }
}

module.exports = { scriviInvioLog };
