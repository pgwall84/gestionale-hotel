// Generatore XML RIMOVCLI/ISTAT C/59 (modulo 2.6, ripreso 27/08/2026 dopo
// conferma di Regione Liguria: canale upload manuale, nessuna automazione
// di invio necessaria).
//
// Schema COMPLETAMENTE DIVERSO da backend/lib/ross1000Xml.js (quello punta
// al webservice SOAP nazionale ROSS1000/Turismo5, tracciato nominativo per
// ospite — non toccato, non riusabile qui). Qui: un file per struttura per
// GIORNO (non un range), conforme a docs/rimovcli/ModelloC59.xsd — blocco
// <mensile> opzionale (capienza del mese) + blocco <giornaliero> con una
// riga <rigac59> per ogni provincia italiana o stato estero di provenienza
// dei presenti, con arrivati/partiti/presenti/diurni.
//
// Continuità giorno-su-giorno (il portale RIMOVCLI la controlla e rifiuta
// il file se non torna, vedi docs/DIARIO_SESSIONI.md 24/08/2026): per
// costruzione, se arrivati/partiti/presenti sono calcolati correttamente
// dagli stessi dati di soggiorno con lo stesso criterio di intervallo,
// presenti(oggi) = presenti(ieri) + arrivati(oggi) - partiti(oggi) per
// ciascuna provenienza vale automaticamente — NON serve una riconciliazione
// esplicita, a patto che (a) nessuna correzione retroattiva a un soggiorno
// già inviato cambi i conteggi di un giorno già trasmesso, e (b) i giorni
// non vengano MAI saltati (un giorno senza presenze richiede comunque un
// invio "a movimenti 0", non l'assenza di invio — responsabilità di chi
// pianifica l'invio quotidiano, non di questo generatore).

const pool = require('../config/db');
const { risolviResidenza } = require('./rimovcliResidenza');

const NOME_PRODOTTO = 'GestionaleHotelDelGolfo';

