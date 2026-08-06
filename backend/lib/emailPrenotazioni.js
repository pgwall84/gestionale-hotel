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
const { NOME_HOTEL, renderizzaCorpoEmail, involucroHtml, contienePlaceholder, bloccoLinkPreCheckin } = require('./emailLayout');
const { assicuraToken } = require('./preCheckin');

// Trova il destinatario dell'email per una prenotazione: il referente del
// gruppo se la prenotazione appartiene a un gruppo (gruppi_prenotazione,
// pagamento/contatto unico), altrimenti l'ospite intestatario del primo
// soggiorno (quello creato in prenotazioniController.crea come
// capofamiglia, tipo_alloggiato='17'). Nessun invio se non c'è un'email.
async function recuperaDestinatario(prenotazioneId) {
  const result = await pool.query(
    `SELECT g.referente_email, g.referente_nome,
            o.email AS ospite_email, o.nome AS ospite_nome, o.cognome AS ospite_cognome
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
    return { email: r.referente_email, nome: r.referente_nome || 'Gentile ospite' };
  }
  if (r.ospite_email) {
    return { email: r.ospite_email, nome: `${r.ospite_nome ?? ''} ${r.ospite_cognome ?? ''}`.trim() || 'Gentile ospite' };
  }
  return null;
}

// Elenco leggibile dei soggiorni (camere + date) di una prenotazione, per il
// corpo dell'email — non cancellati, ordinati per data di arrivo.
async function recuperaSoggiorni(prenotazioneId) {
  const result = await pool.query(
    `SELECT c.numero AS camera_numero, c.nome AS camera_nome, s.data_arrivo, s.data_partenza
     FROM soggiorni s
     JOIN camere c ON c.id = s.camera_id
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

function elencoSoggiorniHtml(soggiorni) {
  return `<ul>${soggiorni
    .map(s => `<li>Camera ${s.camera_numero}${s.camera_nome ? ` (${s.camera_nome})` : ''} — dal ${formattaData(s.data_arrivo)} al ${formattaData(s.data_partenza)}</li>`)
    .join('')}</ul>`;
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
async function inviaConfermaPrenotazione(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] conferma prenotazione ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const soggiorni = await recuperaSoggiorni(prenotazioneId);
    const template = await recuperaTemplate('conferma');
    const corpo = renderizzaCorpoEmail(template.corpo, { nomeOspite: destinatario.nome, blocchiHtml: { elenco_soggiorni: elencoSoggiorniHtml(soggiorni) } });
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

module.exports = { inviaConfermaPrenotazione, inviaPromemoriaPreArrivo, inviaRichiestaRecensione, inviaInvitoPreCheckin };
