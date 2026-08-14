// Script una tantum — popola timbrature realistiche di giugno-luglio 2026
// per i 3 account di test scelti dal titolare per verificare a mano il
// report mensile "Consulente" (13/08/2026): portiere_notte_test (tempo
// indeterminato, fascia notturna), cameriere_test (part-time), cuoco_test
// (chiamata). Imposta anche il loro contratto_tipo/fascia_oraria — non
// serve più passare da /personale per questi 3.
//
// Idempotente: cancella prima le timbrature esistenti di questi utenti nel
// range giugno-luglio 2026, poi le rigenera. Sicuro da rilanciare più volte.
//
// Uso: node backend/scripts/seedTimbratureTest.js
//
// ATTENZIONE — trovato mentre scrivevo questo script, non introdotto da
// questo script: in reportMensile() (timbratureController.js) le ore di un
// turno vengono attribuite al giorno della TIMBRATURA DI USCITA, non a
// quello di entrata. Per un turno diurno non cambia nulla, ma per un turno
// notturno che attraversa la mezzanotte (23:00 → 07:00 del giorno dopo) le
// ore finiscono nella colonna del giorno *successivo* a quello in cui il
// turno è iniziato. È una logica preesistente, condivisa da tutti e tre i
// fogli (Dettaglio/Riepilogo/Consulente) — non l'ho corretta qui perché
// cambierebbe l'interpretazione di dati storici già verificati per turni
// serali che finiscono esattamente a mezzanotte. Con questi dati di test
// per portiere_notte_test lo vedrai riprodursi: le ore del turno del
// giorno G compariranno nella colonna G+1. Dimmi se vuoi che lo corregga.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/db');

const DATA_INIZIO = '2026-06-01';
const DATA_FINE = '2026-07-31';

const UTENTI = {
  portiere_notte_test: { contratto_tipo: 'tempo_indeterminato', fascia_oraria: 'notturna' },
  cameriere_test:      { contratto_tipo: 'part_time', fascia_oraria: null },
  cuoco_test:           { contratto_tipo: 'chiamata', fascia_oraria: null },
};

function isoGiorni(inizio, fine) {
  const giorni = [];
  const cursore = new Date(`${inizio}T00:00:00`);
  const ultimo = new Date(`${fine}T00:00:00`);
  while (cursore <= ultimo) {
    giorni.push(new Date(cursore));
    cursore.setDate(cursore.getDate() + 1);
  }
  return giorni;
}

function fmtData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Costruisce un timestamp letterale 'YYYY-MM-DD HH:MM:SS' — passato come
// stringa a Postgres, che lo scrive esattamente così nella colonna TIMESTAMP
// (senza fuso orario): nessuna conversione UTC/locale a carico di questo script.
function ts(data, ora, minuti = 0, giorniOffset = 0) {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + giorniOffset);
  return `${fmtData(d)} ${String(ora).padStart(2, '0')}:${String(minuti).padStart(2, '0')}:00`;
}

function giornoSettimana(d) {
  return d.getDay(); // 0 = domenica, 6 = sabato
}

async function seedPortiere(userId, giorni) {
  let righe = [];
  let contatore = 0;
  for (const d of giorni) {
    const gs = giornoSettimana(d);
    if (gs === 0 || gs === 6) continue; // riposo nel weekend, per semplicità del test
    contatore++;
    const straordinario = contatore % 7 === 0; // 1 notte su 7 con un'ora extra
    const dataStr = fmtData(d);
    righe.push([userId, 'entrata', ts(dataStr, 23, 0)]);
    righe.push([userId, 'uscita', ts(dataStr, straordinario ? 8 : 7, 0, 1)]); // giorno dopo
  }
  return righe;
}

async function seedCameriere(userId, giorni) {
  let righe = [];
  let contatore = 0;
  for (const d of giorni) {
    const gs = giornoSettimana(d);
    if (gs === 0 || gs === 6) continue;
    contatore++;
    const straordinario = contatore % 6 === 0; // ogni tanto un'ora extra
    const dataStr = fmtData(d);
    righe.push([userId, 'entrata', ts(dataStr, 9, 0)]);
    righe.push([userId, 'uscita', ts(dataStr, straordinario ? 15 : 14, 0)]);
  }
  return righe;
}