function escapeXml(testo) {
  if (testo === null || testo === undefined) return '';
  return String(testo)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Stessa query di calcolaCapacitaStruttura() in ross1000Xml.js — capienza
// non cambia giorno per giorno, riusata identica qui.
async function calcolaCapacita() {
  const r = await pool.query(
    `SELECT COUNT(*) AS camere_attive, COALESCE(SUM(tc.capienza_max), 0) AS letti_totali
     FROM camere c LEFT JOIN tipi_camera tc ON tc.id = c.tipo_camera_id
     WHERE c.attivo = true`
  );
  return { cameredisp: Number(r.rows[0].camere_attive), lettidisp: Number(r.rows[0].letti_totali) };
}

// Un elemento per ogni ospite di ogni soggiorno che copre o tocca il
// giorno richiesto (arrivo, partenza o notte intermedia) — stesso
// intervallo '[]' già usato in ross1000Xml.js.caricaOspitiSoggiorniRange
// per lo stesso motivo (serve includere anche il giorno di partenza).
async function caricaOspitiGiorno(giorno) {
  const r = await pool.query(
    `SELECT s.id AS soggiorno_id, s.camera_id, s.data_arrivo, s.data_partenza,
            o.stato_residenza_codice, o.comune_residenza_codice
     FROM soggiorni s
     JOIN soggiorno_ospiti so ON so.soggiorno_id = s.id
     JOIN ospiti o ON o.id = so.ospite_id
     WHERE s.cancellato = false
       AND s.data_arrivo <= $1 AND s.data_partenza >= $1`,
    [giorno]
  );
  return r.rows;
}

async function contaCamereOccupate(giorno) {
  const r = await pool.query(
    `SELECT COUNT(DISTINCT s.camera_id) AS n
     FROM soggiorni s
     WHERE s.cancellato = false AND $1 >= s.data_arrivo AND $1 < s.data_partenza`,
    [giorno]
  );
  return Number(r.rows[0].n);
}

// Aggrega le righe ospiti del giorno in mappa "nazione|residenza" -> contatori.
// Ogni ospite non risolvibile (crosswalk fallita) viene ESCLUSO dal conteggio
// e segnalato in avvisi — mai un codice indovinato (stesso principio già
// in uso in ross1000Xml.js per i dati obbligatori mancanti).
function aggregaPerResidenza(righe, giorno, avvisi) {
  const bucket = new Map(); // chiave 'i|011' -> {arrivati,partiti,presenti,diurni}

  function get(chiave) {
    if (!bucket.has(chiave)) bucket.set(chiave, { arrivati: 0, partiti: 0, presenti: 0, diurni: 0 });
    return bucket.get(chiave);
  }

  for (const riga of righe) {
    const esito = risolviResidenza(riga);
    if (esito.errore) {
      avvisi.push(`Soggiorno ${riga.soggiorno_id}, camera ${riga.camera_id}: escluso dal conteggio — ${esito.errore}`);
      continue;
    }
    const chiave = `${esito.nazione}|${esito.residenza}`;
    const c = get(chiave);

    const arrivaOggi = riga.data_arrivo === giorno;
    const partaOggi = riga.data_partenza === giorno;
    const diurno = arrivaOggi && partaOggi; // stesso giorno, nessuna notte — cfr. XSD "diurni"

    if (diurno) {
      c.diurni += 1;
      continue; // un diurno non è né "presente la notte" né va in arrivati/partiti separatamente (cfr. Manuale Utente ImportC59)
    }
    if (arrivaOggi) c.arrivati += 1;
    if (partaOggi) c.partiti += 1;
    // presente la notte di "giorno": arrivato in un giorno <= oggi e non ancora partito (partenza esclusiva)
    if (riga.data_arrivo <= giorno && giorno < riga.data_partenza) c.presenti += 1;
  }

  return bucket;
}

// Genera l'XML per UN giorno (idstruttura passato dal chiamante — nessun
// default nel codice: finché la certificazione non assegna un codice
// reale, chi lancia lo script deve passarlo esplicitamente o accettare
// 'DA_CONFIGURARE').
async function generaGiornoC59({ idstruttura, giorno, includiMensile = true }) {
  const avvisi = [];
  const [capacita, righeOspiti, camereOccupate] = await Promise.all([
    includiMensile ? calcolaCapacita() : Promise.resolve(null),
    caricaOspitiGiorno(giorno),
    contaCamereOccupate(giorno),
  ]);

  const bucket = aggregaPerResidenza(righeOspiti, giorno, avvisi);

  const righeXml = [...bucket.entries()].map(([chiave, c]) => {
    const [nazione, residenza] = chiave.split('|');
    const diurniAttr = c.diurni ? ` diurni="${c.diurni}"` : '';
    return `\t\t<rigac59 nazione="${nazione}" residenza="${escapeXml(residenza)}" arrivati="${c.arrivati}" partiti="${c.partiti}" presenti="${c.presenti}"${diurniAttr}/>`;
  }).join('\n');

  if (bucket.size === 0) {
    avvisi.push(`Nessuna riga <rigac59>: giornata "a movimenti 0" — il portale richiede comunque un invio, non l'assenza di file (cfr. Manuale Utente ImportC59).`);
  }

  const mensileXml = includiMensile
    ? `\t<mensile numcameredisp="${capacita.cameredisp}" numlettidisp="${capacita.lettidisp}" softwaregestionale="${NOME_PRODOTTO}"/>\n`
    : '';

  const commentoAvvisi = avvisi.length
    ? `<!-- AVVISI (${avvisi.length}) — verificare prima dell'invio:\n${avvisi.map(a => `  - ${escapeXml(a)}`).join('\n')}\n-->\n`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${commentoAvvisi}<rm:c59 idstruttura="${escapeXml(idstruttura)}" data="${giorno}" xmlns:rm="http://www.regione.liguria.it/turismo/rimovcli" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n${mensileXml}\t<giornaliero numcamereoccupate="${camereOccupate}">\n${righeXml}\n\t</giornaliero>\n</rm:c59>\n`;

  return { xml, avvisi };
}

module.exports = { generaGiornoC59, aggregaPerResidenza, escapeXml };
