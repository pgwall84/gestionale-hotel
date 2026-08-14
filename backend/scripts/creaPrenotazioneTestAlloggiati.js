// Script una tantum — crea (o elimina) una prenotazione/soggiorno FITTIZIO
// pensato solo per testare il metodo Test di WS_ALLOGGIATI (modulo 2.5 Fase
// 2, controllo di formato — "NESSUNA schedina viene mai acquisita dal
// sistema", manuale pag. 9) senza dover compilare a mano una scheda ospite
// completa di tutti i campi codificati Alloggiati Web.
//
// Idempotente: usa un external_booking_id fisso (TEST-ALLOGGIATI-SCHEDINA)
// come chiave — se la prenotazione esiste già, non la ricrea, stampa solo
// l'id del soggiorno già pronto. `--elimina` cancella tutto quello creato
// (ospite compreso, nessun'altra tabella lo referenzia per un ospite di
// test mai usato altrove — verificato: solo soggiorni/soggiorno_ospiti
// hanno FK NOT NULL su ospiti, le altre due (offerte email, pre-checkin)
// sono nullable e mai popolate qui).
//
// STORIA — perché non una data futura (13/08/2026): primo tentativo con
// data_arrivo lontanissima (2099), poi con "domani" — ENTRAMBE respinte da
// WS_ALLOGGIATI col metodo Test: ErroreCod 12 SCHEDINA_CAMPO_NON_CORRETTO —
// "Data di Arrivo Errata". Il tracciato/formato gg/mm/aaaa è quello
// richiesto dal manuale (verificato pag. 19-20), quindi non è un problema
// di formato. Il fatto che anche "domani" fallisca esclude l'ipotesi
// "troppo lontana nel futuro": la regola reale, non documentata nel
// manuale ma confermata da riscontri esterni (community Airbnb Italia +
// blog di settore sull'uso di questo stesso webservice) è che Alloggiati
// Web serve a comunicare un arrivo GIÀ AVVENUTO, entro 24 ore — "si ha la
// possibilità di inserire la data di check-in del giorno prima entro le
// 24 ore". Data Arrivo quindi non può MAI essere nel futuro: al massimo
// oggi (o ieri). Corretto usando OGGI come default, cercando in automatico
// la prima camera libera partendo da oggi invece di una data futura
// "sicura per costruzione" — vedi trovaCameraLibera sotto.
//
// Effetto collaterale di questo cambio: ora il soggiorno di test appare
// per davvero nel planning reale (`/planning-camere`), con arrivo oggi
// stesso — nome ospite reso il più esplicito possibile ("TEST ALLOGGIATI —
// NON REALE") apposta per non essere scambiato per un ospite vero.
// Eliminarlo con --elimina appena finito di testare, non lasciarlo lì.
//
// ATTENZIONE: questo soggiorno NON va mai usato con il pulsante "Invia
// reale" (Send) — è un ospite inventato, l'invio reale registrerebbe dati
// falsi presso la Polizia di Stato. Solo "Verifica schedina" (Test).
//
// Uso:
//   node backend/scripts/creaPrenotazioneTestAlloggiati.js               → crea (oggi, 1 notte, prima camera libera trovata)
//   node backend/scripts/creaPrenotazioneTestAlloggiati.js --arrivo=2026-09-01 --notti=2 --camera=3
//                                                                          → forza data/notti/camera specifiche
//   node backend/scripts/creaPrenotazioneTestAlloggiati.js --elimina      → pulisce

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/db');
const { ITALIA_CODICE } = require('../lib/alloggiatiSchedina');

const EXTERNAL_BOOKING_ID = 'TEST-ALLOGGIATI-SCHEDINA';

function argomento(nome) {
  const arg = process.argv.find(a => a.startsWith(`--${nome}=`));
  return arg ? arg.split('=')[1] : null;
}

function fmtData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function aggiungiGiorni(dataStr, giorni) {
  const d = new Date(`${dataStr}T00:00:00`);
  d.setDate(d.getDate() + giorni);
  return fmtData(d);
}

async function trovaPrenotazioneEsistente() {
  const res = await pool.query(
    `SELECT p.id AS prenotazione_id, s.id AS soggiorno_id, s.ospite_id, c.numero AS camera_numero,
            s.data_arrivo, s.data_partenza
     FROM prenotazioni p
     JOIN soggiorni s ON s.prenotazione_id = p.id
     JOIN camere c ON c.id = s.camera_id
     WHERE p.external_booking_id = $1`,
    [EXTERNAL_BOOKING_ID]
  );
  return res.rows[0] || null;
}

