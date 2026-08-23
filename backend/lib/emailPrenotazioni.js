// Email automatiche di prenotazione — modulo 5.3, parte email (04/08/2026).
// Tre momenti: conferma (chiamata da prenotazioniController.aggiornaStato
// alla transizione verso 'confermata'), promemoria pre-arrivo e richiesta
// recensione post-partenza (chiamate dal job giornaliero
// backend/jobs/promemoriaEmail.js). Ogni funzione è "best effort": se manca
// un destinatario, se Resend non è configurato o la chiamata fallisce, si
// logga e si torna senza lanciare — non deve MAI far fallire una transizione
// di stato o bloccare il job. Ognuna ritorna comunque { ok, motivo? }: i
// chiamanti fire-and-forget (aggiornaStato, il job) lo ignorano, ma serve al
// pulsante di test manuale (prenotazioniController.testEmail, 04/08/2026)
// per mostrare all'admin/titolare l'esito reale invece di un semplice 200.
//
// Oggetto/corpo (04/08/2026, estensione): letti da email_template, non più
// hardcoded qui — modificabili da Impostazioni ▸ Testi email
// (emailTemplateController.js). Il layout HTML (involucro + footer) è
// condiviso con le offerte dedicate, vedi backend/lib/emailLayout.js.
//
// Pre check-in self-service (04/08/2026, modulo 5.2 Fase B): il promemoria
// include anche il link di pre check-in, SOLO se non è già stato inviato a
// mano prima (prenotazioni.pre_checkin_inviato_at ancora NULL) — vedi
// inviaPromemoriaPreArrivo. inviaInvitoPreCheckin è l'invio standalone,
// chiamato dal pulsante manuale in reception.

const pool = require('../config/db');
const { inviaEmail } = require('./resendClient');
const { NOME_HOTEL, escapeTesto, renderizzaCorpoEmail, involucroHtml, contienePlaceholder, bloccoLinkPreCheckin } = require('./emailLayout');
const { assicuraToken } = require('./preCheckin');

// Trova il destinatario dell'email per una prenotazione: il referente del
// gruppo se la prenotazione appartiene a un gruppo (gruppi_prenotazione,
// pagamento/contatto unico), altrimenti l'ospite intestatario del primo
// soggiorno (quello creato in prenotazioniController.crea come
// capofamiglia, tipo_alloggiato='17'). Nessun invio se non c'è un'email.
// Include anche il telefono (19/08/2026, estensione mail di conferma
// arricchita) — solo per la sezione "Dati cliente", nessun cambio al
// comportamento di scelta del destinatario.
async function recuperaDestinatario(prenotazioneId) {
  const result = await pool.query(
    `SELECT g.referente_email, g.referente_nome, g.referente_telefono,
            o.email AS ospite_email, o.nome AS ospite_nome, o.cognome AS ospite_cognome, o.telefono AS ospite_telefono
     FROM prenotazioni p
     LEFT JOIN gruppi_prenotazione g ON g.id = p.gruppo_id
     LEFT JOIN LATERAL (
       SELECT s.ospite_id
       FROM soggiorni s
       WHERE s.prenotazione_id = p.id AND s.cancellato = false
       ORDER BY s.data_arrivo
       LIMIT 1
     ) primo ON true
     LEFT JOIN ospiti o ON o.id = primo.ospite_id
     WHERE p.id = $1`,
    [prenotazioneId]
  );
  if (!result.rows.length) return null;
  const r = result.rows[0];

  if (r.referente_email) {
    return { email: r.referente_email, nome: r.referente_nome || 'Gentile ospite', telefono: r.referente_telefono || null };
  }
  if (r.ospite_email) {
    return {
      email: r.ospite_email,
      nome: `${r.ospite_nome ?? ''} ${r.ospite_cognome ?? ''}`.trim() || 'Gentile ospite',
      telefono: r.ospite_telefono || null,
    };
  }
  return null;
}

