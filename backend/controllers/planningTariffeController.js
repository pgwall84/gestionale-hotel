// backend/controllers/planningTariffeController.js
// Griglia giorno-per-giorno di prezzo e restrizioni, per tipo camera e
// trattamento (Piano 3, 24/08/2026). Un giorno senza riga in
// planning_tariffe_giorni usa il prezzo "consigliato" calcolato al volo da
// calcolaPrezzoCameraPerNotte/calcolaSupplementoTrattamento — stesso motore
// di /tariffe, invariato. Adulti fisso a 2 / nessun bambino per il calcolo
// del supplemento consigliato: stessa convenzione già usata da
// verificaLimitiListino per il cartellino, non un numero nuovo inventato
// qui.
// AGGIORNATO 24/08/2026: la griglia ORA è letta anche dal motore di
// prenotazione reale — vedi calcolaTariffaPerTrattamentiConPlanning più
// sotto in questo file, usata da bookingPubblicoController.js al posto di
// calcolaTariffaPerTrattamenti/calcolaTariffa "nude". griglia() qui sopra
// resta il pannello di pianificazione per la UI (non tocca il calcolo di
// prenotazione, e viceversa — vedi commento sulla funzione nuova).

const pool = require('../config/db');
const { logAudit } = require('./auditController');
const { calcolaPrezzoCameraPerNotte, calcolaPrezzoDirettoPerNotte, calcolaSupplementoTrattamento } = require('./tariffeController');
const { verificaLimitiListino } = require('../utils/verificaLimitiListino');

const TRATTAMENTI = ['bb', 'mezza_pensione', 'pensione_completa'];