async function elimina() {
  const esistente = await trovaPrenotazioneEsistente();
  if (!esistente) {
    console.log('Nessuna prenotazione di test trovata — niente da eliminare.');
    return;
  }
  await pool.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = $1', [esistente.soggiorno_id]);
  await pool.query('DELETE FROM soggiorni WHERE id = $1', [esistente.soggiorno_id]);
  await pool.query('DELETE FROM prenotazioni WHERE id = $1', [esistente.prenotazione_id]);
  await pool.query('DELETE FROM ospiti WHERE id = $1', [esistente.ospite_id]);
  console.log(`Eliminati: prenotazione #${esistente.prenotazione_id}, soggiorno #${esistente.soggiorno_id}, ospite #${esistente.ospite_id}.`);
}

// Cerca la prima combinazione camera+data libera tra un piccolo insieme di
// date CANDIDATE (mai future — vedi nota in testa al file), camera per
// camera — stessa logica del vincolo EXCLUDE su soggiorni (daterange '[)'
// + cancellato=false), verificata qui PRIMA dell'INSERT invece di
// scoprirla da un errore 23P01 a metà transazione. Restituisce null se
// nessuna delle date candidate ha una camera libera (es. hotel pieno sia
// oggi che ieri — possibile in alta stagione).
async function trovaCameraLibera(dateCandidate, notti) {
  const camereRes = await pool.query(`SELECT id, numero FROM camere WHERE attivo = true ORDER BY id`);
  if (camereRes.rows.length === 0) return null;

  for (const dataArrivo of dateCandidate) {
    const dataPartenza = aggiungiGiorni(dataArrivo, notti);
    for (const camera of camereRes.rows) {
      const conflittoRes = await pool.query(
        `SELECT 1 FROM soggiorni
         WHERE camera_id = $1 AND cancellato = false
           AND daterange(data_arrivo, data_partenza, '[)') && daterange($2::date, $3::date, '[)')
         LIMIT 1`,
        [camera.id, dataArrivo, dataPartenza]
      );
      if (conflittoRes.rows.length === 0) {
        return { camera, dataArrivo, dataPartenza };
      }
    }
  }
  return null;
}