// Elenco soggiorni (tipo camera + date) di una prenotazione, per il corpo
// dell'email — non cancellati, ordinati per data di arrivo. Include anche
// num_ospiti/tariffa_totale (19/08/2026) per la stima della tassa di
// soggiorno e per la tabella dettagliata della mail di conferma. Mostra il
// TIPO camera (tipi_camera.nome), MAI più il numero fisico della camera
// (rimosso il 19/08/2026 su richiesta esplicita del titolare, da tutte le
// mail — prima poteva cambiare per riassegnazione prima del check-in).
async function recuperaSoggiorni(prenotazioneId) {
  // tipo_camera_nome: preferisce sempre s.tipo_camera_venduto_id (identità
  // realmente venduta, migration 050 — shared inventory 19/08/2026) e
  // ricade sull'etichetta fisica di default della camera (c.tipo_camera_id)
  // solo per i soggiorni storici che non hanno quel dato. Senza questa
  // preferenza, una prenotazione "Singola" finita per shared inventory su
  // una camera etichettata "Matrimoniale Piccola" mostrerebbe il nome
  // sbagliato in mail/planning.
  const result = await pool.query(
    `SELECT c.numero AS camera_numero, c.nome AS camera_nome,
            COALESCE(tcv.nome, tc.nome) AS tipo_camera_nome,
            s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale, s.composizione_ospiti, s.trattamento
     FROM soggiorni s
     JOIN camere c ON c.id = s.camera_id
     LEFT JOIN tipi_camera tc ON tc.id = c.tipo_camera_id
     LEFT JOIN tipi_camera tcv ON tcv.id = s.tipo_camera_venduto_id
     WHERE s.prenotazione_id = $1 AND s.cancellato = false
     ORDER BY s.data_arrivo`,
    [prenotazioneId]
  );
  return result.rows;
}

function formattaData(data) {
  // data arriva già come stringa 'YYYY-MM-DD' (types.setTypeParser su DATE, config/db.js)
  const [anno, mese, giorno] = String(data).split('-');
  return `${giorno}/${mese}/${anno}`;
}

// Nome camera da mostrare in mail: SEMPRE il tipo (es. "Family Suite"), mai
// il numero fisico — vedi commento su recuperaSoggiorni.
function nomeCameraVisibile(s) {
  return s.tipo_camera_nome || s.camera_nome || 'Camera';
}

// Trattamento (Modulo tariffe derivate, 20/08/2026) — nessuna etichetta per
// 'bb' (il default silenzioso di sempre, non serve segnalarlo), solo per le
// scelte esplicite mezza pensione/pensione completa.
const ETICHETTA_TRATTAMENTO = {
  mezza_pensione: 'Mezza pensione',
  pensione_completa: 'Pensione completa',
};
function suffissoTrattamento(s) {
  const etichetta = ETICHETTA_TRATTAMENTO[s.trattamento];
  return etichetta ? ` — ${etichetta}` : '';
}

function elencoSoggiorniHtml(soggiorni) {
  return `<ul>${soggiorni
    .map(s => `<li>${escapeTesto(nomeCameraVisibile(s))}${escapeTesto(suffissoTrattamento(s))} — dal ${formattaData(s.data_arrivo)} al ${formattaData(s.data_partenza)}</li>`)
    .join('')}</ul>`;
}

// Numero di notti tra due date 'YYYY-MM-DD' — stesso formato di formattaData.
function numeroNotti(dataArrivo, dataPartenza) {
  return Math.round((new Date(dataPartenza) - new Date(dataArrivo)) / 86400000);
}

