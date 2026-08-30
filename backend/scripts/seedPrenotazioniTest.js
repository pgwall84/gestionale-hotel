// Script una tantum — popola il DB con prenotazioni/soggiorni/ospiti
// REALISTICI E CASUALI su una finestra di ±15 giorni da oggi, per poter
// vedere graficamente il planning popolato (tutti gli stati: passate,
// in corso, che arrivano domani, future) prima di decidere dove agganciare
// il flusso operativo di invio Alloggiati Web/ROSS1000 (13/08/2026, su
// richiesta esplicita del titolare).
//
// A differenza di creaPrenotazioneTestAlloggiati.js (UN soggiorno,
// nome esplicitamente marcato "non reale"), qui i nomi sono volutamente
// casuali/plausibili — serve vedere come si presenta il gestionale con
// dati "normali", non un singolo record vistosamente finto. Identificabile
// e ripulibile comunque in modo sicuro tramite canale_origine='test_interno'
// + prefisso 'SEED-TEST-' su external_booking_id (mai usato da prenotazioni
// reali, che arrivano da reception/OTA).
//
// Mix intenzionale di profili completi/incompleti (~80/20) e di nascite in
// Italia/estero (~85/15): serve a vedere anche gli avvisi "dati mancanti"
// di Alloggiati Web (Test) e ROSS1000 (export XML), non solo il caso
// felice. Popola anche i campi di RESIDENZA (stato/comune_residenza),
// richiesti dal tracciato ROSS1000 ma non da quello Alloggiati Web.
//
// Idempotente: se esistono già prenotazioni SEED-TEST-*, non ne crea altre
// — usa --pulisci per cancellarle tutte prima di rigenerare.
//
// Uso:
//   node backend/scripts/seedPrenotazioniTest.js            → crea (±15 giorni da oggi)
//   node backend/scripts/seedPrenotazioniTest.js --pulisci   → cancella tutto quello seminato
//   node backend/scripts/seedPrenotazioniTest.js --da=2026-08-28 --a=2026-09-15 --quota-camere=0.55 --completi
//     → finestra custom, ~55% delle camere usate (le altre restano libere),
//       anagrafiche complete (email, telefono, documento, residenza)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/db');
const { ITALIA_CODICE } = require('../lib/alloggiatiSchedina');

const GIORNI_INDIETRO = 15;
const GIORNI_AVANTI = 15;
const PREFISSO = 'SEED-TEST-';
const ALLERGIE = [null, null, null, 'glutine', 'lattosio', 'frutta a guscio', 'nessuna nota alimentare'];
const TAG_CANALE = [['telefono'], ['booking.com'], ['sito'], ['walk-in'], ['email']];

function argomento(nome) {
  const arg = process.argv.find(a => a.startsWith(`--${nome}=`));
  return arg ? arg.split('=')[1] : null;
}

// Province delle città usate per le nascite/residenze in Italia — non
// deducibile dalle colonne di alloggiati_codici (struttura di "Luoghi" solo
// parzialmente documentata, vedi commento in migration 022), quindi mappa
// manuale su una manciata di città note invece di inventare un parser.
const CITTA_ITALIANE = [
  { pattern: 'LERICI', provincia: 'SP' },
  { pattern: 'LA SPEZIA', provincia: 'SP' },
  { pattern: 'GENOVA', provincia: 'GE' },
  { pattern: 'MILANO', provincia: 'MI' },
  { pattern: 'ROMA', provincia: 'RM' },
  { pattern: 'TORINO', provincia: 'TO' },
  { pattern: 'FIRENZE', provincia: 'FI' },
  { pattern: 'NAPOLI', provincia: 'NA' },
  { pattern: 'BOLOGNA', provincia: 'BO' },
  { pattern: 'VENEZIA', provincia: 'VE' },
];
const PAESI_ESTERI = ['FRANCIA', 'GERMANIA', 'REGNO UNITO', 'SVIZZERA', 'STATI UNITI'];

const NOMI_M = ['Marco', 'Luca', 'Andrea', 'Matteo', 'Francesco', 'Alessandro', 'Giuseppe', 'Antonio', 'Davide', 'Simone', 'Federico', 'Riccardo', 'Stefano', 'Paolo', 'Roberto'];
const NOMI_F = ['Giulia', 'Chiara', 'Francesca', 'Valentina', 'Sara', 'Elisa', 'Martina', 'Alice', 'Laura', 'Silvia', 'Elena', 'Anna', 'Paola', 'Cristina', 'Roberta'];
const COGNOMI = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

