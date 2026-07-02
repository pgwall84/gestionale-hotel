#!/usr/bin/env node
// Script agente AI per generazione automatica dei test.
// Uso: node tests/agent/genera-test.js <modulo>
// Esempio: node tests/agent/genera-test.js ristorante
//
// Funzionamento:
//   1. Legge controller, route e migration del modulo indicato
//   2. Chiama Claude con il codice come contesto
//   3. Claude genera la batteria di test Jest + Supertest
//   4. Salva il file in tests/api/{modulo}.test.js
//   5. Esegue i test e mostra il report in italiano

const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

const ROOT = path.join(__dirname, '../..');

// ─── Argomenti ────────────────────────────────────────────────────────────────

const modulo = process.argv[2];
if (!modulo) {
  console.error('❌  Specifica il modulo: node tests/agent/genera-test.js <modulo>');
  console.error('    Esempi: ristorante | magazzino | hr | ztl | auth');
  process.exit(1);
}

// ─── Leggi i file del modulo ──────────────────────────────────────────────────

function leggiSeEsiste(filePath) {
  if (fs.existsSync(filePath)) {
    return `\n// === FILE: ${path.relative(ROOT, filePath)} ===\n` + fs.readFileSync(filePath, 'utf8');
  }
  return '';
}

function trovaNumeroMigration(nomeModulo) {
  const dir = path.join(ROOT, 'database/migrations');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.includes(nomeModulo));
  return files.map(f => path.join(dir, f));
}

const controller = leggiSeEsiste(path.join(ROOT, `backend/controllers/${modulo}Controller.js`));
const route      = leggiSeEsiste(path.join(ROOT, `backend/routes/${modulo}.js`));
const migrations = (trovaNumeroMigration(modulo) ?? []).map(f => leggiSeEsiste(f)).join('');
const helpers    = leggiSeEsiste(path.join(ROOT, 'tests/helpers/auth.js'));

if (!controller && !route) {
  console.error(`❌  Nessun file trovato per il modulo "${modulo}".`);
  console.error(`    Cerco: backend/controllers/${modulo}Controller.js`);
  console.error(`            backend/routes/${modulo}.js`);
  process.exit(1);
}

const contesto = [controller, route, migrations, helpers].filter(Boolean).join('\n');

console.log(`\n📂  Modulo: ${modulo}`);
console.log(`📄  File letti: ${[
  controller ? `controllers/${modulo}Controller.js` : null,
  route      ? `routes/${modulo}.js`               : null,
  migrations ? 'migration(s)'                      : null,
].filter(Boolean).join(', ')}`);
console.log('🤖  Chiamo Claude per generare i test...\n');

// ─── Prompt per Claude ────────────────────────────────────────────────────────

const PROMPT_SISTEMA = `Sei un esperto di testing Node.js che scrive test Jest + Supertest per API Express + PostgreSQL.
Scrivi test in italiano (descrizioni e messaggi), usando il pattern dei test esistenti nel progetto.
Usa solo require() (CommonJS), mai import/export.
Importa sempre: const request = require('supertest'); const app = require('../../backend/app');
Importa gli helper: const { authHeader } = require('../helpers/auth');
Per ogni endpoint testa: senza token → 401, ruolo sbagliato → 403, input mancanti → 400, operazione corretta → 200/201.
Restituisci SOLO il codice JavaScript, senza markdown, senza backtick, senza spiegazioni.`;

const PROMPT_UTENTE = `Genera la batteria di test Jest + Supertest per il modulo "${modulo}" del gestionale Hotel del Golfo.

Ecco il codice del modulo:
${contesto}

Regole:
1. Ogni endpoint deve avere almeno: test senza token (401), test ruolo sbagliato (403 se applicabile), test input valido (200/201)
2. Usa afterAll per chiudere il pool: const { chiudiPool } = require('../helpers/db'); afterAll(chiudiPool)
3. Aggiungi un commento in cima con: cosa testa, chi può accedere, dipendenze
4. Per i test che creano dati, usa nomi univoci con Date.now() per evitare conflitti
5. Non testare logica già coperta in auth.test.js

Restituisci solo il codice del file tests/api/${modulo}.test.js`;

// ─── Chiamata API Claude ──────────────────────────────────────────────────────

async function generaTest() {
  require('dotenv').config({ path: path.join(ROOT, 'backend/.env') });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌  ANTHROPIC_API_KEY non trovata nel backend/.env');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  const messaggio = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system: PROMPT_SISTEMA,
    messages: [{ role: 'user', content: PROMPT_UTENTE }],
  });

  const codice = messaggio.content[0].text.trim();

  // ─── Salva il file ─────────────────────────────────────────────────────────

  const outputPath = path.join(ROOT, `tests/api/${modulo}.test.js`);
  fs.writeFileSync(outputPath, codice, 'utf8');
  console.log(`✅  Test generati e salvati in: tests/api/${modulo}.test.js`);
  console.log(`    Token usati: ${messaggio.usage.input_tokens} input + ${messaggio.usage.output_tokens} output\n`);

  // ─── Esegui i test ─────────────────────────────────────────────────────────

  console.log('🧪  Esecuzione test...\n');
  try {
    const output = execSync(
      `npx jest tests/api/${modulo}.test.js --forceExit --verbose`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
    console.log(output);
    console.log(`✅  Tutti i test per "${modulo}" sono passati!`);
  } catch (err) {
    console.log(err.stdout ?? '');
    console.error(err.stderr ?? '');
    console.error(`\n❌  Alcuni test falliti — controllare il file tests/api/${modulo}.test.js`);
    process.exit(1);
  }
}

generaTest().catch(err => {
  console.error('Errore inatteso:', err.message);
  process.exit(1);
});
