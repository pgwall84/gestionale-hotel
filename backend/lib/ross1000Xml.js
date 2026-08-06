// Generatore XML per l'export ROSS1000/ISTAT (modulo 2.6, Fase 1 —
// 04/08/2026, tracciato ufficiale in docs/ross1000/tracciato.pdf).
//
// FASE 1: genera solo il file XML per verifica manuale — NESSUN invio reale
// al webservice (mancano le credenziali HTTP Basic di Regione Liguria,
// endpoint https://turismows.regione.liguria.it/ws/checkinV2?wsdl). Stesso
// approccio già seguito per Alloggiati Web (Fase 1b = generazione/verifica,
// Fase 2 = invio reale quando arrivano le credenziali).
//
// Campi "obbligatori" secondo il tracciato ma con "Non specificato" tra i
// valori ufficiali ammessi (tipoturismo, mezzotrasporto): valorizzati con
// "NON SPECIFICATO" di default — non blocchiamo la reception a raccogliere
// dati che oggi non servono a nessun altro scopo operativo. Campi davvero
// opzionali (canaleprenotazione, titolostudio, professione, esenzioneimposta)
// lasciati vuoti in Fase 1.
//
// Ospiti con dati obbligatori mancanti (sesso, cittadinanza, data di
// nascita, o residenza quando richiesta) vengono ESCLUSI dall'XML invece di
// generare un file non conforme — segnalati in un commento XML in testa,
// mai in modo silenzioso.

const pool = require('../config/db');

const CODICE_STRUTTURA = process.env.ROSS1000_CODICE_STRUTTURA || 'DA_CONFIGURARE';
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

function formatDataCompatta(d) {
  // 'YYYY-MM-DD' (o Date) → 'AAAAMMGG', formato richiesto dal tracciato.
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return s.replace(/-/g, '');
}

function elenchiDateRange(dataInizio, dataFineEsclusiva) {
  const giorni = [];
  let cursore = new Date(dataInizio + 'T00:00:00');
  const fine = new Date(dataFineEsclusiva + 'T00:00:00');
  while (cursore < fine) {
    giorni.push(cursore.toISOString().slice(0, 10));
    cursore.setDate(cursore.getDate() + 1);
  }
  return giorni;
}

function tag(nome, valore) {
  return `<${nome}>${escapeXml(valore)}</${nome}>`;
}

// Capienza della struttura — calcolata una sola volta per l'intero export
// (non giorno per giorno: il numero di camere attive/posti letto non cambia
// tipicamente nell'arco di un export mensile). Se qualche camera attiva non
// ha capienza_max valorizzata (migration 018, campo nullable), lettidisponibili
// è sottostimato — segnalato con un avviso invece di fallire silenziosamente.
async function calcolaCapacitaStruttura() {
  const result = await pool.query(
    `SELECT COUNT(*) AS camere_attive,
            COUNT(*) FILTER (WHERE tc.capienza_max IS NULL) AS camere_senza_capienza,
            COALESCE(SUM(tc.capienza_max), 0) AS letti_totali
     FROM camere c
     LEFT JOIN tipi_camera tc ON tc.id = c.tipo_camera_id
     WHERE c.attivo = true`
  );
  const r = result.rows[0];
  const elencoCamereSenzaCapienza = await pool.query(
    `SELECT c.numero FROM camere c
     LEFT JOIN tipi_camera tc ON tc.id = c.tipo_camera_id
     WHERE c.attivo = true AND tc.capienza_max IS NULL
     ORDER BY c.numero`
  );
  return {
    cameredisponibili: Number(r.camere_attive),
    lettidisponibili: Number(r.letti_totali),
    camereSenzaCapienza: Number(r.camere_senza_capienza),
    numeriCamereSenzaCapienza: elencoCamereSenzaCapienza.rows.map(x => x.numero),
  };
}

// Soggiorni (non cancellati) che intersecano il range — usati sia per
// calcolare camereoccupate giorno per giorno, sia come base per arrivi/partenze.
async function caricaSoggiorniRange(dataInizio, dataFineEsclusiva) {
  const result = await pool.query(
    `SELECT s.id AS soggiorno_id, s.camera_id, s.data_arrivo, s.data_partenza,
            s.prenotazione_id
     FROM soggiorni s
     WHERE s.cancellato = false
       AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1, $2, '[)')`,
    [dataInizio, dataFineEsclusiva]
  );
  return result.rows;
}

