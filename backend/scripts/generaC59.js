// CLI — genera il file XML RIMOVCLI/ISTAT C/59 di un giorno con dati REALI
// dal gestionale. Da lanciare in locale (serve il DB, non raggiungibile
// dalla sessione Cowork che ha scritto questo script — vedi diario
// 27/08/2026).
//
// Uso:
//   node scripts/generaC59.js 2026-08-26
//   node scripts/generaC59.js 2026-08-26 COD1
//
// Se l'idstruttura non è passato, usa "DA_CONFIGURARE" (nessun codice reale
// finché la certificazione con Regione Liguria non ha esito positivo — vedi
// STATO_PROGETTO.md riga 2.6).
//
// Il file va salvato in docs/ross1000/test-certificazione/ (stessa cartella
// del primo test placeholder) per tenere tutto insieme.

const fs = require('fs');
const path = require('path');
const { generaGiornoC59 } = require('../lib/rimovcliC59');
const pool = require('../config/db');

async function main() {
  const giorno = process.argv[2];
  const idstruttura = process.argv[3] || 'DA_CONFIGURARE';

  if (!giorno || !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) {
    console.error('Uso: node scripts/generaC59.js YYYY-MM-DD [IDSTRUTTURA]');
    process.exit(1);
  }

  const { xml, avvisi } = await generaGiornoC59({ idstruttura, giorno });

  const cartella = path.join(__dirname, '..', '..', 'docs', 'ross1000', 'test-certificazione');
  fs.mkdirSync(cartella, { recursive: true });
  const nomeFile = `${idstruttura}_${giorno.replace(/-/g, '')}.xml`;
  const percorso = path.join(cartella, nomeFile);
  fs.writeFileSync(percorso, xml);

  console.log('File scritto:', percorso);
  if (avvisi.length) {
    console.log(`\n${avvisi.length} avviso/i (anche nel commento XML in testa al file):`);
    avvisi.forEach(a => console.log(' -', a));
  } else {
    console.log('Nessun avviso.');
  }

  await pool.end();
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
