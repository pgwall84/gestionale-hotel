// Client minimale per l'API Resend (invio email) — modulo 5.3, parte email
// (04/08/2026). Nessuna dipendenza nuova: una singola chiamata `fetch`
// nativo (Node 18+, già il caso di questo progetto) verso l'endpoint HTTP
// di Resend, stesso principio già seguito in alloggiatiSoapClient.js per
// WS_ALLOGGIATI ("nessuna dipendenza nuova, sufficiente per la chiamata").
//
// Modalità sandbox (dominio non ancora verificato): Resend accetta
// l'invio solo dall'indirizzo onboarding@resend.dev e SOLO verso l'email
// con cui è stato creato l'account Resend — qualunque altro destinatario
// viene rifiutato. Comportamento noto, non un bug di questo client. Quando
// il titolare verificherà un dominio proprio (es. mail.hoteldelgolfolerici.com),
// basterà cambiare RESEND_MITTENTE in .env, nessun cambio di codice.

const ENDPOINT = 'https://api.resend.com/emails';

// Invia una email tramite Resend. Non lancia mai per un errore HTTP/di rete
// — lo chiamante (backend/lib/emailPrenotazioni.js) decide come loggare il
// fallimento, perché l'invio email non deve MAI far fallire l'operazione
// principale (conferma prenotazione, job promemoria).
// Restituisce { ok: boolean, errore?: string }.
async function inviaEmail({ destinatario, oggetto, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const mittente = process.env.RESEND_MITTENTE;

  if (!apiKey || !mittente) {
    return { ok: false, errore: 'RESEND_API_KEY o RESEND_MITTENTE non configurati in .env' };
  }
  if (!destinatario) {
    return { ok: false, errore: 'Nessun indirizzo destinatario disponibile' };
  }

  try {
    const risposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mittente,
        to: [destinatario],
        subject: oggetto,
        html,
      }),
    });

    if (!risposta.ok) {
      const corpo = await risposta.text().catch(() => '');
      return { ok: false, errore: `Resend ${risposta.status}: ${corpo}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, errore: err.message };
  }
}

module.exports = { inviaEmail };