// Un elemento per ogni ospite di ogni soggiorno che intersecano il range —
// serve sia per gli <arrivo> (filtrati per data_arrivo = giorno) sia per le
// <partenza> (filtrati per data_partenza = giorno), sia per risolvere
// l'<idcapo> (capofamiglia/capogruppo dello stesso soggiorno o della stessa
// prenotazione).
async function caricaOspitiSoggiorniRange(dataInizio, dataFineEsclusiva) {
  // Intervallo '[]' (inclusivo su entrambi gli estremi), non '[)' come per
  // l'occupazione camere: qui serve catturare anche il giorno di PARTENZA
  // (che di per sé non è "occupato" dal soggiorno, ma va comunque incluso
  // per generare l'elemento <partenza> di quel giorno) — il filtro preciso
  // arrivo/partenza per singolo giorno avviene poi in JS in generaXml().
  const result = await pool.query(
    `SELECT so.id AS soggiorno_ospite_id, so.soggiorno_id, so.tipo_alloggiato,
            s.data_arrivo, s.data_partenza, s.prenotazione_id,
            o.nome, o.cognome, c.numero AS camera_numero,
            o.sesso, o.cittadinanza_codice,
            o.stato_residenza_codice, o.comune_residenza_codice,
            o.data_nascita, o.stato_nascita_codice, o.comune_nascita_codice
     FROM soggiorno_ospiti so
     JOIN soggiorni s ON s.id = so.soggiorno_id
     JOIN camere c ON c.id = s.camera_id
     JOIN ospiti o ON o.id = so.ospite_id
     WHERE s.cancellato = false
       AND daterange(s.data_arrivo, s.data_partenza, '[]') && daterange($1, $2, '[)')`,
    [dataInizio, dataFineEsclusiva]
  );
  return result.rows;
}

// Prenotazioni "pervenute" (create) nel range — un elemento <prenotazione>
// per ogni prenotazione con created_at::date nel range, con i dati
// aggregati sui suoi soggiorni (arrivo/partenza complessivi, ospiti, camere,
// prezzo medio se calcolabile).
async function caricaPrenotazioniRange(dataInizio, dataFineEsclusiva) {
  const result = await pool.query(
    `SELECT p.id AS prenotazione_id, p.created_at::date AS data_ricezione,
            MIN(s.data_arrivo) AS arrivo, MAX(s.data_partenza) AS partenza,
            SUM(s.num_ospiti) AS ospiti, COUNT(DISTINCT s.id) AS camere,
            SUM(s.tariffa_totale) AS tariffa_totale
     FROM prenotazioni p
     JOIN soggiorni s ON s.prenotazione_id = p.id AND s.cancellato = false
     WHERE p.created_at::date >= $1 AND p.created_at::date < $2
     GROUP BY p.id, p.created_at`,
    [dataInizio, dataFineEsclusiva]
  );
  return result.rows;
}

