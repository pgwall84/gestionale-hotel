// Script una tantum — Booking Engine v2, Fase B (19/08/2026).
//
// Collega i tipi camera del gestionale (tabella tipi_camera) ai documenti
// "camera" di Sanity (repo sito-hotel), scrivendo il nuovo campo
// tipoCameraId (vedi sito-hotel/sanity/schemaTypes/documents/camera.ts).
// Serve perché il BookingWidget di /prenota possa arricchire i risultati di
// GET /api/booking-pubblico/disponibilita (prezzo/disponibilità, fonte di
// verità gestionale) con foto/descrizione/servizi presi da Sanity — mai
// duplicati in Postgres, mai spostato pricing in Sanity.
//
// Uso:
//   node backend/scripts/collegaSanityTipiCamera.js            → dry run, nessuna scrittura
//   node backend/scripts/collegaSanityTipiCamera.js --applica   → scrive tipoCameraId sui documenti abbinati
//
// Richiede in backend/.env (oltre a DB_*, già presenti):
//   SANITY_PROJECT_ID, SANITY_DATASET (stessi valori di sito-hotel/.env.local)
//   SANITY_API_TOKEN — token con permesso di SCRITTURA (sanity.io/manage →
//     progetto → API → Tokens → ruolo "Editor"). MAI il token pubblico di
//     sola lettura già in uso dal sito.
//
// L'abbinamento è per NOME (normalizzato: minuscolo, senza accenti/punteggiatura)
// tra tipi_camera.nome e il campo nome.it di ogni documento camera in Sanity.
// Nessun abbinamento indovinato: le camere senza corrispondenza automatica
// chiara vengono elencate a parte, da collegare a mano in Sanity Studio — è
// contenuto pubblico del sito, non ha senso rischiare un abbinamento sbagliato.
// Non tocca mai un documento già collegato a un tipo_camera_id DIVERSO
// (segnalato come attenzione, mai sovrascritto in automatico).

require('dotenv').config();
const pool = require('../config/db');
const { createClient } = require('@sanity/client');

const APPLICA = process.argv.includes('--applica');

function normalizza(testo) {
  return String(testo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  if (!process.env.SANITY_PROJECT_ID || !process.env.SANITY_API_TOKEN) {
    console.error('Mancano SANITY_PROJECT_ID e/o SANITY_API_TOKEN in backend/.env — vedi il commento in testa a questo file.');
    process.exit(1);
  }

  const sanity = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET || 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
  });

  const tipiCamera = (await pool.query('SELECT id, nome FROM tipi_camera ORDER BY nome')).rows;
  const documentiSanity = await sanity.fetch(`*[_type == "camera"]{_id, "nome": nome.it, tipoCameraId}`);

  console.log(`Tipi camera nel gestionale: ${tipiCamera.length}`);
  console.log(`Documenti camera in Sanity: ${documentiSanity.length}\n`);

  const daScrivere = [];
  const giaCollegati = [];
  const conflitti = [];
  const nonTrovati = [];

  for (const tipo of tipiCamera) {
    const match = documentiSanity.find(d => normalizza(d.nome) === normalizza(tipo.nome));
    if (!match) {
      nonTrovati.push(tipo);
    } else if (match.tipoCameraId === tipo.id) {
      giaCollegati.push({ tipo, match });
    } else if (match.tipoCameraId != null) {
      conflitti.push({ tipo, match });
    } else {
      daScrivere.push({ tipo, match });
    }
  }

  if (giaCollegati.length) {
    console.log('Già collegati correttamente:');
    giaCollegati.forEach(({ tipo, match }) => console.log(`  ✓ gestionale #${tipo.id} "${tipo.nome}" ↔ Sanity "${match.nome}" (${match._id})`));
    console.log();
  }

  if (daScrivere.length) {
    console.log(APPLICA ? 'Scrittura in corso:' : 'Da collegare (dry run — nessuna scrittura ancora):');
    daScrivere.forEach(({ tipo, match }) => console.log(`  → gestionale #${tipo.id} "${tipo.nome}" ↔ Sanity "${match.nome}" (${match._id})`));
    console.log();
  }

  if (conflitti.length) {
    console.log('ATTENZIONE — documento Sanity già collegato a un ALTRO tipo camera, non toccato automaticamente:');
    conflitti.forEach(({ tipo, match }) => console.log(`  ⚠ gestionale #${tipo.id} "${tipo.nome}" — Sanity "${match.nome}" (${match._id}) ha già tipoCameraId=${match.tipoCameraId}`));
    console.log('  Risolvi a mano in Sanity Studio prima di rilanciare.\n');
  }

  if (nonTrovati.length) {
    console.log('Nessuna corrispondenza automatica per nome (da collegare a mano in Sanity Studio):');
    nonTrovati.forEach(tipo => console.log(`  ? gestionale #${tipo.id} "${tipo.nome}"`));
    console.log();
  }

  if (!APPLICA) {
    console.log('DRY RUN — nessuna scrittura effettuata. Rilancia con --applica per scrivere tipoCameraId sui documenti sopra.');
    await pool.end();
    return;
  }

  for (const { tipo, match } of daScrivere) {
    await sanity.patch(match._id).set({ tipoCameraId: tipo.id }).commit();
    console.log(`  ✓ scritto: Sanity "${match.nome}" → tipoCameraId = ${tipo.id}`);
  }
  console.log('\nFatto.');
  await pool.end();
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