async function crea() {
  const esistente = await trovaPrenotazioneEsistente();
  if (esistente) {
    console.log('La prenotazione di test esiste già — nessuna duplicazione.');
    console.log(`  Camera: ${esistente.camera_numero}, ${esistente.data_arrivo} → ${esistente.data_partenza}`);
    console.log(`  Soggiorno da usare per "Verifica schedina": #${esistente.soggiorno_id}`);
    console.log('  (Per rigenerarla con date diverse: prima --elimina, poi rilancia.)');
    return;
  }

  // 1. Codici reali già sincronizzati (Impostazioni ▸ Alloggiati Web ▸
  //    "Sincronizza ora") — se mancano, meglio fermarsi con un messaggio
  //    chiaro che generare una riga con codici inventati.
  const comuneRes = await pool.query(
    `SELECT codice, descrizione FROM alloggiati_codici WHERE tabella = 'Luoghi' AND descrizione ILIKE '%LERICI%' ORDER BY descrizione LIMIT 1`
  );
  const documentoRes = await pool.query(
    `SELECT codice, descrizione FROM alloggiati_codici WHERE tabella = 'Tipi_Documento' AND descrizione ILIKE '%IDENTIT%' ORDER BY descrizione LIMIT 1`
  );
  if (comuneRes.rows.length === 0 || documentoRes.rows.length === 0) {
    console.error(
      'Tabelle di codifica non ancora sincronizzate (o "Lerici"/"Carta d\'identità" non trovati).\n' +
      'Vai su Impostazioni ▸ Alloggiati Web ▸ "Sincronizza ora" e rilancia questo script.'
    );
    process.exit(1);
  }
  const comune = comuneRes.rows[0];
  const documento = documentoRes.rows[0];

  // 2. Camera + data: da CLI se specificate, altrimenti la prima libera tra
  //    oggi e ieri (default 1 notte) — MAI una data futura, vedi nota in
  //    testa al file: WS_ALLOGGIATI la respinge come "Data di Arrivo
  //    Errata", il servizio serve a comunicare un arrivo già avvenuto.
  const cameraIdForzata = argomento('camera');
  const arrivoForzato = argomento('arrivo');
  const notti = Number(argomento('notti') || 1);

  let camera, dataArrivo, dataPartenza;
  if (cameraIdForzata && arrivoForzato) {
    const camRes = await pool.query('SELECT id, numero FROM camere WHERE id = $1', [cameraIdForzata]);
    if (camRes.rows.length === 0) {
      console.error(`Camera id ${cameraIdForzata} non trovata.`);
      process.exit(1);
    }
    camera = camRes.rows[0];
    dataArrivo = arrivoForzato;
    dataPartenza = aggiungiGiorni(dataArrivo, notti);
  } else {
    const oggi = fmtData(new Date());
    const ieri = aggiungiGiorni(oggi, -1);
    const trovata = await trovaCameraLibera(arrivoForzato ? [arrivoForzato] : [oggi, ieri], notti);
    if (!trovata) {
      console.error(
        `Nessuna camera libera oggi né ieri (hotel pieno — può succedere in alta stagione).\n` +
        'Data Arrivo non può comunque essere futura per WS_ALLOGGIATI: se conosci una camera con un ' +
        'soggiorno appena concluso, forza tu la combinazione: --camera=<id> --arrivo=YYYY-MM-DD [--notti=N] ' +
        '(arrivo non successivo a oggi).'
      );
      process.exit(1);
    }
    camera = trovata.camera;
    dataArrivo = trovata.dataArrivo;
    dataPartenza = trovata.dataPartenza;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ospiteRes = await client.query(
      `INSERT INTO ospiti (
         nome, cognome, sesso, data_nascita,
         stato_nascita_codice, comune_nascita_codice, provincia_nascita,
         cittadinanza_codice, documento_tipo_codice, documento_numero, luogo_rilascio_codice,
         note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        'TEST', 'ALLOGGIATI NON REALE', 'M', '1990-05-15',
        ITALIA_CODICE, comune.codice, 'SP',
        ITALIA_CODICE, documento.codice, 'CA00000TEST', comune.codice,
        'Ospite FITTIZIO creato da creaPrenotazioneTestAlloggiati.js — solo per il metodo Test (controllo formato). Mai usare con Send. Eliminare con --elimina appena finito di testare.',
      ]
    );
    const ospiteId = ospiteRes.rows[0].id;

    const prenotazioneRes = await client.query(
      `INSERT INTO prenotazioni (canale_origine, external_booking_id, stato, note)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['test_interno', EXTERNAL_BOOKING_ID, 'confermata', 'Prenotazione di TEST — modulo 2.5 Fase 2 (Alloggiati Web). Eliminare con: node backend/scripts/creaPrenotazioneTestAlloggiati.js --elimina']
    );
    const prenotazioneId = prenotazioneRes.rows[0].id;

    let soggiornoId;
    try {
      const soggiornoRes = await client.query(
        `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
         VALUES ($1,$2,$3,$4,$5,1) RETURNING id`,
        [prenotazioneId, camera.id, ospiteId, dataArrivo, dataPartenza]
      );
      soggiornoId = soggiornoRes.rows[0].id;
    } catch (err) {
      if (err.code === '23P01') {
        // Vincolo anti-overbooking — qualcun altro ha prenotato la stessa
        // camera/data tra la ricerca sopra e questo INSERT (finestra molto
        // stretta, ma possibile). Messaggio chiaro invece dello stack trace
        // grezzo di Postgres.
        throw new Error(`Camera ${camera.numero} risultava libera ma non lo è più (prenotata nel frattempo) — rilancia lo script.`);
      }
      throw err;
    }

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1,$2,'16')`,
      [soggiornoId, ospiteId]
    );

    await client.query('COMMIT');

    console.log('Prenotazione di test creata:');
    console.log(`  Camera: ${camera.numero} (id ${camera.id})`);
    console.log(`  Date: ${dataArrivo} → ${dataPartenza}`);
    console.log(`  Comune di nascita usato: ${comune.descrizione} (${comune.codice})`);
    console.log(`  Tipo documento usato: ${documento.descrizione} (${documento.codice})`);
    console.log(`  Soggiorno da usare per "Verifica schedina": #${soggiornoId}`);
    console.log('\n⚠️  Compare per davvero nel planning (nome ospite: "TEST ALLOGGIATI NON REALE").');
    console.log('   Eliminala appena finito di testare:');
    console.log('   node backend/scripts/creaPrenotazioneTestAlloggiati.js --elimina');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const elimina_ = process.argv.includes('--elimina');
  if (elimina_) {
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