function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// data_da/data_a di questo modulo sono INCLUSIVE (confine di calendario) —
// questa funzione converte in "esclusiva" solo per i punti che chiamano
// calcolaPrezzoCameraPerNotte/calcolaSupplementoTrattamento, che lavorano
// per NOTTE con data_fine esclusiva (convenzione di soggiorni).
function aggiungiGiorno(dataIso) {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// GET /api/planning-tariffe/griglia?tipo_camera_id=&data_da=&data_a=
async function griglia(req, res) {
  const { tipo_camera_id, data_da, data_a } = req.query;
  if (!tipo_camera_id || !data_da || !data_a) {
    return res.status(400).json({ errore: 'tipo_camera_id, data_da e data_a sono obbligatori.' });
  }
  if (data_a < data_da) {
    return res.status(400).json({ errore: 'data_a deve essere successiva o uguale a data_da.' });
  }
  try {
    const dataFineEsclusiva = aggiungiGiorno(data_a);

    const [prezziCamera, overrideResult] = await Promise.all([
      calcolaPrezzoCameraPerNotte(tipo_camera_id, data_da, dataFineEsclusiva),
      pool.query(
        `SELECT trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
         FROM planning_tariffe_giorni
         WHERE tipo_camera_id = $1 AND data BETWEEN $2 AND $3`,
        [tipo_camera_id, data_da, data_a]
      ),
    ]);

    const overridePerChiave = new Map(overrideResult.rows.map(r => [`${r.trattamento}|${isoData(r.data)}`, r]));
    const prezzoCameraPerNotte = new Map(prezziCamera.map(n => [isoData(n.notte), n.prezzo_notte]));
    const giorni = [...prezzoCameraPerNotte.keys()].sort();
    const righe = {};

    for (const trattamento of TRATTAMENTI) {
      righe[trattamento] = {};
      for (const di of giorni) {
        const override = overridePerChiave.get(`${trattamento}|${di}`);
        let prezzoCalcolato = prezzoCameraPerNotte.get(di);
        if (trattamento !== 'bb' && prezzoCalcolato != null) {
          const supplemento = await calcolaSupplementoTrattamento(tipo_camera_id, di, aggiungiGiorno(di), trattamento, 2, []);
          prezzoCalcolato = supplemento.notti_scoperte.length > 0
            ? null
            : Math.round((prezzoCalcolato + supplemento.totale) * 100) / 100;
        }
        righe[trattamento][di] = {
          prezzo: override?.prezzo_notte != null ? Number(override.prezzo_notte) : prezzoCalcolato,
          sovrascritto: override?.prezzo_notte != null,
          min_stay: override?.min_stay ?? null,
          chiuso_arrivo: override?.chiuso_arrivo ?? false,
          chiuso_partenza: override?.chiuso_partenza ?? false,
          stop_sell: override?.stop_sell ?? false,
        };
      }
    }

    res.json({ giorni, righe });
  } catch (err) {
    console.error('griglia planning-tariffe error:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
}

// PATCH /api/planning-tariffe — upsert su un intervallo di giorni [data_da,
// data_a] INCLUSIVI, per una coppia tipo_camera_id+trattamento. Ogni campo
// (prezzo_notte/min_stay/chiuso_arrivo/chiuso_partenza/stop_sell) è
// indipendente: se assente dal body la riga esistente non viene toccata su
// quel campo (undefined = "non modificare", null = "azzera" per
// prezzo_notte/min_stay). confermato: stesso pattern alert
// bloccante-superabile di tariffeController.crea/aggiorna — 409 con
// l'elenco di TUTTI i giorni fuori range se non confermato, log override
// (bulk, una sola riga in audit_log) se confermato.
async function aggiorna(req, res) {
  const { tipo_camera_id, trattamento, data_da, data_a, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell, confermato } = req.body;

  if (!tipo_camera_id || !trattamento || !data_da || !data_a) {
    return res.status(400).json({ errore: 'tipo_camera_id, trattamento, data_da e data_a sono obbligatori.' });
  }
  if (!TRATTAMENTI.includes(trattamento)) {
    return res.status(400).json({ errore: 'Trattamento non valido.' });
  }
  if (data_a < data_da) {
    return res.status(400).json({ errore: 'data_a deve essere successiva o uguale a data_da.' });
  }
  if (prezzo_notte !== undefined && prezzo_notte !== null && Number(prezzo_notte) <= 0) {
    return res.status(400).json({ errore: 'Il prezzo per notte deve essere maggiore di zero.' });
  }

  const giorni = [];
  for (let d = data_da; d <= data_a; d = aggiungiGiorno(d)) giorni.push(d);

  try {
    if (prezzo_notte !== undefined && prezzo_notte !== null) {
      const violazioni = [];
      for (const di of giorni) {
        const esito = await verificaLimitiListino({
          tipoCameraId: tipo_camera_id,
          trattamento: trattamento === 'bb' ? null : trattamento,
          dataArrivo: di,
          dataPartenza: aggiungiGiorno(di),
          valore: Number(prezzo_notte),
        });
        if (!esito.conforme) violazioni.push({ data: di, minimo: esito.minimo, massimo: esito.massimo, valore: Number(prezzo_notte) });
      }
      if (violazioni.length > 0 && !confermato) {
        return res.status(409).json({ errore: 'Il prezzo esce dal min/max dichiarato per il cartellino in uno o più giorni.', violazioni });
      }
      if (violazioni.length > 0) {
        await logAudit(req.utente.id, 'override_limite_listino', 'planning_tariffe_giorni', null, req, {
          tipo_camera_id, trattamento, data_da, data_a, prezzo_notte: Number(prezzo_notte), giorni_fuori_range: violazioni,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const di of giorni) {
        await client.query(
          `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), COALESCE($7, false), COALESCE($8, false))
           ON CONFLICT (tipo_camera_id, trattamento, data) DO UPDATE SET
             prezzo_notte    = CASE WHEN $9  THEN planning_tariffe_giorni.prezzo_notte    ELSE $4 END,
             min_stay        = CASE WHEN $10 THEN planning_tariffe_giorni.min_stay        ELSE $5 END,
             chiuso_arrivo   = CASE WHEN $11 THEN planning_tariffe_giorni.chiuso_arrivo   ELSE $6 END,
             chiuso_partenza = CASE WHEN $12 THEN planning_tariffe_giorni.chiuso_partenza ELSE $7 END,
             stop_sell       = CASE WHEN $13 THEN planning_tariffe_giorni.stop_sell       ELSE $8 END,
             updated_at      = now()`,
          [
            tipo_camera_id, trattamento, di,
            prezzo_notte === undefined ? null : (prezzo_notte === null ? null : Number(prezzo_notte)),
            min_stay === undefined ? null : (min_stay === null ? null : Number(min_stay)),
            chiuso_arrivo === undefined ? null : !!chiuso_arrivo,
            chiuso_partenza === undefined ? null : !!chiuso_partenza,
            stop_sell === undefined ? null : !!stop_sell,
            prezzo_notte === undefined,
            min_stay === undefined,
            chiuso_arrivo === undefined,
            chiuso_partenza === undefined,
            stop_sell === undefined,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true, giorni_aggiornati: giorni.length });
  } catch (err) {
    console.error('aggiorna planning-tariffe error:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
}

// calcolaTariffaPerTrattamentiConPlanning — sincronizzazione booking engine
// diretto ↔ planning-tariffe (24/08/2026, segnalato dal titolare: "prezzi
// delle camere in vendita a caso... sincronizzare con planning tariffe").
// Stessa firma/shape di ritorno di calcolaTariffaPerTrattamenti
// (tariffeController.js), usata finora da bookingPubblicoController.js —
// qui però ogni notte controlla PRIMA un override in planning_tariffe_giorni
// (prezzo impostato a mano in /planning-tariffe per quel tipo camera +
// trattamento + giorno) e ricade sul motore calcolato
// (calcolaPrezzoCameraPerNotte + calcolaSupplementoTrattamento) solo per le
// notti senza override — stesso principio di merge già usato da griglia()
// qui sopra, non duplicato 1:1 perché griglia() lavora su range
// inclusivo/inclusivo per la UI e mostra sempre tutti i giorni anche non
// coperti, mentre qui serve un totale per notti realmente coperte con la
// composizione ospiti REALE della richiesta (griglia() usa 2 adulti fissi,
// solo come "prezzo consigliato" per chi pianifica — vedi commento in cima
// al file). Non toccare griglia() per riusare questa funzione: due percorsi
// volutamente separati, un bug qui non deve poter rompere il pannello di
// pianificazione e viceversa.
// prezzoBasePerNotteConPlanning — risolve il prezzo di un tipo BASE (madre)
// notte per notte per uso interno alla derivazione: override bb in
// planning_tariffe_giorni per quel tipo base, altrimenti il prezzo diretto
// storico (tabella `tariffe`, calcolaPrezzoDirettoPerNotte). Il prezzo
// diretto storico è sempre calcolato (serve comunque per le notti senza
// override); l'override, quando c'è, lo sostituisce. Usato SOLO dentro
// calcolaPrezzoCameraPerNotteConPlanning sotto — mai da
// calcolaPrezzoCameraPerNotte "nuda" (tariffeController.js), che resta
// l'origine dati per /tariffe e per griglia() qui sopra, invariate.
async function prezzoBasePerNotteConPlanning(baseTipoCameraId, dataArrivo, dataPartenza) {
  const [diretti, overrideResult] = await Promise.all([
    calcolaPrezzoDirettoPerNotte(baseTipoCameraId, dataArrivo, dataPartenza),
    pool.query(
      `SELECT data, prezzo_notte FROM planning_tariffe_giorni
       WHERE tipo_camera_id = $1 AND trattamento = 'bb' AND prezzo_notte IS NOT NULL
         AND data >= $2 AND data < $3`,
      [baseTipoCameraId, dataArrivo, dataPartenza]
    ),
  ]);
  const overridePerData = new Map(overrideResult.rows.map(r => [isoData(r.data), Number(r.prezzo_notte)]));
  return diretti.map(n => {
    const override = overridePerData.get(isoData(n.notte));
    return { notte: n.notte, prezzo_notte: override !== undefined ? override : n.prezzo_notte };
  });
}

// calcolaPrezzoCameraPerNotteConPlanning — stessa logica di
// calcolaPrezzoCameraPerNotte (tariffeController.js: risolve un tipo madre
// dal prezzo diretto, un tipo derivato da percentuale+base per notte,
// stesso anti-loop sulle catene di derivazione a più livelli, stesso clamp
// min/max) — duplicata qui apposta (non richiamata dall'originale) per
// sostituire l'UNICO punto che conta ai fini della sincronizzazione: la
// base di un tipo derivato viene risolta con prezzoBasePerNotteConPlanning
// sopra invece che con calcolaPrezzoDirettoPerNotte diretta, così un
// override planning-tariffe sul tipo madre si propaga anche ai tipi che ne
// derivano (Tripla/Quadrupla ecc.), non solo al tipo madre stesso. Per un
// tipo MADRE questa funzione è identica all'originale (nessuna differenza:
// il proprio eventuale override bb è già gestito dal chiamante,
// calcolaTariffaPerTrattamentiConPlanning, prima di arrivare qui).
async function calcolaPrezzoCameraPerNotteConPlanning(tipoCameraId, dataArrivo, dataPartenza) {
  const regoleResult = await pool.query(
    `SELECT periodo_id, tipo_camera_base_id, percentuale, prezzo_minimo, prezzo_massimo
     FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1`,
    [tipoCameraId]
  );

  if (regoleResult.rows.length === 0) {
    const dirette = await calcolaPrezzoDirettoPerNotte(tipoCameraId, dataArrivo, dataPartenza);
    return dirette.map(n => ({ ...n, avviso: null }));
  }

  const basiDistinte = [...new Set(regoleResult.rows.map(r => r.tipo_camera_base_id))];

  const baseRegoleResult = await pool.query(
    `SELECT DISTINCT tipo_camera_id FROM regole_derivazione_tariffe WHERE tipo_camera_id = ANY($1::int[])`,
    [basiDistinte]
  );
  if (baseRegoleResult.rows.length > 0) {
    const basiProblematiche = baseRegoleResult.rows.map(r => r.tipo_camera_id).join(', ');
    throw new Error(
      `calcolaTariffaConPlanning: il tipo camera ${tipoCameraId} deriva da tipi (${basiProblematiche}) a loro volta derivati — ` +
      `catena di derivazione a più livelli non supportata, verificare regole_derivazione_tariffe.`
    );
  }

  const regolePerPeriodo = new Map();
  let regolaFallback = null;
  for (const r of regoleResult.rows) {
    if (r.periodo_id === null) regolaFallback = r;
    else regolePerPeriodo.set(r.periodo_id, r);
  }

  const [nottiResult, ...prezziPerBase] = await Promise.all([
    pool.query(
      `SELECT n.notte::date AS notte, per.id AS periodo_id
       FROM generate_series($1::date, $2::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       LEFT JOIN periodi_stagionali per ON n.notte::date BETWEEN per.data_inizio AND per.data_fine
       ORDER BY n.notte`,
      [dataArrivo, dataPartenza]
    ),
    ...basiDistinte.map(baseId => prezzoBasePerNotteConPlanning(baseId, dataArrivo, dataPartenza)),
  ]);

  const basePrezzoPerTipoPerData = new Map();
  basiDistinte.forEach((baseId, idx) => {
    basePrezzoPerTipoPerData.set(baseId, new Map(prezziPerBase[idx].map(n => [isoData(n.notte), n.prezzo_notte])));
  });

  return nottiResult.rows.map(({ notte, periodo_id }) => {
    const regola = (periodo_id !== null && regolePerPeriodo.get(periodo_id)) || regolaFallback;
    if (!regola) {
      return { notte, prezzo_notte: null, avviso: null };
    }
    const prezzoBase = basePrezzoPerTipoPerData.get(regola.tipo_camera_base_id)?.get(isoData(notte));
    if (prezzoBase == null) {
      return { notte, prezzo_notte: null, avviso: null };
    }
    let prezzo = Math.round(prezzoBase * (1 + Number(regola.percentuale) / 100) * 100) / 100;
    let avviso = null;
    const min = regola.prezzo_minimo !== null ? Number(regola.prezzo_minimo) : null;
    const max = regola.prezzo_massimo !== null ? Number(regola.prezzo_massimo) : null;
    if (min !== null && prezzo < min) {
      avviso = `Notte del ${isoData(notte)}: calcolato ${prezzo}€, sotto il minimo dichiarato ${min}€ — riportato al minimo.`;
      prezzo = min;
    } else if (max !== null && prezzo > max) {
      avviso = `Notte del ${isoData(notte)}: calcolato ${prezzo}€, sopra il massimo dichiarato ${max}€ — riportato al massimo.`;
      prezzo = max;
    }
    return { notte, prezzo_notte: prezzo, avviso };
  });
}

async function calcolaTariffaPerTrattamentiConPlanning(tipoCameraId, dataArrivo, dataPartenza, trattamenti, opzioni = {}) {
  const { adulti = null, bambiniEta = [] } = opzioni;

  // calcolaPrezzoCameraPerNotteConPlanning (sotto in questo file), non
  // calcolaPrezzoCameraPerNotte "nuda" — bug trovato da Marco il 24/08/2026
  // stesso pomeriggio, poche ore dopo la prima consegna di questo piano:
  // un override planning-tariffe su un tipo MADRE (es. Matrimoniale) non
  // arrivava ai tipi DERIVATI (Tripla/Quadrupla), perché
  // calcolaPrezzoCameraPerNotte risolve il prezzo della base sempre e solo
  // da calcolaPrezzoDirettoPerNotte (tabella `tariffe` storica), mai da
  // planning_tariffe_giorni — vedi commento sulla funzione sotto.
  const nottiCamera = await calcolaPrezzoCameraPerNotteConPlanning(tipoCameraId, dataArrivo, dataPartenza);
  const giorni = nottiCamera.map(n => isoData(n.notte));
  const prezzoCameraPerNotte = new Map(nottiCamera.map(n => [isoData(n.notte), n.prezzo_notte]));

  const overrideResult = await pool.query(
    `SELECT trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
     FROM planning_tariffe_giorni
     WHERE tipo_camera_id = $1 AND data >= $2 AND data < $3`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );
  const overridePerChiave = new Map(overrideResult.rows.map(r => [`${r.trattamento}|${isoData(r.data)}`, r]));

  const risultati = {};
  for (const trattamento of trattamenti) {
    let prezzoTotale = 0;
    const nottiScoperte = [];
    for (const di of giorni) {
      const override = overridePerChiave.get(`${trattamento}|${di}`);
      if (override?.prezzo_notte != null) {
        prezzoTotale += Number(override.prezzo_notte);
        continue;
      }
      const prezzoCamera = prezzoCameraPerNotte.get(di);
      if (prezzoCamera == null) {
        nottiScoperte.push(di);
        continue;
      }
      let supplemento = 0;
      if (trattamento !== 'bb') {
        const dettaglio = await calcolaSupplementoTrattamento(tipoCameraId, di, aggiungiGiorno(di), trattamento, adulti, bambiniEta);
        if (dettaglio.notti_scoperte.length > 0) {
          nottiScoperte.push(di);
          continue;
        }
        supplemento = dettaglio.totale;
      }
      prezzoTotale += prezzoCamera + supplemento;
    }
    const coperto = nottiScoperte.length === 0;
    risultati[trattamento] = {
      num_notti: giorni.length,
      prezzo_totale: coperto ? Math.round(prezzoTotale * 100) / 100 : null,
      notti_scoperte: nottiScoperte,
      avvisi: [],
      restrizioni: valutaRestrizioniTrattamento(overridePerChiave, trattamento, giorni),
    };
  }
  return risultati;
}

// Restrizioni (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell) — [Ipotesi,
// da riconfermare col titolare la prima volta che le usa su date realmente
// prenotabili]: sono lette PER TRATTAMENTO perché così sono salvate in
// planning_tariffe_giorni (una riga per tipo_camera+trattamento+data), non
// esiste nello schema un concetto di restrizione unica per camera
// indipendente dal trattamento. Convenzione applicata qui: chiuso_arrivo e
// min_stay si verificano sulla riga della PRIMA notte del soggiorno
// richiesto; chiuso_partenza sulla riga dell'ULTIMA notte (il giorno di
// partenza stesso non è una "notte" e non ha una propria riga); stop_sell
// blocca se vero su QUALSIASI notte del soggiorno.
function valutaRestrizioniTrattamento(overridePerChiave, trattamento, giorni) {
  if (giorni.length === 0) return { bloccato: false, motivo: null };
  const primaNotte = giorni[0];
  const ultimaNotte = giorni[giorni.length - 1];
  const rigaArrivo = overridePerChiave.get(`${trattamento}|${primaNotte}`);
  const rigaPartenza = overridePerChiave.get(`${trattamento}|${ultimaNotte}`);

  if (rigaArrivo?.chiuso_arrivo) {
    return { bloccato: true, motivo: `Arrivo non disponibile il ${primaNotte} per questo trattamento.` };
  }
  if (rigaPartenza?.chiuso_partenza) {
    return { bloccato: true, motivo: `Partenza non disponibile il ${aggiungiGiorno(ultimaNotte)} per questo trattamento.` };
  }
  const minStayRichiesto = rigaArrivo?.min_stay ?? null;
  if (minStayRichiesto != null && giorni.length < minStayRichiesto) {
    return { bloccato: true, motivo: `Minimo ${minStayRichiesto} notti per un arrivo il ${primaNotte}.` };
  }
  for (const di of giorni) {
    const riga = overridePerChiave.get(`${trattamento}|${di}`);
    if (riga?.stop_sell) {
      return { bloccato: true, motivo: `Vendita chiusa per la notte del ${di}.` };
    }
  }
  return { bloccato: false, motivo: null };
}

// calcolaTariffaConPlanning — stesso rapporto con calcolaTariffaPerTrattamentiConPlanning
// di calcolaTariffa con calcolaTariffaPerTrattamenti in tariffeController.js
// (un solo trattamento nella lista, per non duplicare la logica). Usata da
// prenota() in bookingPubblicoController.js per il ricalcolo server-side.
async function calcolaTariffaConPlanning(tipoCameraId, dataArrivo, dataPartenza, opzioni = {}) {
  const { trattamento = 'bb' } = opzioni;
  const risultati = await calcolaTariffaPerTrattamentiConPlanning(tipoCameraId, dataArrivo, dataPartenza, [trattamento], opzioni);
  return risultati[trattamento];
}

module.exports = {
  griglia, aggiorna, TRATTAMENTI, aggiungiGiorno, isoData,
  calcolaTariffaPerTrattamentiConPlanning, calcolaTariffaConPlanning,
};
