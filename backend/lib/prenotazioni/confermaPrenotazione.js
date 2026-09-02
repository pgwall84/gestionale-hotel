// backend/lib/prenotazioni/confermaPrenotazione.js — transizione di stato
// condivisa tra il webhook Stripe (asincrono) e il completamento pagamento
// Nexi (sincrono). Estratta da controllers/stripeWebhookController.js il
// 02/09/2026 — vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.
//
// Gestisce SOLO la transizione di stato in DB (prenotazioni/pagamenti),
// sotto lock FOR UPDATE contro il cron di scadenza hold
// (jobs/scadenzaHoldBookingEngine.js). NON chiama MAI un provider di
// pagamento (ne' Stripe ne' Nexi) e NON decide se/come rimborsare sui casi
// 'race'/'scaduta' — quella e' responsabilita' del chiamante, perche' solo
// lui sa come farlo (Stripe: stripe.refunds.create(); Nexi: oggi nessuna
// integrazione di storno, vedi migration 056).

const pool = require('../../config/db');

async function confermaPrenotazione({ prenotazioneId, externalPaymentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prenotazione = await client.query(
      `SELECT id, stato, data_scadenza_opzione FROM prenotazioni WHERE id = $1 FOR UPDATE`,
      [prenotazioneId]
    );
    if (!prenotazione.rows.length) {
      await client.query('ROLLBACK');
      return { esito: 'non_trovata' };
    }
    const { stato, data_scadenza_opzione } = prenotazione.rows[0];

    if (stato !== 'opzione') {
      const pagamentoPendente = await client.query(
        `SELECT id FROM pagamenti WHERE prenotazione_id = $1 AND external_payment_id = $2 AND stato = 'pending' FOR UPDATE`,
        [prenotazioneId, externalPaymentId]
      );
      await client.query('COMMIT');
      if (!pagamentoPendente.rows.length) {
        return { esito: 'gia_gestita' };
      }
      return { esito: 'race', pagamentoId: pagamentoPendente.rows[0].id };
    }

    const scaduta = new Date(data_scadenza_opzione) < new Date();
    if (scaduta) {
      await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
      await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazioneId]);
      const pagamento = await client.query(
        `SELECT id FROM pagamenti WHERE prenotazione_id = $1 AND external_payment_id = $2`,
        [prenotazioneId, externalPaymentId]
      );
      await client.query('COMMIT');
      return { esito: 'scaduta', pagamentoId: pagamento.rows[0] ? pagamento.rows[0].id : null };
    }

    await client.query(`UPDATE prenotazioni SET stato = 'confermata', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
    await client.query(
      `UPDATE pagamenti SET stato = 'completato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
      [prenotazioneId, externalPaymentId]
    );
    await client.query('COMMIT');
    return { esito: 'confermata' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { confermaPrenotazione };
