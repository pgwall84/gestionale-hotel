// Script una tantum — provisioning dei 10 dipendenti reali + 7 account di
// test (uno per ruolo) richiesti dal titolare il 13/08/2026 (CLAUDE.md
// Sezione 16, Fase A). Segue lo stesso pattern di sicurezza già usato in
// importaCodiciAlloggiatiCsv.js: idempotente, dry-run di default.
//
// Uso:
//   node backend/scripts/provisionaDipendenti.js            → solo anteprima, non scrive nulla
//   node backend/scripts/provisionaDipendenti.js --apply     → scrive davvero nel DB
//
// Cosa fa per ciascuna persona/account:
//   1. Cerca un utente con la stessa email (nome utente) → se esiste, non
//      tocca nulla, segnala se il ruolo salvato è diverso da quello atteso
//      (mai sovrastritto in automatico — stessa cautela già adottata per
//      "Applica turno standard": una discrepanza si segnala, non si corregge
//      da soli, perché potrebbe essere un cambio di ruolo reale voluto).
//   2. Cerca anche per nome+cognome (case-insensitive) con email diversa →
//      segnala un possibile doppione invece di creare alla cieca (nomi
//      composti come "Bonati Martinez Dahiana" rendono il match fragile).
//   3. Solo se non trova nulla, e solo con --apply, crea l'utente con
//      password di default "Hotel2026!" (bcrypt, cost 12 — stesso cost di
//      usersController.crea()).
//
// Nome utente = nome.cognome (minuscolo, spazi/accenti normalizzati) nella
// colonna 'email' — quella colonna non ha validazione di formato lato
// backend, decisione presa in questa sessione al posto di un vero campo
// username separato (rischio/lavoro molto minore, stesso risultato pratico).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const PASSWORD_DEFAULT = 'Hotel2026!';

// ── I 10 dipendenti reali (elenco fornito dal titolare, 13/08/2026) ────────
// Ruolo 'dipendente' = chiave interna invariata, mostrata in UI come
// "Lavapiatti" (vedi frontend/app/utenti/page.jsx e /personale/page.jsx).
const DIPENDENTI = [
  { nome: 'Luigi',      cognome: 'Liquori',            ruolo: 'portiere_notte' },
  { nome: 'Annunziata', cognome: 'Donato',              ruolo: 'cameriere' },
  { nome: 'Giovanna',   cognome: 'Tavoni',              ruolo: 'cameriere' },
  { nome: 'Renato',     cognome: 'Landucci',            ruolo: 'cuoco' },
  { nome: 'Aracelis Altagracia', cognome: 'Ramos',      ruolo: 'cameriere' },
  { nome: 'Dahiana',    cognome: 'Bonati Martinez',     ruolo: 'cameriere' },
  { nome: 'Marco',      cognome: 'Spadavecchia',        ruolo: 'dipendente' }, // Lavapiatti
  { nome: 'Anna',       cognome: 'Troise',               ruolo: 'cameriere' },
  { nome: 'Catia',      cognome: 'Giannetti',            ruolo: 'cuoco' },
  { nome: 'Raffaele',   cognome: 'Spinatelli',           ruolo: 'portiere_notte' },
];

// ── 7 account di test, uno per ruolo (richiesti dal titolare per le prove
// prima di far usare il sistema ai dipendenti veri) ────────────────────────
const UTENTI_TEST = [
  { nome: 'Admin',        cognome: 'Test', email: 'admin_test',        ruolo: 'admin' },
  { nome: 'Titolare',     cognome: 'Test', email: 'titolare_test',     ruolo: 'titolare' },
  { nome: 'Receptionist', cognome: 'Test', email: 'receptionist_test', ruolo: 'receptionist' },
  { nome: 'Cameriere',    cognome: 'Test', email: 'cameriere_test',    ruolo: 'cameriere' },
  { nome: 'Cuoco',        cognome: 'Test', email: 'cuoco_test',        ruolo: 'cuoco' },
  { nome: 'Portiere',     cognome: 'Test', email: 'portiere_notte_test', ruolo: 'portiere_notte' },
  { nome: 'Lavapiatti',   cognome: 'Test', email: 'lavapiatti_test',   ruolo: 'dipendente' },
];

function normalizzaUsername(nome, cognome) {
  return `${nome}.${cognome}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // toglie accenti (es. à → a)
    .replace(/\s+/g, '');
}

async function provisiona(persona, apply) {
  const email = persona.email || normalizzaUsername(persona.nome, persona.cognome);

  // 1. Match esatto per username/email
  const perEmail = await pool.query('SELECT id, nome, cognome, ruolo FROM users WHERE email = $1', [email]);
  if (perEmail.rows.length > 0) {
    const esistente = perEmail.rows[0];
    if (esistente.ruolo !== persona.ruolo) {
      console.log(`  ATTENZIONE — ${email}: esiste già (id ${esistente.id}) con ruolo '${esistente.ruolo}', atteso '${persona.ruolo}'. Non modificato — verificare a mano.`);
    } else {
      console.log(`  OK — ${email}: già presente con il ruolo corretto (id ${esistente.id}), nessuna azione.`);
    }
    return 'esistente';
  }

  // 2. Possibile doppione per nome+cognome con email diversa
  const perNome = await pool.query(
    `SELECT id, email, ruolo FROM users WHERE lower(nome) = lower($1) AND lower(cognome) = lower($2)`,
    [persona.nome, persona.cognome]
  );
  if (perNome.rows.length > 0) {
    console.log(`  ATTENZIONE — ${persona.nome} ${persona.cognome}: trovato account con nome utente diverso ('${perNome.rows[0].email}', ruolo '${perNome.rows[0].ruolo}'). Salto la creazione — verificare a mano se è un doppione.`);
    return 'possibile_doppione';
  }

  // 3. Nessun match — crea (solo con --apply)
  if (!apply) {
    console.log(`  DA CREARE — ${email} (${persona.nome} ${persona.cognome}, ruolo ${persona.ruolo})`);
    return 'da_creare';
  }

  const passwordHash = await bcrypt.hash(PASSWORD_DEFAULT, 12);
  const result = await pool.query(
    `INSERT INTO users (nome, cognome, email, password_hash, ruolo)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [persona.nome.trim(), persona.cognome.trim(), email, passwordHash, persona.ruolo]
  );
  console.log(`  CREATO — ${email} (id ${result.rows[0].id})`);
  return 'creato';
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '=== PROVISIONING (scrittura reale) ===' : '=== ANTEPRIMA (nessuna scrittura — usa --apply per eseguire) ===');

  console.log('\n--- Dipendenti reali ---');
  for (const p of DIPENDENTI) await provisiona(p, apply);

  console.log('\n--- Account di test ---');
  for (const p of UTENTI_TEST) await provisiona(p, apply);

  if (!apply) {
    console.log('\nNessuna scrittura eseguita. Ricontrolla gli "ATTENZIONE" sopra, poi rilancia con --apply.');
  } else {
    console.log(`\nFatto. Password di default per i nuovi account: ${PASSWORD_DEFAULT} — da consegnare a mano, mai via email/chat, e da cambiare al primo accesso da Sidebar ▸ Cambia password.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Errore provisioning:', err);
  process.exit(1);
});
