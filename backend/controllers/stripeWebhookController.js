// Endpoint dedicato ai webhook Stripe (Booking Engine Diretto, 19/08/2026)
// — MAI chiamato dal frontend, solo da Stripe. La verifica della firma
// (stripe.webhooks.constructEvent) è obbligatoria e non bypassabile: senza,
// chiunque potrebbe confermare prenotazioni finte senza aver pagato.
// Idempotente: un evento duplicato su una prenotazione già non più in
// stato 'opzione' non ripete nessuna azione (Stripe può reinviare lo
// stesso evento più volte).

const pool = require('../config/db');
const stripe = require('../lib/stripeClient');
const { inviaConfermaPrenotazione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto } = require('../lib/emailPrenotazioni');

async function webhook(req, res) {
  const firma = req.headers['stripe-signature'];
  let evento;
  try {
    evento = stripe.webhooks.constructEvent(req.body, firma, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma webhook Stripe non valida:', err.message);
    return res.status(400).json({ error: 'Firma non valida' });
  }

  if (evento.type !== 'payment_intent.succeeded') {
    // Altri eventi (es. payment_intent.payment_failed) riconosciuti ma
    // senza azione: il blocco resta valido fino a scadenza, l'ospite può
    // ritentare il pagamento sullo stesso client_secret.
    return res.status(200).json({ ricevuto: true });
  }

  const paymentIntent = evento.data.object;
  const prenotazioneId = paymentIntent.metadata && paymentIntent.metadata.prenotazione_id;
  if (!prenotazioneId) {
    console.error('Webhook Stripe: payment_intent senza metadata.prenotazione_id', paymentIntent.id);
    return res.status(200).json({ ricevuto: true });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prenotazione = await client.query(
      `SELECT id, stato, data_scadenza_opzione FROM prenotazioni WHERE id = $1 FOR UPDATE`,
      [prenotazioneId]
    );
    if (!prenotazione.rows.length) {
      await client.query('ROLLBACK');
      return res.status(200).json({ ricevuto: true });
    }
    const { stato, data_scadenza_opzione } = prenotazione.rows[0];

    if (stato !== 'opzione') {
      // BUGFIX 20/08/2026 (sera, trovato in code review) — race cron/webhook:
      // il cron di scadenza hold (backend/jobs/scadenzaHoldBookingEngine.js,
      // ogni minuto) può marcare la prenotazione 'interrotta' PRIMA che
      // questo webhook venga elaborato, senza sapere che il pagamento è nel
      // frattempo riuscito su Stripe (il cron, per scelta, non chiama mai
      // Stripe — vedi commento in cima al job). La versione precedente si
      // fermava qui in ogni caso di stato diverso da 'opzione', assumendo
      // che fosse sempre un webhook duplicato o un caso già gestito — ma se
      // il cron ha già interrotto la prenotazione E il pagamento non è mai
      // stato marcato 'completato' né già rimborsato, l'ospite restava
      // addebitato su Stripe senza prenotazione e senza rimborso. Qui si
      // verifica esplicitamente questo caso e si rimborsa comunque, senza
      // provare a far rivivere la prenotazione (la camera potrebbe essere
      // già stata riassegnata) — stessa filosofia già scelta il 19/08/2026
      // per il caso "pagamento arrivato dopo la scadenza" qui sotto.
      const pagamentoPendente = await client.query(
        `SELECT id FROM pagamenti WHERE prenotazione_id = $1 AND external_payment_id = $2 AND stato = 'pending' FOR UPDATE`,
        [prenotazioneId, paymentIntent.id]
      );
      if (!pagamentoPendente.rows.length) {
        await client.query('COMMIT');
        return res.status(200).json({ ricevuto: true });
      }

      await client.query(`UPDATE pagamenti SET stato = 'rimborsato' WHERE id = $1`, [pagamentoPendente.rows[0].id]);
      await client.query('COMMIT');

      await stripe.refunds.create({ payment_intent: paymentIntent.id });
      console.error(
        `[webhook stripe] race cron/scadenza hold: prenotazione ${prenotazioneId} era già in stato '${stato}' quando il pagamento è arrivato — rimborsato automaticamente, verificare manualmente lo stato della camera.`
      );
      inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
        console.error('invio notifica hold scaduto (race cron) — errore imprevisto:', err.message);
      });

      return res.status(200).json({ ricevuto: true, rimborsato: true });
    }

    const scaduta = new Date(data_scadenza_opzione) < new Date();
    if (scaduta) {
      // Caso limite deciso il 19/08/2026: rimborso automatico, nessuna
      // eccezione per onorare la prenotazione fuori dai 15 minuti.
      await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
      await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazioneId]);
      await client.query(
        `UPDATE pagamenti SET stato = 'rimborsato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
        [prenotazioneId, paymentIntent.id]
      );
      await client.query('COMMIT');

      await stripe.refunds.create({ payment_intent: paymentIntent.id });
      inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
        console.error('invio notifica hold scaduto — errore imprevisto:', err.message);
      });

      return res.status(200).json({ ricevuto: true, rimborsato: true });
    }

    await client.query(`UPDATE prenotazioni SET stato = 'confermata', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
    await client.query(
      `UPDATE pagamenti SET stato = 'completato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
      [prenotazioneId, paymentIntent.id]
    );

    await client.query('COMMIT');

    // Dettagli titolare carta/circuito/ultime 4 cifre per la mail di
    // conferma (19/08/2026, segnalato da Marco) — recuperati al volo da
    // Stripe DOPO la commit (mai dentro la transazione DB: è una chiamata di
    // rete esterna, non deve tenere aperta la connessione al database).
    // Nessuna nuova colonna: il dato vive solo in Stripe, letto fresco ogni
    // volta. Best-effort — se la retrieve fallisce, la mail parte comunque
    // ma senza la sezione "Modalità di pagamento".
    let dettagliPagamento;
    try {
      if (paymentIntent.payment_method) {
        const metodo = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        if (metodo.card) {
          dettagliPagamento = {
            titolare: metodo.billing_details?.name || null,
            circuito: metodo.card.brand,
            ultime4: metodo.card.last4,
            importoCaparra: paymentIntent.amount / 100,
            dataPagamento: new Date(),
          };
        }
      }
    } catch (err) {
      console.error('recupero dettagli metodo di pagamento — errore imprevisto:', err.message);
    }

    // Email dopo la commit, fire-and-forget — stesso pattern già in uso in
    // prenotazioniController.aggiornaStato.
    inviaConfermaPrenotazione(prenotazioneId, { dettagliPagamento }).catch(err => {
      console.error('invio email conferma (booking pubblico) — errore imprevisto:', err.message);
    });
    inviaInvitoPreCheckin(prenotazioneId).catch(err => {
      console.error('invio invito pre-checkin (booking pubblico) — errore imprevisto:', err.message);
    });

    res.status(200).json({ ricevuto: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('webhook stripe error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

module.exports = { webhook };
