// Pre check-in self-service — modulo 5.2 Fase B (04/08/2026). Genera il
// token del link pubblico e invia l'email che lo contiene — sia dal
// pulsante manuale in reception (prenotazioniController.inviaPreCheckin)
// sia dal job giornaliero del promemoria (backend/jobs/promemoriaEmail.js),
// che lo include SOLO se non è già stato inviato manualmente prima (stessa
// idempotenza delle altre email, colonna prenotazioni.pre_checkin_inviato_at).
//
// Il token in chiaro esiste solo nel link email: in DB si salva solo
// l'hash (pre_checkin_token_hash), stesso pattern di refresh_tokens
// (backend/controllers/authController.js) — un dump del DB non basta per
// impersonare un ospite.
//
// IMPORTANTE: il form pubblico funziona solo se il gestionale è
// raggiungibile dall'ospite (oggi solo LAN — 1.10 Deploy VPS non fatto).
// PRE_CHECKIN_BASE_URL va impostata a mano in .env: in sviluppo l'IP LAN
// del PC (stesso usato in frontend/next.config.ts allowedDevOrigins), in
// produzione il dominio pubblico.

const crypto = require('crypto');
const pool = require('../config/db');

function generaToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function baseUrl() {
  return process.env.PRE_CHECKIN_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:7000';
}

// Genera SEMPRE un nuovo token per la prenotazione e ritorna il link
// completo — non invia nulla, solo prepara il dato. Il token in chiaro non
// è recuperabile dall'hash salvato, quindi ogni chiamata (invio manuale o
// automatico dal job) ne genera uno nuovo e invalida il precedente: non
// resta mai in giro un link vecchio ancora valido. Il chiamante decide
// quando invocarla (il job lo fa una sola volta per prenotazione, guardando
// pre_checkin_inviato_at prima di chiamare).
async function assicuraToken(prenotazioneId) {
  const esistente = await pool.query('SELECT id FROM prenotazioni WHERE id = $1', [prenotazioneId]);
  if (!esistente.rows.length) return null;

  const token = generaToken();
  await pool.query('UPDATE prenotazioni SET pre_checkin_token_hash = $1 WHERE id = $2', [hashToken(token), prenotazioneId]);
  return `${baseUrl()}/pre-checkin/${token}`;
}

module.exports = { generaToken, hashToken, baseUrl, assicuraToken };
