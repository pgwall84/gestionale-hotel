// Script diagnostico, sola lettura — nessuna scrittura, nessun --applica.
// Booking Engine v2 (19/08/2026): il titolare segnala che la ricerca
// disponibilità non trova mai camere per 3 o 4 adulti. La query in
// bookingPubblicoController.disponibilita() esclude un tipo camera se: (a)
// capienza_max è impostata troppo bassa, (b) nessuna camera attiva è
// assegnata a quel tipo, oppure (c) calcolaTariffa non trova una tariffa
// valida per le date cercate (tariffa_totale null). Questo script controlla
// tutti e tre insieme per Tripla e Quadrupla, così invece di indovinare si
// vede subito quale dei tre è il problema.
//
// Uso: node backend/scripts/diagnosticaTripleQuadruple.js

require('dotenv').config();
const pool = require('../config/db');

async function main() {
  const tipi = (await pool.query(
    `SELECT id, nome, capienza_max, attivo FROM tipi_camera WHERE nome IN ('Tripla', 'Quadrupla') ORDER BY nome`
  )).rows;

  if (!tipi.length) {
    console.log('Nessun tipo camera "Tripla" o "Quadrupla" trovato — nomi cambiati?');
    await pool.end();
    return;
  }

  for (const tipo of tipi) {
    console.log(`\n=== ${tipo.nome} (id=${tipo.id}) ===`);
    console.log(`capienza_max: ${tipo.capienza_max === null ? 'NULL (nessun limite — non è la causa)' : tipo.capienza_max}`);
    console.log(`attivo: ${tipo.attivo}`);

    const camere = (await pool.query(
      `SELECT numero, attivo FROM camere WHERE tipo_camera_id = $1 ORDER BY numero`,
      [tipo.id]
    )).rows;
    if (!camere.length) {
      console.log('camere assegnate: NESSUNA — questo è quasi certamente il problema: nessuna camera fisica risulta di questo tipo.');
    } else {
      console.log(`camere assegnate: ${camere.map(c => `${c.numero}${c.attivo ? '' : ' (disattivata!)'}`).join(', ')}`);
    }

    const tariffe = (await pool.query(
      `SELECT id, nome_stagione, data_inizio, data_fine, prezzo_notte
       FROM tariffe WHERE tipo_camera_id = $1 ORDER BY data_inizio`,
      [tipo.id]
    )).rows;
    if (!tariffe.length) {
      console.log('tariffe configurate: NESSUNA — anche se le camere fossero assegnate correttamente, calcolaTariffa tornerebbe sempre null e la ricerca le escluderebbe comunque (calcolaTariffa richiede una tariffa per OGNI notte del soggiorno cercato, non basta che ce ne sia una qualsiasi).');
    } else {
      console.log('tariffe configurate:');
      tariffe.forEach(t => console.log(`  ${t.nome_stagione || '(senza nome)'} — dal ${t.data_inizio} al ${t.data_fine} — €${t.prezzo_notte}/notte`));
      const oggi = new Date().toISOString().slice(0, 10);
      const copertaOggi = tariffe.some(t => t.data_inizio <= oggi && t.data_fine >= oggi);
      if (!copertaOggi) {
        console.log('  ATTENZIONE: nessuna di queste tariffe copre la data odierna — se stavi cercando date vicine a oggi, potrebbe essere questo il problema (calcolaTariffa esclude il tipo camera se anche una sola notte del periodo cercato non è coperta).');
      }
    }
  }

  console.log('\nFatto. Se "camere assegnate" è vuoto per uno dei due, va assegnato da Impostazioni ▸ Camere. Se "tariffe configurate" è vuoto, va creato un listino da /tariffe.');
  await pool.end();
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