async function seedCuoco(userId, giorni) {
  // Chiamata: nessun pattern fisso, giorni sparsi con orari e durate variabili
  // (deliberatamente irregolare — è il punto del contratto a chiamata).
  const righe = [];
  const orariInizio = [10, 12, 17, 19];
  const durate = [3, 4, 5, 6, 7];
  let seme = 13; // generatore deterministico semplice, per risultati riproducibili
  function random() {
    seme = (seme * 9301 + 49297) % 233280;
    return seme / 233280;
  }
  for (const d of giorni) {
    if (random() > 0.28) continue; // circa 1 giorno su 4 lavorato
    const dataStr = fmtData(d);
    const oraInizio = orariInizio[Math.floor(random() * orariInizio.length)];
    const durata = durate[Math.floor(random() * durate.length)];
    righe.push([userId, 'entrata', ts(dataStr, oraInizio, 0)]);
    righe.push([userId, 'uscita', ts(dataStr, oraInizio + durata, 0)]);
  }
  return righe;
}

async function main() {
  console.log(`Seed timbrature di test — ${DATA_INIZIO} → ${DATA_FINE}`);

  const risultato = await pool.query(
    `SELECT id, email FROM users WHERE email = ANY($1)`,
    [Object.keys(UTENTI)]
  );
  const idPerEmail = {};
  for (const r of risultato.rows) idPerEmail[r.email] = r.id;

  const mancanti = Object.keys(UTENTI).filter(e => !idPerEmail[e]);
  if (mancanti.length > 0) {
    console.error(`Utenti non trovati: ${mancanti.join(', ')} — esegui prima provisionaDipendenti.js --apply.`);
    await pool.end();
    process.exit(1);
  }

  // 1. Imposta contratto_tipo/fascia_oraria
  for (const [email, cfg] of Object.entries(UTENTI)) {
    await pool.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      [cfg.contratto_tipo, cfg.fascia_oraria, idPerEmail[email]]);
    console.log(`  ${email}: contratto_tipo=${cfg.contratto_tipo}, fascia_oraria=${cfg.fascia_oraria || '—'}`);
  }

  // 2. Pulisce le timbrature esistenti di questi 3 utenti nel range (rerun sicuro)
  const idsTarget = Object.values(idPerEmail);
  const cancellate = await pool.query(
    `DELETE FROM timbrature WHERE user_id = ANY($1) AND timestamp::date BETWEEN $2 AND $3`,
    [idsTarget, DATA_INIZIO, DATA_FINE]
  );
  console.log(`Cancellate ${cancellate.rowCount} timbrature preesistenti nel range.`);

  // 3. Genera le nuove timbrature
  const giorni = isoGiorni(DATA_INIZIO, DATA_FINE);
  const righePortiere = await seedPortiere(idPerEmail['portiere_notte_test'], giorni);
  const righeCameriere = await seedCameriere(idPerEmail['cameriere_test'], giorni);
  const righeCuoco = await seedCuoco(idPerEmail['cuoco_test'], giorni);
  const tutteLeRighe = [...righePortiere, ...righeCameriere, ...righeCuoco];

  const placeholders = tutteLeRighe.map((_, i) => {
    const b = i * 3;
    return `($${b + 1}, $${b + 2}, $${b + 3})`;
  }).join(', ');
  await pool.query(
    `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES ${placeholders}`,
    tutteLeRighe.flat()
  );

  console.log(`Inserite ${tutteLeRighe.length} timbrature (${tutteLeRighe.length / 2} turni):`);
  console.log(`  portiere_notte_test: ${righePortiere.length / 2} turni notturni`);
  console.log(`  cameriere_test: ${righeCameriere.length / 2} turni part-time`);
  console.log(`  cuoco_test: ${righeCuoco.length / 2} turni a chiamata`);
  console.log('\nOra genera il report mensile da /personale ▸ Presenze per giugno e per luglio 2026.');

  await pool.end();
}

main().catch(err => {
  console.error('Errore seed timbrature test:', err);
  process.exit(1);
});