// Tassa di soggiorno per la mail di conferma. Legge sempre l'aliquota
// vigente da configurazione_tassa_soggiorno (stessa fonte del modulo 2.4
// operativo, mai un numero duplicato a mano — se il titolare cambia
// l'aliquota da Impostazioni ▸ Tassa di Soggiorno, la mail la segue in
// automatico).
//
// Estesa il 19/08/2026 (Booking Engine v2, Fase A — composizione ospiti): se
// il soggiorno ha soggiorni.composizione_ospiti (adulti + età di ogni
// bambino, raccolti dal Booking Engine Diretto), il calcolo per QUEL
// soggiorno è ESATTO — applica l'esenzione età reale, come farebbe
// tassaSoggiornoController.calcola in hotel. Per i soggiorni senza questo
// dato (prenotazioni telefoniche/preesistenti, o prenotazioni web fatte
// prima di questa estensione) resta una stima sul numero totale di ospiti,
// senza esenzioni — comportamento identico a prima. Se anche un solo
// soggiorno della prenotazione usa la stima, l'intero importo resta
// etichettato "indicativo" nella mail: più onesto che dichiarare "esatto"
// un totale che in parte non lo è. Ritorna importo: null se non c'è nessuna
// configurazione vigente, per non mostrare mai un numero inventato.
async function calcolaTassaSoggiorno(soggiorni) {
  try {
    const configRes = await pool.query(
      `SELECT importo_a_notte, eta_esente_fino, notti_max_tassabili FROM configurazione_tassa_soggiorno
       WHERE valido_dal <= CURRENT_DATE AND (valido_al IS NULL OR valido_al >= CURRENT_DATE)
       ORDER BY valido_dal DESC LIMIT 1`
    );
    if (!configRes.rows.length) return { importo: null, esatta: false };
    const { importo_a_notte, eta_esente_fino, notti_max_tassabili } = configRes.rows[0];

    let totale = 0;
    let tutteEsatte = true;
    for (const s of soggiorni) {
      const notti = numeroNotti(s.data_arrivo, s.data_partenza);
      const nottiTassabili = notti_max_tassabili ? Math.min(notti, notti_max_tassabili) : notti;

      if (s.composizione_ospiti && Array.isArray(s.composizione_ospiti.bambini_eta)) {
        const adulti = Number(s.composizione_ospiti.adulti) || 0;
        const bambiniTassabili = eta_esente_fino == null
          ? s.composizione_ospiti.bambini_eta.length
          : s.composizione_ospiti.bambini_eta.filter(eta => eta > eta_esente_fino).length;
        totale += Number(importo_a_notte) * (adulti + bambiniTassabili) * nottiTassabili;
      } else {
        tutteEsatte = false;
        totale += Number(importo_a_notte) * (s.num_ospiti || 1) * nottiTassabili;
      }
    }
    return { importo: Math.round(totale * 100) / 100, esatta: tutteEsatte };
  } catch (err) {
    console.error('[email] calcolo tassa di soggiorno — errore imprevisto:', err.message);
    return { importo: null, esatta: false };
  }
}

// Tabella "Dati cliente" (19/08/2026, mail di conferma arricchita).
function datiClienteHtml(destinatario) {
  return `<h3 style="color:#0a3d5c; font-size:15px; margin:20px 0 8px;">Dati cliente</h3>
    <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Nome e cognome</td><td style="padding:4px 0;">${escapeTesto(destinatario.nome)}</td></tr>
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Email</td><td style="padding:4px 0;">${escapeTesto(destinatario.email)}</td></tr>
      ${destinatario.telefono ? `<tr><td style="padding:4px 8px 4px 0; color:#666;">Telefono</td><td style="padding:4px 0;">${escapeTesto(destinatario.telefono)}</td></tr>` : ''}
    </table>`;
}

const STATO_LABEL = {
  opzione: 'In attesa di conferma',
  confermata: 'Confermata',
  check_in: 'Check-in effettuato',
  check_out: 'Check-out effettuato',
  chiusa: 'Conclusa',
  interrotta: 'Annullata',
};

// Tabella "Riepilogo prenotazione" — codice, stato, arrivo/partenza
// complessivi (min/max su tutti i soggiorni, per le prenotazioni
// multi-camera).
function riepilogoPrenotazioneHtml(prenotazione, soggiorni, pagamentoConfermato) {
  const arrivo = soggiorni.reduce((min, s) => (!min || s.data_arrivo < min ? s.data_arrivo : min), null);
  const partenza = soggiorni.reduce((max, s) => (!max || s.data_partenza > max ? s.data_partenza : max), null);
  const statoLabel = STATO_LABEL[prenotazione.stato] || prenotazione.stato;
  const statoTesto = pagamentoConfermato ? `${statoLabel} (pagamento ricevuto)` : statoLabel;
  return `<h3 style="color:#0a3d5c; font-size:15px; margin:20px 0 8px;">Riepilogo prenotazione</h3>
    <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Codice prenotazione</td><td style="padding:4px 0;">#${prenotazione.id}</td></tr>
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Stato prenotazione</td><td style="padding:4px 0;">${escapeTesto(statoTesto)}</td></tr>
      ${arrivo && partenza ? `<tr><td style="padding:4px 8px 4px 0; color:#666;">Arrivo e partenza</td><td style="padding:4px 0;">${formattaData(arrivo)} — ${formattaData(partenza)}</td></tr>` : ''}
    </table>`;
}

