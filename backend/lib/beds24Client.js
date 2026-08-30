// backend/lib/beds24Client.js
// Client HTTP verso Beds24 API v2 — Modulo 2.3, Fase 1 (solo lettura
// prenotazioni). Gestisce autenticazione e rinnovo token; le chiamate
// dati vere (getBookings) sono nel Task 3.
// Base URL: le fonti pubbliche sono discordanti (api.beds24.com/v2 vs
// beds24.com/api/v2) — configurabile via env, verificata nel Task 12
// contro l'account reale.
// getBookings: parametri e forma della risposta confermati il 30/08/2026
// contro lo Swagger reale (incollato da Marco, non più un'ipotesi).

const pool = require('../config/db');

const BASE_URL = process.env.BEDS24_BASE_URL || 'https://api.beds24.com/v2';

// Scambia un invite code (generato a mano nel pannello Beds24, valido 24h,
// one-shot) con un refresh token duraturo. Chiamata solo da
// backend/scripts/beds24Setup.js, mai da un endpoint HTTP esposto.
async function scambiaInviteCode(inviteCode) {
  const risposta = await fetch(`${BASE_URL}/authentication/setup`, {
    method: 'GET',
    headers: { code: inviteCode },
  });
  if (!risposta.ok) {
    throw new Error(`Scambio invite code fallito: HTTP ${risposta.status}`);
  }
  const dati = await risposta.json();
  const scadeAt = new Date(Date.now() + dati.expiresIn * 1000);

  await pool.query(
    `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       token         = EXCLUDED.token,
       token_scade_at = EXCLUDED.token_scade_at,
       updated_at    = now()`,
    [dati.refreshToken, dati.token, scadeAt]
  );

  return { token: dati.token, refreshToken: dati.refreshToken, expiresIn: dati.expiresIn };
}

// Restituisce un token valido, rinnovandolo automaticamente se scaduto o
// vicino alla scadenza (margine di 5 minuti). Lancia un errore chiaro se
// non è mai stato fatto il setup iniziale (beds24_config vuota).
async function getToken() {
  const risultato = await pool.query('SELECT * FROM beds24_config WHERE id = 1');
  const config = risultato.rows[0];
  if (!config || !config.refresh_token) {
    throw new Error(
      'Nessuna credenziale Beds24 configurata — eseguire backend/scripts/beds24Setup.js con un invite code valido.'
    );
  }

  const scadeTraCinqueMinuti = !config.token_scade_at
    || new Date(config.token_scade_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (!scadeTraCinqueMinuti) {
    return config.token;
  }

  const risposta = await fetch(`${BASE_URL}/authentication/token`, {
    method: 'GET',
    headers: { refreshToken: config.refresh_token },
  });
  if (!risposta.ok) {
    throw new Error(`Rinnovo token Beds24 fallito: HTTP ${risposta.status}`);
  }
  const dati = await risposta.json();
  const scadeAt = new Date(Date.now() + dati.expiresIn * 1000);

  await pool.query(
    `UPDATE beds24_config SET token = $1, token_scade_at = $2, updated_at = now() WHERE id = 1`,
    [dati.token, scadeAt]
  );

  return dati.token;
}

// Legge le prenotazioni da Beds24, con paginazione automatica.
// modifiedFrom/modifiedTo: formato Beds24 YYYY-MM-DDTHH:MM:SS (senza
// millisecondi né Z) — usato dal job di riconciliazione notturna per le
// modifiche successive all'ultima sincronizzazione.
// status: Beds24 filtra di DEFAULT solo su confirmed/new/request — le
// cancellazioni NON tornano se non richieste esplicitamente (confermato
// sullo Swagger reale). Il default qui include sempre 'cancelled':
// altrimenti il job di riconciliazione (rete di sicurezza per webhook
// persi, cancellazioni comprese) non vedrebbe mai una cancellazione
// persa. 'black'/'inquiry' restano esclusi: non sono prenotazioni ospite
// reali per Fase 1.
async function getBookings({ modifiedFrom, modifiedTo, status } = {}) {
  const token = await getToken();
  const statiRichiesti = status || ['confirmed', 'new', 'request', 'cancelled'];

  const tutte = [];
  let pagina = 1;
  let altrePagine = true;

  while (altrePagine) {
    const url = new URL(`${BASE_URL}/bookings`);
    if (modifiedFrom) url.searchParams.set('modifiedFrom', modifiedFrom);
    if (modifiedTo) url.searchParams.set('modifiedTo', modifiedTo);
    statiRichiesti.forEach((s) => url.searchParams.append('status', s));
    if (pagina > 1) url.searchParams.set('page', String(pagina));

    const risposta = await fetch(url, { headers: { token } });
    if (!risposta.ok) {
      let dettaglio = '';
      try {
        const corpoErrore = await risposta.json();
        dettaglio = corpoErrore.error ? ` — ${corpoErrore.error}` : '';
      } catch (_erroreParsing) {
        // corpo non JSON, ignoriamo e teniamo solo lo status HTTP
      }
      throw new Error(`GET /bookings fallita: HTTP ${risposta.status}${dettaglio}`);
    }
    const dati = await risposta.json();
    const paginaDati = Array.isArray(dati) ? dati : (dati.data || []);
    tutte.push(...paginaDati);

    altrePagine = !!(dati.pages && dati.pages.nextPageExists);
    pagina += 1;
    // Limite di sicurezza — non ciclare all'infinito su una risposta
    // inattesa (es. nextPageExists sempre true per un bug lato Beds24).
    if (pagina > 50) {
      console.error('Beds24 getBookings: interrotta paginazione oltre 50 pagine, controllo manuale necessario.');
      break;
    }
  }

  return tutte;
}

module.exports = { scambiaInviteCode, getToken, getBookings };
