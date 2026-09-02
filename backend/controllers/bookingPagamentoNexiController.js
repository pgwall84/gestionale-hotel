// controllers/bookingPagamentoNexiController.js — completamento del
// pagamento Nexi XPay Build per il Booking Engine Diretto. Route pubblica
// (stesso principio di sicurezza di bookingPubblicoController.js: nessun
// verificaToken, protetta da rate limit + CORS dedicato in
// routes/bookingPubblico.js). Chiamata dal frontend dopo che l'SDK XPay
// Build ha prodotto uno xpayNonce (vedi controllers/xpayTestController.js
// per il precedente verificato in isolamento).

const pool = require('../config/db');
const nexiProvider = require('../lib/payments/nexiProvider');
const { confermaPrenotazione } = require('../lib/prenotazioni/confermaPrenotazione');
const { inviaConfermaPrenotazione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto } = require('../lib/emailPrenotazioni');

async function completaPagamentoNexi(req, res) {
  const { prenotazione_id: prenotazioneId, xpay_nonce: xpayNonce } = req.body || {};
  if (!prenotazioneId || !xpayNonce) {
    return res.status(400).json({ error: 'prenotazione_id e xpay_nonce sono obbligatori.' });
  }

  // Tutto il corpo sotto un unico try/catch (stesso pattern di
  // bookingPubblicoController.prenota() e stripeWebhookController.webhook()):
  // senza, un errore DB imprevisto in uno degli UPDATE qui sotto restava
  // una promise rifiutata mai gestita — la richiesta HTTP non riceveva mai
  // risposta, il client restava appeso fino al timeout invece di un 500
  // pulito. Trovato da un giro di npm test reale (02/09/2026) sul caso
  // 'richiede_rimborso_manuale' (vedi migration 057).
  try {
    const pagamento = await pool.query(
      `SELECT id, importo, external_payment_id FROM pagamenti WHERE prenotazione_id = $1 AND metodo = 'nexi' AND stato = 'pending' ORDER BY id DESC LIMIT 1`,
      [prenotazioneId]
    );
    if (!pagamento.rows.length) {
      return res.status(404).json({ error: 'Nessun pagamento Nexi in attesa per questa prenotazione.' });
    }
    const { id: pagamentoId, importo, external_payment_id: transactionId } = pagamento.rows[0];

    let rispostaNexi;
    try {
      rispostaNexi = await nexiProvider.completaPagamento({
        transactionId,
        xpayNonce,
        importoEuro: Number(importo),
      });
    } catch (err) {
      console.error(`completa-pagamento-nexi: chiamata a Nexi fallita per prenotazione ${prenotazioneId}:`, err.message);
      return res.status(502).json({ error: 'Impossibile completare il pagamento in questo momento. Riprova.' });
    }

    const successo = rispostaNexi.esito && rispostaNexi.esito.esito === 'OK';

    if (!successo) {
      await pool.query(`UPDATE pagamenti SET stato = 'fallito' WHERE id = $1`, [pagamentoId]);
      return res.status(200).json({ confermato: false, esito: rispostaNexi.esito });
    }

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: transactionId });

    if (risultato.esito === 'confermata') {
      inviaConfermaPrenotazione(prenotazioneId, {}).catch(err => {
        console.error('invio email conferma (booking pubblico, Nexi) — errore imprevisto:', err.message);
      });
      inviaInvitoPreCheckin(prenotazioneId).catch(err => {
        console.error('invio invito pre-checkin (booking pubblico, Nexi) — errore imprevisto:', err.message);
      });
      return res.status(200).json({ confermato: true });
    }

    if (risultato.esito === 'race' || risultato.esito === 'scaduta') {
      await pool.query(`UPDATE pagamenti SET stato = 'richiede_rimborso_manuale' WHERE id = $1`, [pagamentoId]);
      console.error(
        `[completa-pagamento-nexi] prenotazione ${prenotazioneId}: pagamento Nexi ${transactionId} riuscito (importo ${importo} EUR) ma la prenotazione non e' piu' valida (${risultato.esito}) — serve storno manuale da backoffice Nexi.`
      );
      inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
        console.error('invio notifica hold scaduto (Nexi) — errore imprevisto:', err.message);
      });
      return res.status(200).json({ confermato: false, richiede_intervento_manuale: true });
    }

    return res.status(200).json({ confermato: false });
  } catch (err) {
    console.error(`completa-pagamento-nexi: errore imprevisto per prenotazione ${prenotazioneId}:`, err);
    return res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { completaPagamentoNexi };
