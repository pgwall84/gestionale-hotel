// Script una tantum — importa le 4 tabelle di codifica Alloggiati Web
// (Stati+Comuni, Tipi_Documento, Tipi_Alloggiato) da CSV scaricati a mano
// dal portale, senza aspettare la sincronizzazione SOAP reale (credenziali
// WS_ALLOGGIATI non ancora usate). Popola le stesse righe che scriverebbe
// "Sincronizza ora" (Impostazioni ▸ Alloggiati Web) — stesso upsert, stessa
// tabella `alloggiati_codici` — quindi è completamente sicuro rieseguire
// "Sincronizza ora" più avanti: sovrascrive semplicemente questi dati con
// quelli veri via SOAP.
//
// Uso: node backend/scripts/importaCodiciAlloggiatiCsv.js
// Funziona da qualunque cartella di lancio (radice del repo o backend/) —
// il .env viene caricato esplicitamente da backend/.env sotto, invece di
// affidarsi al comportamento di default di dotenv (cerca .env nella
// cartella da cui è stato lanciato node, non quella dello script: lanciando
// il comando dalla radice del repo invece che da backend/, config/db.js non
// troverebbe backend/.env e la password del database resterebbe undefined
// — è l'errore "client password must be a string" del primo tentativo).
//
// Mappatura file → tabella (deve combaciare con l'enum ufficiale TipoTabella
// del manuale WS_ALLOGGIATI, id 0/1/2 — Luoghi=Stati+Comuni insieme, non due
// tabelle separate, anche se qui arrivano da due file CSV distinti):
//   stati.csv, comuni.csv   → tabella 'Luoghi'
//   documenti.csv           → tabella 'Tipi_Documento'
//   tipo_alloggiato.csv     → tabella 'Tipi_Alloggiato'

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/db');
const { parseCsv } = require('../lib/alloggiatiSoapClient');

const CARTELLA_CSV = path.join(__dirname, '..', '..', 'docs', 'alloggiati web');

const FILE_TABELLA = [
  { file: 'stati.csv', tabella: 'Luoghi' },
  { file: 'comuni.csv', tabella: 'Luoghi' },
  { file: 'documenti.csv', tabella: 'Tipi_Documento' },
  { file: 'tipo_alloggiato.csv', tabella: 'Tipi_Alloggiato' },
];

async function importaFile({ file, tabella }) {
  const percorso = path.join(CARTELLA_CSV, file);
  if (!fs.existsSync(percorso)) {
    console.log(`  ${file}: non trovato, salto (${percorso})`);
    return 0;
  }
  const testo = fs.readFileSync(percorso, 'utf8');
  const righe = parseCsv(testo);
  if (righe.length === 0) {
    console.log(`  ${file}: 0 righe lette, salto`);
    return 0;
  }

  const colonne = Object.keys(righe[0]);
  const colonnaCodice = colonne[0];
  const colonnaDescrizione = colonne[1] ?? colonnaCodice;

  let importate = 0;
  for (const riga of righe) {
    const codice = riga[colonnaCodice];
    if (!codice) continue;
    const descrizione = riga[colonnaDescrizione] || codice;
    await pool.query(
      `INSERT INTO alloggiati_codici (tabella, codice, descrizione, dati_extra, sincronizzato_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tabella, codice) DO UPDATE SET
         descrizione = EXCLUDED.descrizione,
         dati_extra = EXCLUDED.dati_extra,
         sincronizzato_at = now()`,
      [tabella, codice, descrizione, JSON.stringify(riga)]
    );
    importate++;
  }
  console.log(`  ${file} → tabella '${tabella}': ${importate} righe importate`);
  return importate;
}

async function main() {
  console.log(`Importazione da: ${CARTELLA_CSV}`);
  let totale = 0;
  for (const voce of FILE_TABELLA) {
    totale += await importaFile(voce);
  }
  console.log(`Fatto — ${totale} righe totali importate/aggiornate in alloggiati_codici.`);
  await pool.end();
}

main().catch(err => {
  console.error('Errore importazione:', err);
  process.exit(1);
});
