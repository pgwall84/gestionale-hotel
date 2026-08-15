// Script una tantum — crea due schede cliente FITTIZIE con stesso nome,
// cognome e data di nascita, per poter testare la pagina /clienti/duplicati
// (CRM ospiti, 14-15/08/2026) senza dover aspettare un duplicato vero.
// Stesso pattern di backend/scripts/creaPrenotazioneTestAlloggiati.js:
// idempotente (non ricrea se esistono già), --elimina per ripulire.
//
// Le due schede sono deliberatamente diverse su email/telefono/consenso
// marketing, per avere un caso realistico da valutare nella UI (quale
// tenere) invece di due righe identiche in tutto.
//
// Nessun soggiorno collegato: sono solo due righe in `ospiti`, non toccano
// prenotazioni/planning — a differenza dello script Alloggiati Web, non
// compaiono da nessuna parte tranne che in Clienti e nel banner duplicati.
//
// Uso:
//   node backend/scripts/creaDuplicatiTest.js            → crea (se non esistono già)
//   node backend/scripts/creaDuplicatiTest.js --elimina   → elimina entrambe

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/db');

// Marcatore nel campo note — unico modo per ritrovare/pulire queste righe
// di test (ospiti non ha un external_booking_id come le prenotazioni).
const MARCATORE = 'TEST-DUPLICATO-CRM';

const NOME = 'Mario';
const COGNOME = 'Rossi';
const DATA_NASCITA = '1985-03-20';

async function trovaEsistenti() {
  const res = await pool.query(`SELECT id FROM ospiti WHERE note = $1 ORDER BY id`, [MARCATORE]);
  return res.rows.map(r => r.id);
}

async function elimina() {
  const ids = await trovaEsistenti();
  if (ids.length === 0) {
    console.log('Nessuna scheda di test trovata — niente da eliminare.');
    return;
  }
  // Azzera prima duplicato_di (FK self-reference): se nel frattempo hai
  // testato "Unisci" tra queste due, una punta all'altra e la DELETE
  // fallirebbe per il vincolo altrimenti.
  await pool.query(`UPDATE ospiti SET duplicato_di = NULL WHERE id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM ospiti WHERE id = ANY($1)`, [ids]);
  console.log(`Eliminate ${ids.length} schede di test (id: ${ids.join(', ')}).`);
}

async function crea() {
  const esistenti = await trovaEsistenti();
  if (esistenti.length >= 2) {
    console.log('Le due schede di test esistono già — nessuna duplicazione.');
    console.log(`  Id: ${esistenti.join(', ')}`);
    console.log('  Vai su Clienti: dovresti vedere il banner "possibili duplicati da rivedere".');
    return;
  }

  const res = await pool.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita, email, telefono, consenso_marketing, note)
     VALUES
       ($1, $2, $3, $4, $5, true,  $6),
       ($1, $2, $3, $7, $8, false, $6)
     RETURNING id, email, telefono`,
    [
      NOME, COGNOME, DATA_NASCITA,
      'mario.rossi@testmail.it', '3331112222',
      MARCATORE,
      null, '3339998888',
    ]
  );

  console.log('Create due schede cliente di test:');
  for (const r of res.rows) {
    console.log(`  #${r.id} — email: ${r.email || '(nessuna)'} — telefono: ${r.telefono}`);
  }
  console.log('\nVai su Clienti: dovresti vedere il banner "possibili duplicati da rivedere" → apre /clienti/duplicati.');
  console.log('Eliminale appena finito di testare:');
  console.log('  node backend/scripts/creaDuplicatiTest.js --elimina');
}

async function main() {
  if (process.argv.includes('--elimina')) {
    await elimina();
  } else {
    await crea();
  }
  await pool.end();
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