// Tabella "Dettagli prenotazione" — una riga per camera (TIPO, mai numero,
// vedi nomeCameraVisibile) con il relativo prezzo già calcolato al momento
// della prenotazione (soggiorni.tariffa_totale), più la tassa di soggiorno
// (esatta o indicativa, vedi calcolaTassaSoggiorno) e il totale complessivo.
// tassa: { importo: number|null, esatta: boolean }.
function dettagliPrenotazioneHtml(soggiorni, tassa) {
  const righeCamera = soggiorni
    .map(s => `<tr><td style="padding:4px 0;">${escapeTesto(nomeCameraVisibile(s))}${escapeTesto(suffissoTrattamento(s))} — dal ${formattaData(s.data_arrivo)} al ${formattaData(s.data_partenza)}</td><td style="padding:4px 0; text-align:right; white-space:nowrap;">€${Number(s.tariffa_totale ?? 0).toFixed(2)}</td></tr>`)
    .join('');
  const totaleCamere = soggiorni.reduce((somma, s) => somma + Number(s.tariffa_totale ?? 0), 0);
  const totaleComplessivo = totaleCamere + (tassa.importo ?? 0);
  const etichettaTassa = tassa.esatta
    ? 'Tassa di soggiorno'
    : 'Tassa di soggiorno (importo indicativo, calcolata definitivamente in hotel)';
  return `<h3 style="color:#0a3d5c; font-size:15px; margin:20px 0 8px;">Dettagli prenotazione</h3>
    <table style="width:100%; border-collapse:collapse;">
      ${righeCamera}
      ${tassa.importo != null ? `<tr><td style="padding:4px 0; color:#666;">${etichettaTassa}</td><td style="padding:4px 0; text-align:right; white-space:nowrap;">€${tassa.importo.toFixed(2)}</td></tr>` : ''}
      <tr style="border-top:1px solid #eee; font-weight:bold;"><td style="padding:8px 0 4px;">Totale prenotazione</td><td style="padding:8px 0 4px; text-align:right; white-space:nowrap;">€${totaleComplessivo.toFixed(2)}</td></tr>
    </table>`;
}

