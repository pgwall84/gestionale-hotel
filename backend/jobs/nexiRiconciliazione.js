// backend/jobs/nexiRiconciliazione.js
// Rete di sicurezza per il pagamento Nexi XPay Build del Booking Engine
// Diretto — a differenza di Stripe, XPay Build "pagamento base" (carta via
// pagaNonce) non offre un webhook/notifica server-to-server: il campo
// urlPost è documentato solo per i metodi di pagamento alternativi (vedi
// sito-hotel/docs/specifichetecniche.NEXI.20.4_0.pdf, pag. 163-164 e 174 —
// "la gestione dell'esito è affidata al merchant" tramite parsing sincrono
// della risposta di pagaNonce, in bookingPagamentoNexiController.js).
//
// Se quella chiamata server-to-server si interrompe per un problema di
// rete o un riavvio del processo DOPO che Nexi ha già autorizzato/incassato
// la carta, il pagamento resta 'pending' per sempre — nessuno lo scopre da
// solo, a differenza di Stripe dove arriverebbe comunque il webhook.
//
// Questo job interroga Nexi (ecomm/api/bo/situazioneOrdine, tramite
// nexiProvider.interrogaOrdine) per ogni pagamento Nexi ancora 'pending'
// più vecchio di ETA_MINIMA_SECONDI, e:
//   - se Nexi dice che l'ordine non è (ancora) andato a buon fine: non fa
//     nulla, riprova al giro successivo — non marchiamo mai 'fallito' su
//     un dato incerto, lasciamo che sia il cron di scadenza hold
//     (scadenzaHoldBookingEngine.js) a interrompere la prenotazione quando
//     l'opzione scade davvero.
//   - se Nexi conferma il pagamento: richiama la STESSA confermaPrenotazione()
//     già usata dal webhook Stripe e dal completamento diretto Nexi — se
//     l'opzione è ancora valida, la conferma esattamente come un checkout
//     riuscito (email compresa); se è nel frattempo scaduta (camera
//     potenzialmente riassegnata), storna il pagamento su Nexi
//     (nexiProvider.stornaOrdine) e avvisa via email — stesso comportamento
//     già implementato per Stripe con stripe.refunds.create().
//
// NOTA: questo non ha nulla a che vedere con "Incasso senza Pensieri"
// (prodotto Nexi per garanzie no-show, decisione ancora bloccata — vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md) —
// qui si storna solo una transazione già autorizzata, con l'endpoint
// standard sempre disponibile.
//
// VERIFICATO IN SANDBOX (16/09/2026, transactionId TEST1789580024707,
// tramite scripts/nexi-verifica-manuale.js): situazioneOrdine per un
// ordine autorizzato con successo risponde con "stato": "Autorizzato"
// dentro esito.report[0] — NON a livello radice, NON su esito.report come
// oggetto (report è un array). Il confronto case-insensitive permissivo
// sotto ("autorizzat"/"contabilizzat"/"pagat") copre il valore osservato;
// "Contabilizzato" resta un'ipotesi per lo stato di un ordine "chiuso"
// contabilmente (non osservato in questo test, citato solo nel testo
// prosa dello spec Nexi per altri flussi) — se un giorno risultasse
// sbagliato, il primo sintomo sarebbe un pagamento riuscito che il job
// non recupera mai, esattamente come il bug sul path di lettura corretto
// qui sotto lo stesso giorno.
//
// Girato ogni 2 minuti (più frequente degli altri job di riconciliazione:
// qui il tempo conta — la finestra utile per "salvare" la prenotazione
// invece di doverla rimborsare è il TTL dell'opzione, 15 minuti, vedi
// jobs/scadenzaHoldBookingEngine.js).
// Avviato solo da server.js, mai da app.js — stesso motivo degli altri job
// (app.js è importato anche dai test Jest/Supertest, un cron avviato lì
// girerebbe anche durante la suite di test).

const cron = require('node-cron');
const pool = require('../config/db');
const nexiProvider = require('../lib/payments/nexiProvider');
const { confermaPrenotazione } = require('../lib/prenotazioni/confermaPrenotazione');
const { inviaConfermaPrenotazione, inviaNotificaHoldScaduto, inviaNotificaPagamentoDuplicatoRimborsato } = require('../lib/emailPrenotazioni');

// Non interroghiamo un pagamento appena creato: il completamento sincrono
// normale (bookingPagamentoNexiController.completaPagamentoNexi) è quasi
// certamente ancora in corso nei primi secondi.
const ETA_MINIMA_SECONDI = 90;

function pagamentoRiuscitoSecondoNexi(esito) {
  // BUGFIX (16/09/2026, trovato verificando con un test reale): situazioneOrdine
  // restituisce lo stato dentro il primo elemento dell'array `report`, non su
  // esito.stato né su esito.report.stato (report è un array, non un oggetto)
  // — prima di questa correzione la funzione tornava sempre false anche su un
  // pagamento autorizzato con successo, vanificando l'intera riconciliazione.
  const primoTentativo = esito && Array.isArray(esito.report) ? esito.report[0] : null;
  const stato = String((primoTentativo && primoTentativo.stato) || '').toLowerCase();
  return stato.includes('autorizzat') || stato.includes('contabilizzat') || stato.includes('pagat');
}