function fmtData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function aggiungiGiorni(dataStr, giorni) {
  const d = new Date(`${dataStr}T00:00:00`);
  d.setDate(d.getDate() + giorni);
  return fmtData(d);
}
function dataCasualeNascita() {
  const eta = randInt(20, 75);
  const oggi = new Date();
  const anno = oggi.getFullYear() - eta;
  const mese = randInt(1, 12);
  const giorno = randInt(1, 28); // 28 sempre valido, evita febbraio fuori range
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}
function documentoNumeroCasuale() {
  const lettere = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return `${pick(lettere.split(''))}${pick(lettere.split(''))}${randInt(1000000, 9999999)}`;
}
function emailCasuale(nome, cognome) {
  const slug = `${nome}.${cognome}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.');
  return `${slug}.${randInt(10, 99)}@example.test`;
}
function telefonoCasuale() {
  return `+39 3${randInt(30, 99)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;
}

async function caricaAnagraficheDisponibili() {
  const comuni = [];
  for (const c of CITTA_ITALIANE) {
    const res = await pool.query(
      `SELECT codice, descrizione FROM alloggiati_codici WHERE tabella = 'Luoghi' AND descrizione ILIKE $1 ORDER BY descrizione LIMIT 1`,
      [`%${c.pattern}%`]
    );
    if (res.rows.length > 0) comuni.push({ ...res.rows[0], provincia: c.provincia });
  }
  const esteri = [];
  for (const p of PAESI_ESTERI) {
    const res = await pool.query(
      `SELECT codice, descrizione FROM alloggiati_codici WHERE tabella = 'Luoghi' AND descrizione ILIKE $1 ORDER BY descrizione LIMIT 1`,
      [`%${p}%`]
    );
    if (res.rows.length > 0) esteri.push(res.rows[0]);
  }
  const documentiRes = await pool.query(
    `SELECT codice, descrizione FROM alloggiati_codici WHERE tabella = 'Tipi_Documento' AND (descrizione ILIKE '%IDENT%' OR descrizione ILIKE '%PASSAPORT%')`
  );
  return { comuni, esteri, documenti: documentiRes.rows };
}

// Genera i dati di un ospite casuale — mix ~80% profili completi (tutti i
// campi Alloggiati Web + residenza compilati con codici reali già
// sincronizzati) / ~20% incompleti (mancano volutamente dei dati, per poter
// vedere gli avvisi "dati mancanti" di Test/ROSS1000 con dati veri, non solo
// nel caso ideale). ~15% nati all'estero quando esistono paesi sincronizzati.
function generaOspite({ comuni, esteri, documenti, forzaCompleto = false, cognomeFisso = null }) {
  const sesso = Math.random() < 0.5 ? 'M' : 'F';
  const nome = pick(sesso === 'M' ? NOMI_M : NOMI_F);
  const cognome = cognomeFisso || pick(COGNOMI);
  const completo = forzaCompleto || Math.random() < 0.8;
  const nascitaEstero = completo && esteri.length > 0 && Math.random() < 0.15;

  let statoNascitaCodice, statoNascitaTesto, comuneNascitaCodice, comuneNascitaTesto, provinciaNascita;
  if (nascitaEstero) {
    const paese = pick(esteri);
    statoNascitaCodice = paese.codice; statoNascitaTesto = paese.descrizione;
    comuneNascitaCodice = null; comuneNascitaTesto = null; provinciaNascita = null;
  } else {
    statoNascitaCodice = ITALIA_CODICE; statoNascitaTesto = 'ITALIA';
    const comune = completo && comuni.length > 0 ? pick(comuni) : null;
    comuneNascitaCodice = comune?.codice ?? null;
    comuneNascitaTesto = comune?.descrizione ?? null;
    provinciaNascita = comune?.provincia ?? null;
  }
  // Cittadinanza: stessa nazionalità della nascita nella grande maggioranza
  // dei casi — semplificazione accettabile per dati di test.
  const cittadinanzaCodice = statoNascitaCodice;
  const cittadinanzaTesto = statoNascitaTesto;

  let documentoTipoCodice = null, documentoTipoTesto = null, documentoNumero = null,
    documentoScadenza = null, luogoRilascioCodice = null, luogoRilascioTesto = null;
  if (completo && documenti.length > 0) {
    const doc = pick(documenti);
    documentoTipoCodice = doc.codice; documentoTipoTesto = doc.descrizione;
    documentoNumero = documentoNumeroCasuale();
    documentoScadenza = aggiungiGiorni(fmtData(new Date()), randInt(180, 8 * 365));
    if (!nascitaEstero && comuneNascitaCodice) {
      luogoRilascioCodice = comuneNascitaCodice; luogoRilascioTesto = comuneNascitaTesto;
    } else {
      luogoRilascioCodice = statoNascitaCodice; luogoRilascioTesto = statoNascitaTesto;
    }
  }

  // Residenza — indipendente dalla nascita, quasi sempre in Italia (i clienti
  // esteri per un hotel in Liguria sono comunque residenti all'estero più
  // spesso, ma per restare semplici qui usiamo solo comuni italiani).
  let statoResidenzaCodice = null, statoResidenzaTesto = null, comuneResidenzaCodice = null, comuneResidenzaTesto = null;
  if (completo && comuni.length > 0) {
    statoResidenzaCodice = ITALIA_CODICE; statoResidenzaTesto = 'ITALIA';
    const comuneRes = pick(comuni);
    comuneResidenzaCodice = comuneRes.codice; comuneResidenzaTesto = comuneRes.descrizione;
  }

  return {
    nome, cognome, sesso, data_nascita: dataCasualeNascita(),
    stato_nascita_codice: statoNascitaCodice, stato_nascita_testo: statoNascitaTesto,
    comune_nascita_codice: comuneNascitaCodice, comune_nascita_testo: comuneNascitaTesto,
    provincia_nascita: provinciaNascita,
    cittadinanza_codice: cittadinanzaCodice, cittadinanza_testo: cittadinanzaTesto,
    documento_tipo_codice: documentoTipoCodice, documento_tipo_testo: documentoTipoTesto,
    documento_numero: documentoNumero, documento_scadenza: documentoScadenza,
    luogo_rilascio_codice: luogoRilascioCodice, luogo_rilascio_testo: luogoRilascioTesto,
    stato_residenza_codice: statoResidenzaCodice, stato_residenza_testo: statoResidenzaTesto,
    comune_residenza_codice: comuneResidenzaCodice, comune_residenza_testo: comuneResidenzaTesto,
    consenso_marketing: Math.random() < 0.4,
    email: completo ? emailCasuale(nome, cognome) : null,
    telefono: completo ? telefonoCasuale() : null,
    vip: completo && Math.random() < 0.08,
    allergie: completo ? pick(ALLERGIE) : null,
    tag: completo ? pick(TAG_CANALE) : [],
  };
}

async function inserisciOspite(client, o) {
  const res = await client.query(
    `INSERT INTO ospiti (
       nome, cognome, sesso, data_nascita,
       stato_nascita_codice, stato_nascita_testo,
       comune_nascita_codice, comune_nascita_testo, provincia_nascita,
       cittadinanza_codice, cittadinanza_testo,
       documento_tipo_codice, documento_tipo_testo, documento_numero, documento_scadenza,
       luogo_rilascio_codice, luogo_rilascio_testo,
       stato_residenza_codice, stato_residenza_testo,
       comune_residenza_codice, comune_residenza_testo,
       consenso_marketing, email, telefono, vip, allergie, tag, note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING id`,
    [
      o.nome, o.cognome, o.sesso, o.data_nascita,
      o.stato_nascita_codice, o.stato_nascita_testo,
      o.comune_nascita_codice, o.comune_nascita_testo, o.provincia_nascita,
      o.cittadinanza_codice, o.cittadinanza_testo,
      o.documento_tipo_codice, o.documento_tipo_testo, o.documento_numero, o.documento_scadenza,
      o.luogo_rilascio_codice, o.luogo_rilascio_testo,
      o.stato_residenza_codice, o.stato_residenza_testo,
      o.comune_residenza_codice, o.comune_residenza_testo,
      o.consenso_marketing, o.email, o.telefono, o.vip ?? false, o.allergie, o.tag || [],
      'Ospite di test — generato da seedPrenotazioniTest.js',
    ]
  );
  return res.rows[0].id;
}

function determinaStato(arrivo, partenza, oggi) {
  if (partenza <= oggi) return 'check_out';               // soggiorno finito
  if (arrivo <= oggi && oggi < partenza) return 'check_in'; // in corso
  return Math.random() < 0.85 ? 'confermata' : 'opzione';   // futuro
}

async function contaSeedEsistenti() {
  const res = await pool.query(`SELECT COUNT(*) FROM prenotazioni WHERE external_booking_id LIKE $1`, [`${PREFISSO}%`]);
  return Number(res.rows[0].count);
}

async function pulisci() {
  const res = await pool.query(
    `SELECT s.id AS soggiorno_id, p.id AS prenotazione_id,
            COALESCE(so.ospite_id, s.ospite_id) AS ospite_id
     FROM prenotazioni p
     JOIN soggiorni s ON s.prenotazione_id = p.id
     LEFT JOIN soggiorno_ospiti so ON so.soggiorno_id = s.id
     WHERE p.external_booking_id LIKE $1`,
    [`${PREFISSO}%`]
  );
  if (res.rows.length === 0) {
    console.log('Nessun dato di test da pulire.');
    return;
  }
  const soggiornoIds = [...new Set(res.rows.map(r => r.soggiorno_id))];
  const prenotazioneIds = [...new Set(res.rows.map(r => r.prenotazione_id))];
  const ospiteIds = [...new Set(res.rows.map(r => r.ospite_id).filter(Boolean))];

  await pool.query(`DELETE FROM addebiti_extra WHERE soggiorno_id = ANY($1)`, [soggiornoIds]);
  await pool.query(`UPDATE comande SET soggiorno_id = NULL WHERE soggiorno_id = ANY($1)`, [soggiornoIds]);
  await pool.query(`DELETE FROM tasse_soggiorno WHERE soggiorno_id = ANY($1)`, [soggiornoIds]);
  await pool.query(`DELETE FROM alloggiati_invii WHERE soggiorno_id = ANY($1)`, [soggiornoIds]);
  await pool.query(
    `DELETE FROM pre_checkin_ospiti WHERE soggiorno_id = ANY($1) OR richiesta_id IN (
       SELECT id FROM pre_checkin_richieste WHERE prenotazione_id = ANY($2)
     )`,
    [soggiornoIds, prenotazioneIds]
  );
  await pool.query(`DELETE FROM pre_checkin_richieste WHERE prenotazione_id = ANY($1)`, [prenotazioneIds]);
  await pool.query(`DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)`, [prenotazioneIds]);
  await pool.query(`DELETE FROM soggiorno_ospiti WHERE soggiorno_id = ANY($1)`, [soggiornoIds]);
  await pool.query(`DELETE FROM soggiorni WHERE id = ANY($1)`, [soggiornoIds]);
  await pool.query(`DELETE FROM prenotazioni WHERE id = ANY($1)`, [prenotazioneIds]);
  await pool.query(`DELETE FROM ospiti WHERE id = ANY($1)`, [ospiteIds]);
  const orfani = await pool.query(
    `DELETE FROM ospiti
     WHERE note LIKE '%seedPrenotazioniTest.js%'
       AND NOT EXISTS (SELECT 1 FROM soggiorni s WHERE s.ospite_id = ospiti.id)
       AND NOT EXISTS (SELECT 1 FROM soggiorno_ospiti so WHERE so.ospite_id = ospiti.id)
     RETURNING id`
  );
  if (orfani.rowCount > 0) {
    console.log(`Rimossi anche ${orfani.rowCount} ospiti di test orfani.`);
  }

  console.log(`Puliti: ${prenotazioneIds.length} prenotazioni, ${soggiornoIds.length} soggiorni, ${ospiteIds.length} ospiti.`);
}

async function conflittoCamera(cameraId, arrivo, partenza) {
  const res = await pool.query(
    `SELECT 1 FROM soggiorni
     WHERE camera_id = $1 AND cancellato = false
       AND daterange(data_arrivo, data_partenza, '[)') && daterange($2::date, $3::date, '[)')
     LIMIT 1`,
    [cameraId, arrivo, partenza]
  );
  return res.rows.length > 0;
}

async function crea() {
  const esistenti = await contaSeedEsistenti();
  if (esistenti > 0) {
    console.log(`Esistono già ${esistenti} prenotazioni di test (prefisso ${PREFISSO}) — nessuna duplicazione.`);
    console.log('Per rigenerarle: node backend/scripts/seedPrenotazioniTest.js --pulisci, poi rilancia.');
    return;
  }

  const camereRes = await pool.query(
    `SELECT id, numero FROM camere
     WHERE attivo = true
       AND numero NOT ILIKE 'TEST%'
       AND numero <> 'app'
     ORDER BY id`
  );
  if (camereRes.rows.length === 0) {
    console.error('Nessuna camera attiva trovata.');
    process.exit(1);
  }

  const { comuni, esteri, documenti } = await caricaAnagraficheDisponibili();
  if (comuni.length === 0) {
    console.warn('⚠️  Nessun comune trovato in alloggiati_codici (tabelle mai sincronizzate?) — i dati generati avranno nascita/residenza incomplete per tutti. Sincronizza da Impostazioni ▸ Alloggiati Web per dati più realistici.');
  }

  const oggi = fmtData(new Date());
  const dataInizio = argomento('da') || aggiungiGiorni(oggi, -GIORNI_INDIETRO);
  const dataFine = argomento('a') || aggiungiGiorni(oggi, GIORNI_AVANTI);
  const quotaCamere = Number(argomento('quota-camere') || '1');
  const forzaCompleto = process.argv.includes('--completi');

  const contatori = { check_out: 0, check_in: 0, confermata: 0, opzione: 0 };
  let totalePrenotazioni = 0;

  const camereScelte = camereRes.rows.filter(() => Math.random() < quotaCamere);
  if (camereScelte.length === 0 && camereRes.rows.length > 0) {
    camereScelte.push(pick(camereRes.rows));
  }

  for (const camera of camereScelte) {
    let cursore = dataInizio;
    let primoSlot = true;
    while (cursore < dataFine) {
      // Gap più ampi dopo il primo soggiorno: alcune notti restano libere.
      // Il primo slot parte da dataInizio (oggi) così ci sono anche check-in in corso.
      const gap = primoSlot ? 0 : (quotaCamere < 1 ? randInt(1, 5) : randInt(0, 3));
      primoSlot = false;
      cursore = aggiungiGiorni(cursore, gap);
      if (cursore >= dataFine) break;

      const notti = randInt(1, 5);
      let arrivo = cursore;
      let partenza = aggiungiGiorni(arrivo, notti);
      if (partenza > dataFine) partenza = dataFine;
      if (partenza <= arrivo) break;

      if (await conflittoCamera(camera.id, arrivo, partenza)) {
        cursore = aggiungiGiorni(arrivo, 1);
        continue;
      }

      const stato = determinaStato(arrivo, partenza, oggi);
      const coppia = Math.random() < 0.35;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const ospite1 = generaOspite({ comuni, esteri, documenti, forzaCompleto });
        const ospite1Id = await inserisciOspite(client, ospite1);
        let ospite2Id = null;
        if (coppia) {
          const ospite2 = generaOspite({
            comuni, esteri, documenti, forzaCompleto, cognomeFisso: ospite1.cognome,
          });
          ospite2Id = await inserisciOspite(client, ospite2);
        }

        const externalId = `${PREFISSO}${camera.id}-${arrivo}`;
        const prenotazioneRes = await client.query(
          `INSERT INTO prenotazioni (canale_origine, external_booking_id, stato, note)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          ['test_interno', externalId, stato, 'Prenotazione di test — generata da seedPrenotazioniTest.js']
        );
        const prenotazioneId = prenotazioneRes.rows[0].id;

        const tariffaTotale = randInt(70, 220) * notti;
        const soggiornoRes = await client.query(
          `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [prenotazioneId, camera.id, ospite1Id, arrivo, partenza, coppia ? 2 : 1, tariffaTotale]
        );
        const soggiornoId = soggiornoRes.rows[0].id;

        await client.query(
          `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1,$2,$3)`,
          [soggiornoId, ospite1Id, coppia ? '17' : '16']
        );
        if (coppia) {
          await client.query(
            `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1,$2,'19')`,
            [soggiornoId, ospite2Id]
          );
        }

        await client.query('COMMIT');
        contatori[stato]++;
        totalePrenotazioni++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Errore camera ${camera.numero}, ${arrivo}→${partenza}: ${err.message}`);
      } finally {
        client.release();
      }

      cursore = partenza;
    }
  }

  console.log(`\nCreate ${totalePrenotazioni} prenotazioni di test (${dataInizio} → ${dataFine}) su ${camereScelte.length}/${camereRes.rows.length} camere:`);
  console.log(`  Passate (check_out): ${contatori.check_out}`);
  console.log(`  In corso (check_in): ${contatori.check_in}`);
  console.log(`  Confermate future: ${contatori.confermata}`);
  console.log(`  Opzioni future: ${contatori.opzione}`);
  console.log(`\nGuarda /planning-camere per la griglia popolata.`);
  console.log('Per pulire tutto: node backend/scripts/seedPrenotazioniTest.js --pulisci');
}

async function main() {
  if (process.argv.includes('--pulisci')) {
    await pulisci();
  } else {
    await crea();
  }
  await pool.end();
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
