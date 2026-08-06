// Job giornaliero — promemoria pre-arrivo e richiesta recensione post-partenza
// (modulo 5.3, parte email — 04/08/2026). Avviato una sola volta da
// server.js (MAI da app.js, che è usato anche da Jest — un cron avviato lì
// girerebbe anche durante i test).
//
// Tempistiche: promemoria 3 giorni prima dell'arrivo più vicino della
// prenotazione, recensione 1 giorno dopo la partenza più lontana — scelte
// ragionevoli di default per il caso comune (una camera/un soggiorno),
// valgono anche per prenotazioni multi-camera. Idempotente: ogni prenotazione
// viene considerata solo se la colonna `*_inviata_at` corrispondente è
// ancora NULL, quindi rieseguire il job più volte nello stesso giorno non
// duplica gli invii.

const cron = require('node-cron');
const pool = require('../config/db');
const { inviaPromemoriaPreArrivo, inviaRichiestaRecensione } = require('../lib/emailPrenotazioni');

const GIORNI_PRIMA_PROMEMORIA = 3;
const GIORNI_DOPO_RECENSIONE = 1;

// Prenotazioni con soggiorni attivi il cui arrivo più vicino cade esattamente
// tra GIORNI_PRIMA_PROMEMORIA giorni, promemoria non ancora inviato, stato
// che implica un arrivo atteso (non 'interrotta').
async function trovaPrenotazioniPerPromemoria() {
  const result = await pool.query(
    `SELECT p.id
     FROM prenotazioni p
     WHERE p.email_promemoria_inviata_at IS NULL
       AND p.stato IN ('opzione', 'confermata')
       AND EXISTS (
         SELECT 1 FROM soggiorni s
         WHERE s.prenotazione_id = p.id AND s.cancellato = false
         GROUP BY s.prenotazione_id
         HAVING MIN(s.data_arrivo) = CURRENT_DATE + $1::INTEGER
       )`,
    [GIORNI_PRIMA_PROMEMORIA]
  );
  return result.rows.map(r => r.id);
}

// Prenotazioni la cui partenza più lontana è passata da esattamente
// GIORNI_DOPO_RECENSIONE giorni, recensione non ancora inviata, soggiorno
// concluso regolarmente (check_out o chiusa — non un'interruzione anticipata).
async function trovaPrenotazioniPerRecensione() {
  const result = await pool.query(
    `SELECT p.id
     FROM prenotazioni p
     WHERE p.email_recensione_inviata_at IS NULL
       AND p.stato IN ('check_out', 'chiusa')
       AND EXISTS (
         SELECT 1 FROM soggiorni s
         WHERE s.prenotazione_id = p.id AND s.cancellato = false
         GROUP BY s.prenotazione_id
         HAVING MAX(s.data_partenza) = CURRENT_DATE - $1::INTEGER
       )`,
    [GIORNI_DOPO_RECENSIONE]
  );
  return result.rows.map(r => r.id);
}

// Esegue un giro completo — esportata a parte per poterla richiamare anche
// manualmente (es. da uno script/test), non solo dallo scheduler.
async function eseguiGiro() {
  const daPromemoria = await trovaPrenotazioniPerPromemoria();
  for (const id of daPromemoria) {
    await inviaPromemoriaPreArrivo(id);
  }

  const daRecensione = await trovaPrenotazioniPerRecensione();
  for (const id of daRecensione) {
    await inviaRichiestaRecensione(id);
  }

  return { promemoriaInviati: daPromemoria.length, recensioniInviate: daRecensione.length };
}

// Avvia lo scheduler — una volta al giorno alle 08:00. Chiamata solo da
// server.js, mai in fase di test.
function avviaJobPromemoriaEmail() {
  cron.schedule('0 8 * * *', () => {
    eseguiGiro().catch(err => console.error('[job promemoriaEmail] errore imprevisto:', err.message));
  });
  console.log('Job promemoria/recensione email pianificato (ogni giorno alle 08:00).');
}

module.exports = { avviaJobPromemoriaEmail, eseguiGiro };
