// Controller tariffe — fasce di prezzo per notte, per tipo camera e periodo
// (stagionalità). Modulo 2.2, Fase 2A. Vedi docs/PRENOTAZIONI_FASE2.md.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare
// (shared/ruoli.js, sezione 'tariffe').

const pool = require('../config/db');

// GET /api/tariffe?tipo_camera_id= — elenco fasce, filtro opzionale per categoria
async function lista(req, res) {
  const { tipo_camera_id } = req.query;
  try {
    const params = [];
    let query = `
      SELECT t.id, t.tipo_camera_id, tc.nome AS tipo_camera_nome,
             t.nome_stagione, t.data_inizio, t.data_fine, t.prezzo_notte,
             t.periodo_id, per.nome AS periodo_nome
      FROM tariffe t
      JOIN tipi_camera tc ON tc.id = t.tipo_camera_id
      LEFT JOIN periodi_stagionali per ON per.id = t.periodo_id
    `;
    if (tipo_camera_id) {
      params.push(tipo_camera_id);
      query += ' WHERE t.tipo_camera_id = $1';
    }
    query += ' ORDER BY tc.nome, t.data_inizio';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('lista tariffe error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// Converte un valore data restituito da pg (Date o stringa) in 'YYYY-MM-DD'
// stabile — mai passare da new Date().toISOString() su un valore "adesso"
// locale (bug già trovato e corretto altrove nel progetto, vedi
// docs/DIARIO_SESSIONI.md 13/08/2026): qui invece la Date arriva già come
// mezzanotte UTC dal parser di pg per le colonne `date`, quindi
// toISOString().slice(0,10) è sicuro.
function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// Prezzo diretto (non derivato) da `tariffe`, notte per notte — comportamento
// storico invariato. Usato sia per i tipi "madre" sia per risolvere il
// prezzo del tipo base quando si calcola un tipo derivato.
async function calcolaPrezzoDirettoPerNotte(tipoCameraId, dataArrivo, dataPartenza) {
  const result = await pool.query(
    `SELECT n.notte::date AS notte, t.prezzo_notte
     FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
     LEFT JOIN tariffe t
       ON t.tipo_camera_id = $1
      AND n.notte::date BETWEEN t.data_inizio AND t.data_fine
     ORDER BY n.notte`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );
  return result.rows.map(r => ({
    notte: r.notte,
    prezzo_notte: r.prezzo_notte !== null ? Number(r.prezzo_notte) : null,
  }));
}

// Prezzo camera (solo B&B) notte per notte — per i tipi "madre" prezzo
// diretto da `tariffe` (invariato); per i tipi derivati (Singola, Doppia uso
// singola, Tripla, Quadrupla — migration 050/051, 19-20/08/2026) calcola da
// regole_derivazione_tariffe: percentuale sul prezzo del tipo base, PER
// NOTTE (la percentuale può variare per periodo stagionale, confermato dal
// titolare il 20/08/2026 — non è più una costante fissa tutto l'anno come
// nella prima versione del 19/08). Il risultato è sempre riportato dentro
// il range [prezzo_minimo, prezzo_massimo] della regola se configurato: è la
// dichiarazione tariffaria vincolante fatta alla Regione, mai superabile
// (clamp automatico + avviso — non un blocco 500, per non impedire una
// prenotazione online reale per un problema di configurazione interna, ma
// nemmeno un numero silenziosamente fuori norma).
async function calcolaPrezzoCameraPerNotte(tipoCameraId, dataArrivo, dataPartenza) {
  const regoleResult = await pool.query(
    `SELECT periodo_id, tipo_camera_base_id, percentuale, prezzo_minimo, prezzo_massimo
     FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1`,
    [tipoCameraId]
  );

  if (regoleResult.rows.length === 0) {
    const dirette = await calcolaPrezzoDirettoPerNotte(tipoCameraId, dataArrivo, dataPartenza);
    return dirette.map(n => ({ ...n, avviso: null }));
  }

  // BUGFIX 20/08/2026 (sera) — la versione precedente leggeva UN SOLO tipo
  // base da regoleResult.rows[0] (riga scelta arbitrariamente, la query non
  // ha ORDER BY) e lo usava per l'intero anno, assumendo che la regola
  // "sempre valida" e tutte le regole per periodo dello stesso tipo derivato
  // puntassero sempre allo stesso tipo camera base. Non è più garantito da
  // quando la UI (SchedaPrezzoTipologia, stesso giorno) permette di scegliere
  // "Deriva da" indipendentemente per ogni periodo — bug trovato in code
  // review, mai emerso nei dati reali finora ma reso raggiungibile dalla
  // nuova UI. Ora la base si risolve PER NOTTE, in base alla regola
  // effettivamente applicata quella notte (periodo specifico o fallback).
  const basiDistinte = [...new Set(regoleResult.rows.map(r => r.tipo_camera_base_id))];

  // Anti-loop difensivo esteso a tutte le basi distinte usate (prima
  // controllava solo la base della riga[0]): un tipo derivato non deve a sua
  // volta derivare da un altro tipo derivato, per nessuna delle basi scelte.
  const baseRegoleResult = await pool.query(
    `SELECT DISTINCT tipo_camera_id FROM regole_derivazione_tariffe WHERE tipo_camera_id = ANY($1::int[])`,
    [basiDistinte]
  );
  if (baseRegoleResult.rows.length > 0) {
    const basiProblematiche = baseRegoleResult.rows.map(r => r.tipo_camera_id).join(', ');
    throw new Error(
      `calcolaTariffa: il tipo camera ${tipoCameraId} deriva da tipi (${basiProblematiche}) a loro volta derivati — ` +
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
    ...basiDistinte.map(baseId => calcolaPrezzoDirettoPerNotte(baseId, dataArrivo, dataPartenza)),
  ]);

  // Mappa tipo_camera_base_id -> (data ISO -> prezzo diretto quella notte)
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

// Supplemento trattamento (mezza pensione / pensione completa), a persona,
// notte per notte — nuovo 20/08/2026. categoria camera dedotta da
// capienza_max (1 → 'singola', altrimenti 'doppia'), coerente con come il
// titolare ha sempre distinto i due casi. Bambini: età 0-2 esclusi (sempre
// gratis, confermato in chat), età 3-11 con lo sconto fisso configurato in
// configurazione_bambini, età 12-17 trattati come adulti (nessuna regola
// specifica data dal titolare — assunzione da riconfermare, vedi migration
// 051). Ritorna anche le notti prive di un supplemento configurato per
// quella categoria/periodo/trattamento, mai un totale silenziosamente
// incompleto.
async function calcolaSupplementoTrattamento(tipoCameraId, dataArrivo, dataPartenza, trattamento, adulti, bambiniEta) {
  const bambini3_11 = bambiniEta.filter(e => e >= 3 && e <= 11).length;
  const bambini12_17 = bambiniEta.filter(e => e >= 12).length;
  const numeroAdultiEquivalenti = (adulti || 0) + bambini12_17;

  const capienzaResult = await pool.query(`SELECT capienza_max FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  const categoria = capienzaResult.rows[0]?.capienza_max === 1 ? 'singola' : 'doppia';

  const [scontoResult, supplementiResult, nottiResult] = await Promise.all([
    pool.query(`SELECT sconto_mezza_pensione_percentuale FROM configurazione_bambini WHERE id = 1`),
    pool.query(
      `SELECT periodo_id, supplemento_a_persona FROM supplementi_trattamento
       WHERE categoria = $1 AND trattamento = $2`,
      [categoria, trattamento]
    ),
    pool.query(
      `SELECT n.notte::date AS notte, per.id AS periodo_id
       FROM generate_series($1::date, $2::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       LEFT JOIN periodi_stagionali per ON n.notte::date BETWEEN per.data_inizio AND per.data_fine
       ORDER BY n.notte`,
      [dataArrivo, dataPartenza]
    ),
  ]);

  const scontoBambini = Number(scontoResult.rows[0]?.sconto_mezza_pensione_percentuale || 0);

  const perPeriodo = new Map();
  let fallback = null;
  for (const r of supplementiResult.rows) {
    if (r.periodo_id === null) fallback = Number(r.supplemento_a_persona);
    else perPeriodo.set(r.periodo_id, Number(r.supplemento_a_persona));
  }

  let totale = 0;
  const nottiScoperte = [];
  for (const { notte, periodo_id } of nottiResult.rows) {
    const supplemento = periodo_id !== null && perPeriodo.has(periodo_id) ? perPeriodo.get(periodo_id) : fallback;
    if (supplemento == null) {
      nottiScoperte.push(notte);
      continue;
    }
    totale += supplemento * numeroAdultiEquivalenti + supplemento * (1 - scontoBambini / 100) * bambini3_11;
  }

  return { totale: Math.round(totale * 100) / 100, notti_scoperte: nottiScoperte };
}

// Calcola il prezzo totale di un soggiorno per una categoria camera, per PIÙ
// trattamenti in un colpo solo — camera (B&B, diretta o derivata), calcolata
// UNA SOLA VOLTA, + il supplemento specifico di ciascun trattamento
// richiesto. Fix 23/08/2026 (code review 22/08/2026, Tier 2): prima ogni
// trattamento richiedeva una chiamata separata a calcolaPrezzoCameraPerNotte
// — il prezzo camera NON dipende dal trattamento (solo il supplemento lo
// fa), quindi GET /api/booking-pubblico/disponibilita, che mostra sempre i
// 3 trattamenti insieme per ogni tipo camera in lista, rifaceva 3 volte le
// stesse query (generate_series, regole_derivazione_tariffe, prezzo diretto
// del/dei tipo/i base) per ognuno degli N tipi camera trovati. Qui il
// prezzo camera si calcola una volta sola e si riusa per tutti i
// trattamenti richiesti — resta per-trattamento solo
// calcolaSupplementoTrattamento, che è l'unica parte che dipende
// effettivamente dal trattamento scelto.
// Ritorna una mappa trattamento -> stesso shape di calcolaTariffa (sotto).
async function calcolaTariffaPerTrattamenti(tipoCameraId, dataArrivo, dataPartenza, trattamenti, opzioni = {}) {
  const { adulti = null, bambiniEta = [] } = opzioni;

  const nottiCamera = await calcolaPrezzoCameraPerNotte(tipoCameraId, dataArrivo, dataPartenza);
  const nottiScoperteCamera = nottiCamera.filter(n => n.prezzo_notte === null).map(n => n.notte);
  const prezzoCamera = nottiCamera.reduce((somma, n) => somma + (n.prezzo_notte || 0), 0);
  const avvisi = nottiCamera.filter(n => n.avviso).map(n => n.avviso);
  const numNotti = nottiCamera.length;

  const risultati = {};
  await Promise.all(trattamenti.map(async (trattamento) => {
    let supplementoTrattamento = 0;
    let nottiScoperteTrattamento = [];
    if (trattamento !== 'bb') {
      const dettaglio = await calcolaSupplementoTrattamento(tipoCameraId, dataArrivo, dataPartenza, trattamento, adulti, bambiniEta);
      supplementoTrattamento = dettaglio.totale;
      nottiScoperteTrattamento = dettaglio.notti_scoperte;
    }

    const nottiScoperte = [...nottiScoperteCamera, ...nottiScoperteTrattamento];
    const coperto = nottiScoperte.length === 0;

    risultati[trattamento] = {
      num_notti: numNotti,
      prezzo_totale: coperto ? Math.round((prezzoCamera + supplementoTrattamento) * 100) / 100 : null,
      prezzo_camera: coperto ? Math.round(prezzoCamera * 100) / 100 : null,
      supplemento_trattamento: coperto ? Math.round(supplementoTrattamento * 100) / 100 : null,
      notti_scoperte: nottiScoperte,
      avvisi,
    };
  }));
  return risultati;
}

// Calcola il prezzo totale di un soggiorno per una categoria camera, UN solo
// trattamento — camera (B&B, diretta o derivata) + eventuale supplemento
// trattamento. Funzione pura riusabile sia dall'endpoint HTTP GET
// /api/tariffe/calcola sia dalle route pubbliche del booking engine
// (backend/controllers/bookingPubblicoController.js) — il prezzo non deve
// mai essere accettato dal client sulle route pubbliche, va sempre
// ricalcolato da qui. prezzo_totale è null se una o più notti non hanno un
// prezzo configurato (camera o trattamento) — mai un totale silenziosamente
// incompleto; `avvisi` segnala eventuali clamp sul range dichiarato.
// Implementata sopra calcolaTariffaPerTrattamenti (un solo trattamento nella
// lista) per non duplicare la logica.
async function calcolaTariffa(tipoCameraId, dataArrivo, dataPartenza, opzioni = {}) {
  const { trattamento = 'bb' } = opzioni;
  const risultati = await calcolaTariffaPerTrattamenti(tipoCameraId, dataArrivo, dataPartenza, [trattamento], opzioni);
  return risultati[trattamento];
}

// GET /api/tariffe/calcola?tipo_camera_id=&data_arrivo=&data_partenza=&trattamento=&adulti=&bambini_eta=
// trattamento/adulti/bambini_eta opzionali — default 'bb' senza persone,
// stesso comportamento di prima quando non passati (retrocompatibile).
async function calcola(req, res) {
  const { tipo_camera_id, data_arrivo, data_partenza, trattamento, adulti, bambini_eta } = req.query;
  if (!tipo_camera_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'tipo_camera_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  try {
    const bambiniEta = typeof bambini_eta === 'string' && bambini_eta.trim() !== ''
      ? bambini_eta.split(',').map(e => parseInt(e, 10)).filter(e => Number.isInteger(e) && e >= 0 && e < 18)
      : [];
    const risultato = await calcolaTariffa(tipo_camera_id, data_arrivo, data_partenza, {
      trattamento: trattamento || 'bb',
      adulti: adulti ? parseInt(adulti, 10) : null,
      bambiniEta,
    });
    res.json(risultato);
  } catch (err) {
    console.error('calcola tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tariffe — crea una fascia tariffaria. periodo_id opzionale
// (nuovo 20/08/2026): collega la fascia a un periodo stagionale condiviso,
// utile per la tariffa madre (Matrimoniale/Doppia B&B) da cui derivano gli
// altri tipi — non obbligatorio, le fasce senza periodo restano valide con
// solo data_inizio/data_fine come sempre.
async function crea(req, res) {
  const { tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id } = req.body;
  if (!tipo_camera_id || !data_inizio || !data_fine || !prezzo_notte) {
    return res.status(400).json({ error: 'tipo_camera_id, data_inizio, data_fine e prezzo_notte sono obbligatori.' });
  }
  if (data_fine < data_inizio) {
    return res.status(400).json({ error: 'data_fine deve essere successiva o uguale a data_inizio.' });
  }
  if (Number(prezzo_notte) <= 0) {
    return res.status(400).json({ error: 'Il prezzo per notte deve essere maggiore di zero.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tipo_camera_id, nome_stagione || null, data_inizio, data_fine, prezzo_notte, periodo_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') { // exclusion_violation — sovrapposizione date
      return res.status(409).json({ error: 'Le date si sovrappongono a una fascia tariffaria già esistente per questo tipo camera.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Tipo camera non valido.' });
    }
    console.error('crea tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/tariffe/:id — modifica una fascia tariffaria. periodo_id: per
// poterlo anche SCOLLEGARE esplicitamente (non solo impostare), va passato
// undefined per "non toccare" e null per "rimuovi" — CASE invece di
// COALESCE, stesso principio già usato altrove nel progetto per gruppo_id
// (docs/DIARIO_SESSIONI.md, 15/08/2026) quando serve poter tornare a NULL.
async function aggiorna(req, res) {
  const { nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tariffe
       SET nome_stagione = COALESCE($2, nome_stagione),
           data_inizio   = COALESCE($3, data_inizio),
           data_fine     = COALESCE($4, data_fine),
           prezzo_notte  = COALESCE($5, prezzo_notte),
           periodo_id    = CASE WHEN $6 THEN periodo_id ELSE $7 END,
           updated_at    = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome_stagione || null, data_inizio || null, data_fine || null, prezzo_notte || null,
       periodo_id === undefined, periodo_id === undefined ? null : periodo_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Fascia tariffaria non trovata.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Le date si sovrappongono a una fascia tariffaria già esistente per questo tipo camera.' });
    }
    console.error('aggiorna tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// DELETE /api/tariffe/:id — elimina una fascia tariffaria
async function elimina(req, res) {
  try {
    const result = await pool.query('DELETE FROM tariffe WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Fascia tariffaria non trovata.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('elimina tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, calcola, calcolaTariffa, calcolaTariffaPerTrattamenti, crea, aggiorna, elimina };
