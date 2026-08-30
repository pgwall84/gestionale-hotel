// backend/lib/beds24Client.js
// Client HTTP verso Beds24 API v2 — Modulo 2.3, Fase 1 (solo lettura
// prenotazioni). Gestisce autenticazione e rinnovo token; le chiamate
// dati vere (getBookings) sono nel Task 3.
// Base URL: le fonti pubbliche sono discordanti (api.beds24.com/v2 vs
// beds24.com/api/v2) — configurabile via env, verificata nel Task 12
// contro l'account reale.

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

module.exports = { scambiaInviteCode, getToken };