// Tabella "Modalità di pagamento" — SOLO per prenotazioni pagate online
// (Booking Engine Diretto): dettagliPagamento arriva dal webhook Stripe
// (stripeWebhookController.js), che lo recupera al volo da
// stripe.paymentMethods.retrieve subito dopo la conferma — NESSUNA nuova
// colonna nel database, dato sempre fresco da Stripe, mai duplicato. Per le
// prenotazioni telefoniche dettagliPagamento è undefined e questa sezione
// non compare affatto, correttamente: non c'è stato nessun pagamento online.
function modalitaPagamentoHtml(dettagliPagamento, importoTotaleCamere) {
  const { titolare, circuito, ultime4, importoCaparra, dataPagamento } = dettagliPagamento;
  const saldo = Math.round((importoTotaleCamere - importoCaparra) * 100) / 100;
  const dataFormattata = dataPagamento.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<h3 style="color:#0a3d5c; font-size:15px; margin:20px 0 8px;">Modalità di pagamento</h3>
    <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Pagamento caparra</td><td style="padding:4px 0;">Carta di credito${circuito ? ` (${escapeTesto(circuito)} termina con ${escapeTesto(ultime4 ?? '')})` : ''}</td></tr>
      ${titolare ? `<tr><td style="padding:4px 8px 4px 0; color:#666;">Titolare carta</td><td style="padding:4px 0;">${escapeTesto(titolare)}</td></tr>` : ''}
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Data pagamento</td><td style="padding:4px 0;">${escapeTesto(dataFormattata)}</td></tr>
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Caparra versata</td><td style="padding:4px 0;">€${importoCaparra.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 8px 4px 0; color:#666;">Saldo da versare in hotel</td><td style="padding:4px 0;">€${saldo.toFixed(2)}</td></tr>
    </table>`;
}

// Termini di cancellazione (Booking Engine v2, Fase C — 19/08/2026): letti
// da impostazioni_email.termini_cancellazione, editabili da Impostazioni ▸
// Testi email — stessa fonte usata da GET /api/booking-pubblico/termini-
// cancellazione per mostrarli su /prenota prima del pagamento, mai testo
// duplicato tra email e sito. Il default scritto dalla migration 047 è un
// segnaposto esplicito ([DA COMPLETARE...]) finché il titolare non inserisce
// la policy reale (percentuali di penale, giorni di preavviso) — non
// inventarla mai qui.
async function recuperaTerminiCancellazione() {
  try {
    const result = await pool.query('SELECT termini_cancellazione FROM impostazioni_email WHERE id = 1', []);
    return result.rows[0]?.termini_cancellazione || null;
  } catch (err) {
    console.error('[email] lettura termini di cancellazione — errore imprevisto:', err.message);
    return null;
  }
}

function terminiCancellazioneHtml(testo) {
  if (!testo) return '';
  return `<h3 style="color:#0a3d5c; font-size:15px; margin:20px 0 8px;">Termini di cancellazione</h3>
    <p style="margin:0 0 12px; white-space:pre-line;">${escapeTesto(testo)}</p>`;
}

// Legge oggetto/corpo del template dal DB. Se manca (DB non ancora
// migrato, o riga cancellata a mano) usa un fallback minimo — non deve mai
// far fallire l'invio per un problema di configurazione del testo.
async function recuperaTemplate(tipo) {
  const result = await pool.query('SELECT oggetto, corpo FROM email_template WHERE tipo = $1', [tipo]);
  if (result.rows.length) return result.rows[0];
  return { oggetto: `${NOME_HOTEL}`, corpo: 'Gentile {nome_ospite},\n\n{elenco_soggiorni}' };
}

// Conferma prenotazione — invio immediato alla transizione verso 'confermata'.
// Estesa il 19/08/2026 (segnalazioni di Marco dopo il primo test reale del
// Booking Engine Diretto): riepilogo arricchito (dati cliente, riepilogo
// prenotazione, dettagli con prezzo per camera + tassa di soggiorno stimata,
// modalità di pagamento) al posto del semplice elenco camere di prima.
// dettagliPagamento è opzionale — lo passa SOLO il webhook Stripe
// (stripeWebhookController.js) per le prenotazioni pagate online; per le
// prenotazioni telefoniche (prenotazioniController.aggiornaStato, che non lo
// passa) la sezione "Modalità di pagamento" non compare, correttamente.
// Retrocompatibile con template esistenti in email_template che citano
// ancora solo {elenco_soggiorni}: quel placeholder ora riceve la tabella
// arricchita invece del semplice elenco puntato. I blocchi non citati nel
// testo del template vengono comunque aggiunti in coda, stesso principio già
// in uso per {link_pre_checkin} — l'ospite riceve sempre tutte le
// informazioni anche se il titolare non ha ancora aggiornato il testo da
// Impostazioni ▸ Testi email.
async function inviaConfermaPrenotazione(prenotazioneId, { dettagliPagamento } = {}) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] conferma prenotazione ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const soggiorni = await recuperaSoggiorni(prenotazioneId);
    const prenotazioneRes = await pool.query('SELECT id, stato FROM prenotazioni WHERE id = $1', [prenotazioneId]);
    const prenotazione = prenotazioneRes.rows[0] || { id: prenotazioneId, stato: 'confermata' };
    const tassa = await calcolaTassaSoggiorno(soggiorni);
    const totaleCamere = soggiorni.reduce((somma, s) => somma + Number(s.tariffa_totale ?? 0), 0);

    const template = await recuperaTemplate('conferma');
    let corpo = renderizzaCorpoEmail(template.corpo, {
      nomeOspite: destinatario.nome,
      blocchiHtml: {
        elenco_soggiorni: dettagliPrenotazioneHtml(soggiorni, tassa),
        dati_cliente: datiClienteHtml(destinatario),
        riepilogo_prenotazione: riepilogoPrenotazioneHtml(prenotazione, soggiorni, !!dettagliPagamento),
        dettagli_prenotazione: dettagliPrenotazioneHtml(soggiorni, tassa),
        ...(dettagliPagamento ? { modalita_pagamento: modalitaPagamentoHtml(dettagliPagamento, totaleCamere) } : {}),
      },
    });

    if (!contienePlaceholder(template.corpo, 'dati_cliente')) {
      corpo += datiClienteHtml(destinatario);
    }
    if (!contienePlaceholder(template.corpo, 'riepilogo_prenotazione')) {
      corpo += riepilogoPrenotazioneHtml(prenotazione, soggiorni, !!dettagliPagamento);
    }
    if (!contienePlaceholder(template.corpo, 'elenco_soggiorni') && !contienePlaceholder(template.corpo, 'dettagli_prenotazione')) {
      corpo += dettagliPrenotazioneHtml(soggiorni, tassa);
    }
    if (dettagliPagamento && !contienePlaceholder(template.corpo, 'modalita_pagamento')) {
      corpo += modalitaPagamentoHtml(dettagliPagamento, totaleCamere);
    }
    const terminiCancellazione = await recuperaTerminiCancellazione();
    corpo += terminiCancellazioneHtml(terminiCancellazione);

    const html = await involucroHtml(template.oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto: template.oggetto, html });
    if (!esito.ok) {
      console.error(`[email] conferma prenotazione ${prenotazioneId} non inviata:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    await pool.query('UPDATE prenotazioni SET email_conferma_inviata_at = NOW() WHERE id = $1', [prenotazioneId]);
    return { ok: true, destinatario: destinatario.email };
  } catch (err) {
    console.error(`[email] conferma prenotazione ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

// Promemoria pre-arrivo — chiamata dal job giornaliero. Include anche il
// link di pre check-in (stessa email, come richiesto dal titolare) SOLO se
// non è già stato inviato a mano prima da reception — altrimenti l'ospite
// riceverebbe due inviti diversi. Se il template 'promemoria' non contiene
// {link_pre_checkin}, il blocco viene comunque aggiunto in coda (mai perso
// per un testo non aggiornato).
async function inviaPromemoriaPreArrivo(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] promemoria prenotazione ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const soggiorni = await recuperaSoggiorni(prenotazioneId);
    const template = await recuperaTemplate('promemoria');

    const giaInviatoPreCheckin = await pool.query('SELECT pre_checkin_inviato_at FROM prenotazioni WHERE id = $1', [prenotazioneId]);
    const includiLinkPreCheckin = giaInviatoPreCheckin.rows.length && !giaInviatoPreCheckin.rows[0].pre_checkin_inviato_at;
    const linkPreCheckin = includiLinkPreCheckin ? await assicuraToken(prenotazioneId) : null;

    let corpo = renderizzaCorpoEmail(template.corpo, {
      nomeOspite: destinatario.nome,
      blocchiHtml: {
        elenco_soggiorni: elencoSoggiorniHtml(soggiorni),
        ...(linkPreCheckin ? { link_pre_checkin: bloccoLinkPreCheckin(linkPreCheckin) } : {}),
      },
    });
    if (linkPreCheckin && !contienePlaceholder(template.corpo, 'link_pre_checkin')) {
      corpo += bloccoLinkPreCheckin(linkPreCheckin);
    }

    const html = await involucroHtml(template.oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto: template.oggetto, html });
    if (!esito.ok) {
      console.error(`[email] promemoria prenotazione ${prenotazioneId} non inviato:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    await pool.query(
      `UPDATE prenotazioni SET email_promemoria_inviata_at = NOW()
       ${linkPreCheckin ? ', pre_checkin_inviato_at = NOW()' : ''}
       WHERE id = $1`,
      [prenotazioneId]
    );
    return { ok: true, destinatario: destinatario.email, linkPreCheckinIncluso: !!linkPreCheckin };
  } catch (err) {
    console.error(`[email] promemoria prenotazione ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

// Invito standalone al pre check-in — chiamato dal pulsante manuale in
// reception (prenotazioniController.inviaPreCheckin). Genera sempre un
// nuovo token (invalidando un eventuale link precedente) e marca
// pre_checkin_inviato_at, così il job del promemoria non lo include una
// seconda volta.
async function inviaInvitoPreCheckin(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] invito pre check-in prenotazione ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const link = await assicuraToken(prenotazioneId);
    if (!link) {
      return { ok: false, motivo: 'Prenotazione non trovata.' };
    }
    const template = await recuperaTemplate('pre_checkin');
    let corpo = renderizzaCorpoEmail(template.corpo, {
      nomeOspite: destinatario.nome,
      blocchiHtml: { link_pre_checkin: bloccoLinkPreCheckin(link) },
    });
    if (!contienePlaceholder(template.corpo, 'link_pre_checkin')) {
      corpo += bloccoLinkPreCheckin(link);
    }
    const html = await involucroHtml(template.oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto: template.oggetto, html });
    if (!esito.ok) {
      console.error(`[email] invito pre check-in prenotazione ${prenotazioneId} non inviato:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    await pool.query('UPDATE prenotazioni SET pre_checkin_inviato_at = NOW() WHERE id = $1', [prenotazioneId]);
    return { ok: true, destinatario: destinatario.email };
  } catch (err) {
    console.error(`[email] invito pre check-in prenotazione ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

// Richiesta recensione post-partenza — chiamata dal job giornaliero.
async function inviaRichiestaRecensione(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] recensione prenotazione ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const template = await recuperaTemplate('recensione');
    const corpo = renderizzaCorpoEmail(template.corpo, { nomeOspite: destinatario.nome });
    const html = await involucroHtml(template.oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto: template.oggetto, html });
    if (!esito.ok) {
      console.error(`[email] recensione prenotazione ${prenotazioneId} non inviata:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    await pool.query('UPDATE prenotazioni SET email_recensione_inviata_at = NOW() WHERE id = $1', [prenotazioneId]);
    return { ok: true, destinatario: destinatario.email };
  } catch (err) {
    console.error(`[email] recensione prenotazione ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

// Notifica di rimborso automatico per un hold scaduto (Booking Engine
// Diretto, 19/08/2026) — caso limite deciso esplicitamente da Marco il
// 19/08/2026: se il pagamento Stripe arriva dopo la scadenza del blocco
// (15 minuti), si rimborsa sempre, nessuna eccezione per onorare la
// prenotazione. Testo fisso, NON gestito da Impostazioni ▸ Testi email
// come le altre tre email (conferma/promemoria/recensione) — evento raro,
// non giustifica un quarto template configurabile per l'MVP di questo
// modulo. Stesso principio "best effort" delle altre funzioni di questo
// file: non deve mai far fallire il webhook che la chiama.
// Fix 23/08/2026 (code review 22/08, Tier 2): a differenza delle altre
// email di questo file, questa NON passa da renderizzaCorpoEmail (che
// scappa nomeOspite internamente via testoInHtml) — destinatario.nome
// veniva interpolato crudo nell'HTML. È un dato che l'ospite del Booking
// Engine Diretto inserisce da sé nel form pubblico (o il referente di un
// gruppo), quindi raggiungibile da un visitatore anonimo: aggiunto
// escapeTesto esplicito, stesso trattamento già usato per tutti gli altri
// campi utente di questo file (vedi datiClienteHtml).
async function inviaNotificaHoldScaduto(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] notifica hold scaduto ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const oggetto = `${NOME_HOTEL} — richiesta di prenotazione non confermata in tempo`;
    const corpo = `<p>Gentile ${escapeTesto(destinatario.nome)},</p>
      <p>il pagamento della caparra è arrivato oltre il tempo massimo previsto (15 minuti) per confermare la disponibilità della camera, che nel frattempo potrebbe essere stata prenotata da un altro ospite.</p>
      <p>L'importo addebitato è stato rimborsato automaticamente sulla stessa carta utilizzata — il rimborso comparirà sull'estratto conto entro alcuni giorni lavorativi, secondo i tempi della banca.</p>
      <p>Se desidera riprovare, può ripetere la prenotazione dal sito o contattarci direttamente.</p>`;
    const html = await involucroHtml(oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto, html });
    if (!esito.ok) {
      console.error(`[email] notifica hold scaduto ${prenotazioneId} non inviata:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    return { ok: true, destinatario: destinatario.email };
  } catch (err) {
    console.error(`[email] notifica hold scaduto ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

module.exports = { inviaConfermaPrenotazione, inviaPromemoriaPreArrivo, inviaRichiestaRecensione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto };
