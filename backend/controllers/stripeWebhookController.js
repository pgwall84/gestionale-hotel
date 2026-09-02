// Endpoint dedicato ai webhook Stripe (Booking Engine Diretto, 19/08/2026)
// — MAI chiamato dal frontend, solo da Stripe. La verifica della firma
// (stripe.webhooks.constructEvent) è obbligatoria e non bypassabile: senza,
// chiunque potrebbe confermare prenotazioni finte senza aver pagato.
// Idempotente: un evento duplicato su una prenotazione già non più in
// stato 'opzione' non ripete nessuna azione (Stripe può reinviare lo
// stesso evento più volte).
//
// La transizione di stato (conferma / gestione hold scaduto / race col
// cron) è delegata a lib/prenotazioni/confermaPrenotazione.js (condivisa
// col completamento pagamento Nexi, 02/09/2026) — qui restano solo le
// parti specifiche di Stripe: verifica firma, rimborso via
// stripe.refunds.create() sui casi 'race'/'scaduta', e l'invio email.

const pool = require('../config/db');
const stripe = require('../lib/stripeClient');
const { confermaPrenotazione } = require('../lib/prenotazioni/confermaPrenotazione');
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

  let risultato;
  try {
    risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: paymentIntent.id });
  } catch (err) {
    console.error('webhook stripe error:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }

  if (risultato.esito === 'gia_gestita' || risultato.esito === 'non_trovata') {
    return res.status(200).json({ ricevuto: true });
  }

  if (risultato.esito === 'race' || risultato.esito === 'scaduta') {
    // BUGFIX 20/08/2026 (sera, trovato in code review) — race cron/webhook:
    // il cron di scadenza hold (backend/jobs/scadenzaHoldBookingEngine.js,
    // ogni minuto) può marcare la prenotazione 'interrotta' PRIMA che
    // questo webhook venga elaborato, senza sapere che il pagamento è nel
    // frattempo riuscito su Stripe (il cron, per scelta, non chiama mai
    // Stripe — vedi commento in cima al job). Stessa filosofia per il caso
    // 'scaduta' (pagamento arrivato dopo i 15 minuti): rimborso automatico
    // senza provare a far rivivere la prenotazione (la camera potrebbe
    // essere già stata riassegnata).
    await pool.query(`UPDATE pagamenti SET stato = 'rimborsato' WHERE id = $1`, [risultato.pagamentoId]);
    await stripe.refunds.create({ payment_intent: paymentIntent.id });
    if (risultato.esito === 'race') {
      console.error(
        `[webhook stripe] race cron/scadenza hold: prenotazione ${prenotazioneId} era già stata interrotta quando il pagamento è arrivato — rimborsato automaticamente, verificare manualmente lo stato della camera.`
      );
    }
    inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
      console.error('invio notifica hold scaduto — errore imprevisto:', err.message);
    });
    return res.status(200).json({ ricevuto: true, rimborsato: true });
  }

  // risultato.esito === 'confermata' da qui in poi — stesso comportamento di prima.

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
}

module.exports = { webhook };