async function riconciliaPagamento(pagamento) {
  const { id: pagamentoId, prenotazione_id: prenotazioneId, importo, external_payment_id: transactionId } = pagamento;

  let risposta;
  try {
    risposta = await nexiProvider.interrogaOrdine({ transactionId });
  } catch (err) {
    console.error(`[riconciliazione nexi] interrogazione ordine fallita per pagamento ${pagamentoId} (transazione ${transactionId}):`, err.message);
    return;
  }

  if (!pagamentoRiuscitoSecondoNexi(risposta.esito)) {
    return;
  }

  let risultato;
  try {
    risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: transactionId });
  } catch (err) {
    console.error(`[riconciliazione nexi] confermaPrenotazione fallita per prenotazione ${prenotazioneId} (pagamento ${pagamentoId}):`, err);
    return;
  }

  if (risultato.esito === 'confermata') {
    console.log(`[riconciliazione nexi] prenotazione ${prenotazioneId} confermata in ritardo — pagamento ${pagamentoId} recuperato dopo un completamento mai arrivato dal client.`);
    inviaConfermaPrenotazione(prenotazioneId, {}).catch(err => {
      console.error('[riconciliazione nexi] invio email conferma — errore imprevisto:', err.message);
    });
    return;
  }

  if (risultato.esito === 'race' || risultato.esito === 'scaduta') {
    const idPagamentoDaAggiornare = risultato.pagamentoId || pagamentoId;
    try {
      await nexiProvider.stornaOrdine({ transactionId, importoEuro: Number(importo) });
      await pool.query(`UPDATE pagamenti SET stato = 'rimborsato' WHERE id = $1`, [idPagamentoDaAggiornare]);
      console.error(`[riconciliazione nexi] prenotazione ${prenotazioneId} non più valida (${risultato.esito}) quando il pagamento Nexi è stato recuperato — stornato automaticamente.`);
    } catch (err) {
      // BUGFIX-style try/catch (stesso principio già applicato in
      // stripeWebhookController.js il 07/09/2026): un errore qui (rete o
      // API Nexi) non deve piantare il giro di riconciliazione — il
      // pagamento resta segnalato per intervento manuale invece di
      // sparire silenziosamente.
      await pool.query(`UPDATE pagamenti SET stato = 'richiede_rimborso_manuale' WHERE id = $1`, [idPagamentoDaAggiornare]);
      console.error(`[riconciliazione nexi] storno automatico fallito per pagamento ${pagamentoId} (prenotazione ${prenotazioneId}) — richiede intervento manuale da backoffice Nexi:`, err.message);
    }
    // BUGFIX (16/09/2026, trovato testando manualmente questo job): 'race'
    // copre sia "il cron ha già scaduto l'hold" (statoPrenotazione
    // 'interrotta' — la mail "hold scaduto" è corretta) sia "la prenotazione
    // è già confermata da un altro pagamento, questo è un doppio pagamento
    // in ritardo" (statoPrenotazione 'confermata' — "hold scaduto" sarebbe
    // fuorviante per un ospite con la prenotazione regolarmente confermata).
    // 'scaduta' resta sempre hold scaduto per davvero. Vedi
    // lib/prenotazioni/confermaPrenotazione.js per statoPrenotazione.
    const eDoppioPagamentoSuPrenotazioneConfermata = risultato.esito === 'race' && risultato.statoPrenotazione === 'confermata';
    const inviaMail = eDoppioPagamentoSuPrenotazioneConfermata ? inviaNotificaPagamentoDuplicatoRimborsato : inviaNotificaHoldScaduto;
    inviaMail(prenotazioneId).catch(err => {
      console.error('[riconciliazione nexi] invio notifica esito rimborso — errore imprevisto:', err.message);
    });
    return;
  }

  // 'gia_gestita' / 'non_trovata': un'altra via (tipicamente il
  // completamento diretto in corso in parallelo) ha già gestito tutto —
  // nessuna azione da fare qui. Log esplicito (16/09/2026, per il test
  // manuale end-to-end con scripts/nexi-esegui-riconciliazione-una-volta.js)
  // così questo branch è visibile invece di essere indistinguibile da "il
  // job non ha trovato nulla da fare".
  console.log(`[riconciliazione nexi] pagamento ${pagamentoId} (prenotazione ${prenotazioneId}) — nessuna azione: confermaPrenotazione ha risposto '${risultato.esito}'.`);
}

async function eseguiRiconciliazioneNexi() {
  let pagamenti;
  try {
    const risultato = await pool.query(
      `SELECT id, prenotazione_id, importo, external_payment_id
       FROM pagamenti
       WHERE metodo = 'nexi' AND stato = 'pending'
         AND external_payment_id IS NOT NULL
         AND created_at < NOW() - ($1 * INTERVAL '1 second')`,
      [ETA_MINIMA_SECONDI]
    );
    pagamenti = risultato.rows;
  } catch (err) {
    console.error('[riconciliazione nexi] lettura pagamenti pending fallita:', err.message);
    return;
  }

  for (const pagamento of pagamenti) {
    await riconciliaPagamento(pagamento);
  }
}

function avviaJobRiconciliazioneNexi() {
  cron.schedule('*/2 * * * *', eseguiRiconciliazioneNexi);
  console.log('[riconciliazione nexi] avviato (ogni 2 minuti)');
}

module.exports = { avviaJobRiconciliazioneNexi, eseguiRiconciliazioneNexi, riconciliaPagamento };