// Costruisce l'elemento <arrivo> per un ospite — null se mancano dati
// obbligatori (esclude l'ospite invece di generare un XML non conforme).
function costruisciArrivo(riga, idCapoMap) {
  const idswh = `SO${riga.soggiorno_ospite_id}`;
  const obbligatoriMancanti = [];
  if (!riga.sesso) obbligatoriMancanti.push('sesso');
  if (!riga.cittadinanza_codice) obbligatoriMancanti.push('cittadinanza');
  if (!riga.stato_residenza_codice) obbligatoriMancanti.push('stato di residenza');
  if (!riga.data_nascita) obbligatoriMancanti.push('data di nascita');
  const italiaResidenza = riga.stato_residenza_codice === '100000100';
  if (italiaResidenza && !riga.comune_residenza_codice) obbligatoriMancanti.push('comune di residenza (obbligatorio se residente in Italia)');
  const italiaNascita = riga.stato_nascita_codice === '100000100';
  if (italiaNascita && !riga.comune_nascita_codice) obbligatoriMancanti.push('comune di nascita (obbligatorio se nato in Italia)');

  if (obbligatoriMancanti.length) {
    const etichetta = `${riga.cognome} ${riga.nome} (Camera ${riga.camera_numero}, ${idswh})`;
    return { xml: null, avviso: `${etichetta}: escluso, mancano — ${obbligatoriMancanti.join(', ')}` };
  }

  const idcapo = idCapoMap.get(riga.soggiorno_ospite_id) || '';
  const parti = [
    tag('idswh', idswh),
    tag('tipoalloggiato', riga.tipo_alloggiato),
    tag('idcapo', idcapo),
    tag('sesso', riga.sesso),
    tag('cittadinanza', riga.cittadinanza_codice),
    tag('statoresidenza', riga.stato_residenza_codice),
    tag('luogoresidenza', italiaResidenza ? riga.comune_residenza_codice : (riga.comune_residenza_codice || '')),
    tag('datanascita', formatDataCompatta(riga.data_nascita)),
    tag('statonascita', riga.stato_nascita_codice || ''),
    tag('comunenascita', italiaNascita ? (riga.comune_nascita_codice || '') : ''),
    tag('tipoturismo', 'NON SPECIFICATO'),
    tag('mezzotrasporto', 'NON SPECIFICATO'),
    tag('canaleprenotazione', ''),
    tag('titolostudio', ''),
    tag('professione', ''),
    tag('esenzioneimposta', ''),
  ];
  return { xml: `<arrivo>${parti.join('')}</arrivo>`, avviso: null };
}

// Risolve, per ogni riga soggiorno_ospiti coinvolta, l'idswh del "capo" da
// usare in <idcapo> quando tipo_alloggiato è 19 (familiare) o 20 (membro
// gruppo): il capofamiglia (17) si cerca nello stesso soggiorno (stessa
// camera); il capogruppo (18) prima nello stesso soggiorno, altrimenti tra
// tutti i soggiorni della stessa prenotazione (gruppo su più camere).
function costruisciMappaIdCapo(righe) {
  const map = new Map();
  const perSoggiorno = new Map();
  const perPrenotazione = new Map();
  for (const r of righe) {
    if (!perSoggiorno.has(r.soggiorno_id)) perSoggiorno.set(r.soggiorno_id, []);
    perSoggiorno.get(r.soggiorno_id).push(r);
    if (!perPrenotazione.has(r.prenotazione_id)) perPrenotazione.set(r.prenotazione_id, []);
    perPrenotazione.get(r.prenotazione_id).push(r);
  }
  for (const r of righe) {
    if (r.tipo_alloggiato === '19') {
      const capo = (perSoggiorno.get(r.soggiorno_id) || []).find(x => x.tipo_alloggiato === '17');
      if (capo) map.set(r.soggiorno_ospite_id, `SO${capo.soggiorno_ospite_id}`);
    } else if (r.tipo_alloggiato === '20') {
      let capo = (perSoggiorno.get(r.soggiorno_id) || []).find(x => x.tipo_alloggiato === '18');
      if (!capo) capo = (perPrenotazione.get(r.prenotazione_id) || []).find(x => x.tipo_alloggiato === '18');
      if (capo) map.set(r.soggiorno_ospite_id, `SO${capo.soggiorno_ospite_id}`);
    }
  }
  return map;
}

