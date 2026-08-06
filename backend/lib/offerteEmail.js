// Invio di offerte dedicate via email (modulo 5.3, estensione 04/08/2026,
// richiesta esplicita del titolare) — a differenza delle 3 email automatiche
// (backend/lib/emailPrenotazioni.js), qui il testo è libero (composto ogni
// volta dall'admin/titolare, non un template salvato) e i destinatari sono
// una lista di clienti, non una singola prenotazione.
//
// GDPR: SEMPRE e solo verso ospiti con consenso_marketing = true — sia in
// modalità "selezione manuale" sia "tutti i clienti con consenso". Un
// destinatario scelto a mano senza consenso viene escluso e segnalato nella
// risposta, mai inviato comunque.

const pool = require('../config/db');
const { inviaEmail } = require('./resendClient');
const { renderizzaCorpoEmail, involucroHtml } = require('./emailLayout');

// Piccola pausa tra un invio e l'altro — prudenza verso Resend, non un
// limite reale imposto dal loro free tier (3000 email/mese) per una lista
// delle dimensioni di un hotel.
const PAUSA_TRA_INVII_MS = 150;
function attesa(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recuperaDestinatariTutti() {
  const result = await pool.query(
    `SELECT id, nome, cognome, email FROM ospiti
     WHERE consenso_marketing = true AND email IS NOT NULL AND email <> ''
     ORDER BY cognome, nome`,
    []
  );
  return result.rows;
}

async function recuperaDestinatariSelezionati(ospiteIds) {
  const result = await pool.query(
    `SELECT id, nome, cognome, email FROM ospiti
     WHERE id = ANY($1) AND consenso_marketing = true AND email IS NOT NULL AND email <> ''
     ORDER BY cognome, nome`,
    [ospiteIds]
  );
  return result.rows;
}

// Crea e invia un'offerta. destinatari: 'tutti' oppure un array di ospite_id.
// Ritorna sempre un esito (mai lancia): { ok, offertaId, totaleDestinatari,
// totaleOk, totaleFalliti, esclusi } oppure { ok: false, motivo } se non c'è
// nessun destinatario valido.
async function inviaOfferta({ oggetto, corpo, destinatari, utenteId }) {
  const daInviare = destinatari === 'tutti'
    ? await recuperaDestinatariTutti()
    : await recuperaDestinatariSelezionati(destinatari);

  const richiesti = destinatari === 'tutti' ? null : destinatari.length;
  const esclusi = richiesti !== null ? richiesti - daInviare.length : 0;

  if (!daInviare.length) {
    return { ok: false, motivo: 'Nessun destinatario con consenso marketing ed email valida.', esclusi };
  }

  const creata = await pool.query(
    `INSERT INTO offerte_email (oggetto, corpo, inviato_da, totale_destinatari)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [oggetto, corpo, utenteId, daInviare.length]
  );
  const offertaId = creata.rows[0].id;

  let totaleOk = 0;
  let totaleFalliti = 0;

  for (const destinatario of daInviare) {
    const nomeCompleto = `${destinatario.nome ?? ''} ${destinatario.cognome ?? ''}`.trim() || 'Gentile cliente';
    const corpoHtml = renderizzaCorpoEmail(corpo, { nomeOspite: nomeCompleto });
    const html = await involucroHtml(oggetto, corpoHtml);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto, html });

    if (esito.ok) totaleOk++; else totaleFalliti++;

    await pool.query(
      `INSERT INTO offerte_email_destinatari (offerta_id, ospite_id, email, ok, errore)
       VALUES ($1, $2, $3, $4, $5)`,
      [offertaId, destinatario.id, destinatario.email, esito.ok, esito.ok ? null : esito.errore]
    );

    await attesa(PAUSA_TRA_INVII_MS);
  }

  await pool.query(
    'UPDATE offerte_email SET totale_ok = $1, totale_falliti = $2 WHERE id = $3',
    [totaleOk, totaleFalliti, offertaId]
  );

  return { ok: true, offertaId, totaleDestinatari: daInviare.length, totaleOk, totaleFalliti, esclusi };
}

module.exports = { inviaOfferta, recuperaDestinatariTutti, recuperaDestinatariSelezionati };