// Genera l'XML completo per l'intervallo [dataInizio, dataFineEsclusiva).
// giorniChiusura: array di stringhe 'YYYY-MM-DD' per cui forzare apertura=NO
// (nessun calendario chiusure persistito in Fase 1 — vedi PIANO).
async function generaXml({ dataInizio, dataFineEsclusiva, giorniChiusura = [] }) {
  const giorni = elenchiDateRange(dataInizio, dataFineEsclusiva);
  const chiusiSet = new Set(giorniChiusura);

  const capacita = await calcolaCapacitaStruttura();
  const soggiorni = await caricaSoggiorniRange(dataInizio, dataFineEsclusiva);
  const ospitiSoggiorni = await caricaOspitiSoggiorniRange(dataInizio, dataFineEsclusiva);
  const prenotazioni = await caricaPrenotazioniRange(dataInizio, dataFineEsclusiva);
  const idCapoMap = costruisciMappaIdCapo(ospitiSoggiorni);

  const avvisi = [];
  if (capacita.camereSenzaCapienza > 0) {
    avvisi.push(`Camera/e senza capienza_max impostata (${capacita.numeriCamereSenzaCapienza.join(', ')}) — lettidisponibili sottostimato, assegna una categoria da Impostazioni > Camere.`);
  }

  const movimentiXml = [];
  for (const giorno of giorni) {
    const apertura = chiusiSet.has(giorno) ? 'NO' : 'SI';
    const camereoccupateSet = new Set(
      soggiorni.filter(s => giorno >= s.data_arrivo && giorno < s.data_partenza).map(s => s.camera_id)
    );
    const camereoccupate = apertura === 'NO' ? 0 : camereoccupateSet.size;

    const arriviGiorno = apertura === 'NO' ? [] : ospitiSoggiorni.filter(r => r.data_arrivo === giorno);
    const partenzeGiorno = apertura === 'NO' ? [] : ospitiSoggiorni.filter(r => r.data_partenza === giorno);
    // data_ricezione arriva già come stringa 'YYYY-MM-DD' (config/db.js
    // normalizza le colonne DATE per evitare shift di timezone), non un
    // oggetto Date — confronto diretto, nessuna conversione necessaria.
    const prenotazioniGiorno = apertura === 'NO' ? [] : prenotazioni.filter(p => p.data_ricezione === giorno);

    const arriviXml = [];
    for (const r of arriviGiorno) {
      const { xml, avviso } = costruisciArrivo(r, idCapoMap);
      if (xml) arriviXml.push(xml);
      if (avviso) avvisi.push(`Arrivo ${giorno} — ${avviso}`);
    }

    const partenzeXml = partenzeGiorno.map(r => (
      `<partenza>${tag('idswh', `SO${r.soggiorno_ospite_id}`)}${tag('tipoalloggiato', r.tipo_alloggiato)}${tag('arrivo', formatDataCompatta(r.data_arrivo))}</partenza>`
    ));

    const prenotazioniXml = prenotazioniGiorno.map(p => {
      const notti = Math.max(1, Math.round((new Date(p.partenza) - new Date(p.arrivo)) / 86400000));
      const ospitiTot = Number(p.ospiti) || 1;
      const prezzo = p.tariffa_totale != null ? (Number(p.tariffa_totale) / notti / ospitiTot).toFixed(2) : '';
      return `<prenotazione>${tag('idswh', `PR${p.prenotazione_id}`)}${tag('arrivo', formatDataCompatta(p.arrivo))}${tag('partenza', formatDataCompatta(p.partenza))}${tag('ospiti', p.ospiti)}${tag('camere', p.camere)}${tag('prezzo', prezzo)}${tag('canaleprenotazione', '')}${tag('statoprovenienza', '')}${tag('comuneprovenienza', '')}</prenotazione>`;
    });

    const blocchi = [
      `<data>${formatDataCompatta(giorno)}</data>`,
      `<struttura>${tag('apertura', apertura)}${tag('camereoccupate', camereoccupate)}${tag('cameredisponibili', capacita.cameredisponibili)}${tag('lettidisponibili', capacita.lettidisponibili)}</struttura>`,
    ];
    if (arriviXml.length) blocchi.push(`<arrivi>${arriviXml.join('')}</arrivi>`);
    if (partenzeXml.length) blocchi.push(`<partenze>${partenzeXml.join('')}</partenze>`);
    if (prenotazioniXml.length) blocchi.push(`<prenotazioni>${prenotazioniXml.join('')}</prenotazioni>`);

    movimentiXml.push(`<movimento>${blocchi.join('')}</movimento>`);
  }

  const commentoAvvisi = avvisi.length
    ? `<!-- AVVISI (${avvisi.length}) — verificare prima dell'invio:\n${avvisi.map(a => `  - ${escapeXml(a)}`).join('\n')}\n-->\n`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${commentoAvvisi}<movimenti>${tag('codice', CODICE_STRUTTURA)}${tag('prodotto', NOME_PRODOTTO)}${movimentiXml.join('')}</movimenti>`;

  return { xml, avvisi };
}

module.exports = { generaXml, escapeXml, formatDataCompatta };
