// Controller Prenotazioni (Fase 2, modulo Prenotazioni Sezione 2 del contratto
// API). Vedi docs/PRENOTAZIONI_FASE2.md Parte B.4-B.5 e Parte A.2.
//
// Non implementa qui i sotto-endpoint di Sezione 3 (POST .../soggiorni,
// PATCH /api/soggiorni/:id) — sessione separata, come da
// "Suggerimento per spezzare in sessioni" del contratto.

const pool = require('../config/db');
const { DOC_MASCHERATO } = require('./anagraficaOspitiController');
const { gestisciConflittoCamera } = require('../utils/erroriDb');
const { inviaConfermaPrenotazione, inviaPromemoriaPreArrivo, inviaRichiestaRecensione, inviaInvitoPreCheckin } = require('../lib/emailPrenotazioni');

// Mappa esplicita delle transizioni di stato ammesse — non if/else sparsi.
// Qualunque transizione fuori da questa mappa è un 400.
const TRANSIZIONI_VALIDE = {
  opzione:    ['confermata', 'interrotta'],
  confermata: ['check_in', 'interrotta'],
  check_in:   ['check_out'],
  check_out:  ['chiusa'],
};

// GET /api/prenotazioni/griglia?data_inizio=&data_fine= — vista planning.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
// LEFT JOIN a partire da camere (non da soggiorni): la griglia deve mostrare
// SEMPRE tutte le camere ATTIVE come righe, comprese quelle libere nel range
// richiesto (altrimenti non sarebbe possibile trascinarci sopra una
// prenotazione) — le colonne soggiorno_id/prenotazione_id ecc. sono NULL
// per una camera senza soggiorni nel range. Filtro c.attivo = true
// (Impostazioni▸Camere, 31/07/2026): una camera disattivata non deve
// comparire come riga prenotabile, ma i suoi soggiorni storici restano
// interrogabili altrove (dettaglio prenotazione, scheda ospite). Ordinamento numerico esplicito
// su camere.numero (VARCHAR) per evitare l'ordine lessicografico ('10'
// prima di '2') — stesso pattern di guardia già usato in camereController.
// c.tipo_camera_id (modulo 2.2) serve al form "Nuova prenotazione" per
// chiamare GET /api/tariffe/calcola in base alla categoria della camera scelta.
async function griglia(req, res) {
  const { data_inizio, data_fine } = req.query;
  if (!data_inizio || !data_fine) {
    return res.status(400).json({ error: 'data_inizio e data_fine sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `SELECT c.id AS camera_id, c.numero AS camera_numero, c.nome AS camera_nome, c.piano,
              c.tipo_camera_id,
              s.id AS soggiorno_id, s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale,
              p.id AS prenotazione_id, p.stato AS prenotazione_stato, p.gruppo_id,
              o.id AS ospite_id, o.nome AS ospite_nome, o.cognome AS ospite_cognome
       FROM camere c
       LEFT JOIN soggiorni s ON s.camera_id = c.id AND s.cancellato = false
         AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1, $2, '[)')
       LEFT JOIN prenotazioni p ON p.id = s.prenotazione_id
       LEFT JOIN ospiti o ON o.id = s.ospite_id
       WHERE c.attivo = true
       ORDER BY c.piano NULLS LAST,
                CASE WHEN c.numero ~ '^\\d+$' THEN c.numero::INTEGER ELSE 999999 END,
                s.data_arrivo`,
      [data_inizio, data_fine]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('griglia prenotazioni error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/prenotazioni/disponibilita?data_arrivo=&data_partenza=&escludi_soggiorno_id=
// Camere libere/occupate per un intervallo di date libero (non vincolato al
// range visibile della griglia, a differenza di /griglia) — serve ai form
// "aggiungi camera" per colorare le camere disponibili invece di lasciare
// scoprire il conflitto solo al salvataggio (15/08/2026). Stesso overlap
// `daterange(...) && daterange(...)` di griglia(), ma collassato a un solo
// booleano per camera invece che per singolo soggiorno. escludi_soggiorno_id
// (opzionale) serve a chi sposta un soggiorno esistente: la sua stessa
// camera/data non deve risultare "occupata da se stessa".
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura) —
// stessi permessi di /griglia.
async function disponibilita(req, res) {
  const { data_arrivo, data_partenza, escludi_soggiorno_id } = req.query;
  if (!data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'data_arrivo e data_partenza sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `SELECT c.id AS camera_id, c.numero, c.nome, c.piano,
              EXISTS (
                SELECT 1 FROM soggiorni s
                WHERE s.camera_id = c.id AND s.cancellato = false
                  AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1, $2, '[)')
                  AND ($3::int IS NULL OR s.id != $3)
              ) AS occupata
       FROM camere c
       WHERE c.attivo = true
       ORDER BY c.piano NULLS LAST,
                CASE WHEN c.numero ~ '^\\d+$' THEN c.numero::INTEGER ELSE 999999 END`,
      [data_arrivo, data_partenza, escludi_soggiorno_id || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('disponibilita prenotazioni error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/prenotazioni — elenco filtrabile/ricercabile, una riga per
// soggiorno (camera), non per prenotazione: è la granularità che serve
// davvero a chi cerca ("dov'è Mario Rossi", "chi c'è in camera 12"), una
// prenotazione multi-camera comparirà con più righe. Nasce dal confronto
// con Cloudbeds (pagina "Reservations" separata dalla griglia calendario,
// 14/08/2026) — la griglia (/griglia) resta vincolata al range di date
// visibili, questo endpoint fa ricerca libera su tutto lo storico.
// Filtri tutti opzionali e combinabili: ricerca (nome/cognome ospite o
// numero camera, ILIKE), data_da/data_a (su data_arrivo), stato, canale_origine.
// Paginazione: pagina (default 1), per_pagina (default 50, tetto 200 per
// evitare query senza filtri troppo pesanti).
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura) —
// stessi permessi di /griglia, è la stessa vista in un'altra forma.
async function lista(req, res) {
  const { ricerca, data_da, data_a, stato, canale_origine } = req.query;
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const perPagina = Math.min(200, Math.max(1, parseInt(req.query.per_pagina, 10) || 50));
  const offset = (pagina - 1) * perPagina;

  const condizioni = ['1=1'];
  const parametri = [];

  if (ricerca) {
    parametri.push(`%${ricerca}%`);
    const idx = parametri.length;
    condizioni.push(`(o.nome ILIKE $${idx} OR o.cognome ILIKE $${idx} OR c.numero ILIKE $${idx})`);
  }
  if (data_da) {
    parametri.push(data_da);
    condizioni.push(`s.data_arrivo >= $${parametri.length}`);
  }
  if (data_a) {
    parametri.push(data_a);
    condizioni.push(`s.data_arrivo <= $${parametri.length}`);
  }
  if (stato) {
    parametri.push(stato);
    condizioni.push(`p.stato = $${parametri.length}`);
  }
  if (canale_origine) {
    parametri.push(canale_origine);
    condizioni.push(`p.canale_origine = $${parametri.length}`);
  }

  const whereSql = condizioni.join(' AND ');

  try {
    const totaleRes = await pool.query(
      `SELECT COUNT(*) AS totale
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       LEFT JOIN ospiti o ON o.id = s.ospite_id
       WHERE ${whereSql} AND s.cancellato = false`,
      parametri
    );

    parametri.push(perPagina, offset);
    const result = await pool.query(
      `SELECT s.id AS soggiorno_id, s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale,
              c.numero AS camera_numero, c.piano,
              p.id AS prenotazione_id, p.stato, p.canale_origine, p.created_at,
              o.id AS ospite_id, o.nome AS ospite_nome, o.cognome AS ospite_cognome
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       LEFT JOIN ospiti o ON o.id = s.ospite_id
       WHERE ${whereSql} AND s.cancellato = false
       ORDER BY s.data_arrivo DESC
       LIMIT $${parametri.length - 1} OFFSET $${parametri.length}`,
      parametri
    );

    res.json({
      risultati: result.rows,
      totale: totaleRes.rows[0].totale,
      pagina,
      per_pagina: perPagina,
    });
  } catch (err) {
    console.error('lista prenotazioni error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/prenotazioni/:id — dettaglio completo.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function dettaglio(req, res) {
  try {
    // LEFT JOIN gruppi_prenotazione solo per il nome (gruppo_id da solo non
    // basta al pannello dettaglio per mostrare qualcosa di leggibile) —
    // nessun impatto sulle altre colonne, prenotazione.gruppo_id resta
    // quello della tabella prenotazioni.
    const prenotazione = await pool.query(
      `SELECT p.*, g.nome AS gruppo_nome
       FROM prenotazioni p
       LEFT JOIN gruppi_prenotazione g ON g.id = p.gruppo_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!prenotazione.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    const soggiorniResult = await pool.query(
      `SELECT s.id, s.camera_id, c.numero AS camera_numero, c.nome AS camera_nome, c.piano,
              s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale, s.cancellato
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       WHERE s.prenotazione_id = $1
       ORDER BY s.data_arrivo`,
      [req.params.id]
    );

    const ospitiResult = await pool.query(
      `SELECT so.soggiorno_id, so.tipo_alloggiato,
              o.id, o.nome, o.cognome, ${DOC_MASCHERATO}
       FROM soggiorno_ospiti so
       JOIN ospiti o ON o.id = so.ospite_id
       JOIN soggiorni s ON s.id = so.soggiorno_id
       WHERE s.prenotazione_id = $1`,
      [req.params.id]
    );

    // Pagamenti: tabella già esistente (migration 016), modulo Pagamenti
    // (Sessione 4) non ancora costruito — oggi non ci sono mai righe, ma la
    // query e la forma della risposta (array, eventualmente vuoto) sono già
    // quelle definitive: nessun cambio di forma quando il modulo arriverà.
    const pagamentiResult = await pool.query(
      'SELECT * FROM pagamenti WHERE prenotazione_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    const soggiorni = soggiorniResult.rows.map(s => ({
      ...s,
      ospiti: ospitiResult.rows
        .filter(o => o.soggiorno_id === s.id)
        .map(({ soggiorno_id, ...ospite }) => ospite),
    }));

    res.json({
      ...prenotazione.rows[0],
      soggiorni,
      pagamenti: pagamentiResult.rows,
    });
  } catch (err) {
    console.error('dettaglio prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/prenotazioni/:id/conto — riepilogo economico completo: camera +
// addebiti extra + tassa di soggiorno, al netto dei pagamenti già
// incassati (14/08/2026). Nasce dal confronto con Cloudbeds (riepilogo
// saldo nel popover prenotazione): prima il pannello mostrava la tariffa
// solo nel tooltip al passaggio del mouse, i pagamenti in lista grezza
// senza somma, gli addebiti extra solo con un link a un'altra pagina, e la
// tassa di soggiorno non compariva affatto.
//
// La tassa di soggiorno resta un flusso volutamente separato dai pagamenti
// prenotazione — quando si riscuote (tassaSoggiornoController.riscuoti)
// NON viene creata una riga in `pagamenti` — quindi qui è sommata al saldo
// ma il suo "riscosso" è tracciato a parte (tassa_soggiorno.riscossa),
// mai fuso dentro pagamenti.totale. Non viene calcolata da questo
// endpoint se manca (nessuna chiamata a tassaSoggiornoController.calcola):
// un side effect con possibili errori di configurazione aliquota non è
// pertinente a un endpoint di sola lettura — un soggiorno senza calcolo
// espone semplicemente calcolata:false, dovuto:null, senza bloccare il
// resto del riepilogo.
// Accessibile a: admin, titolare, receptionist — stessi permessi di
// 'pagamenti' (route), niente portiere_notte (come addebiti_extra).
async function conto(req, res) {
  try {
    const prenotazione = await pool.query(
      'SELECT id FROM prenotazioni WHERE id = $1',
      [req.params.id]
    );
    if (!prenotazione.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    // Solo soggiorni non cancellati: una stanza interrotta non deve pesare
    // sul saldo dovuto.
    const soggiorniRes = await pool.query(
      `SELECT s.id, c.numero AS camera_numero, s.tariffa_totale
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       WHERE s.prenotazione_id = $1 AND s.cancellato = false
       ORDER BY s.data_arrivo`,
      [req.params.id]
    );
    const soggiornoIds = soggiorniRes.rows.map(s => s.id);
    const totaleCamera = soggiorniRes.rows.reduce((sum, s) => sum + parseFloat(s.tariffa_totale || 0), 0);

    let addebitiExtra = [];
    let totaleAddebitiExtra = 0;
    if (soggiornoIds.length) {
      const addebitiRes = await pool.query(
        `SELECT ae.id, ae.soggiorno_id, ae.descrizione, ae.importo, ae.data
         FROM addebiti_extra ae
         WHERE ae.soggiorno_id = ANY($1::int[])
         ORDER BY ae.created_at`,
        [soggiornoIds]
      );
      addebitiExtra = addebitiRes.rows;
      totaleAddebitiExtra = addebitiRes.rows.reduce((sum, a) => sum + parseFloat(a.importo || 0), 0);
    }

    let tasseSoggiorno = [];
    let tassaDovuta = 0;
    let tassaRiscossa = 0;
    if (soggiornoIds.length) {
      const tasseRes = await pool.query(
        `SELECT soggiorno_id, importo_dovuto, importo_riscosso
         FROM tasse_soggiorno
         WHERE soggiorno_id = ANY($1::int[])`,
        [soggiornoIds]
      );
      tasseSoggiorno = soggiorniRes.rows.map(s => {
        const riga = tasseRes.rows.find(t => t.soggiorno_id === s.id);
        return {
          soggiorno_id: s.id,
          camera_numero: s.camera_numero,
          calcolata: !!riga,
          dovuto: riga ? parseFloat(riga.importo_dovuto) : null,
          riscosso: riga && riga.importo_riscosso !== null ? parseFloat(riga.importo_riscosso) : null,
        };
      });
      tassaDovuta = tasseRes.rows.reduce((sum, t) => sum + parseFloat(t.importo_dovuto || 0), 0);
      tassaRiscossa = tasseRes.rows.reduce((sum, t) => sum + parseFloat(t.importo_riscosso || 0), 0);
    }

    const pagamentiRes = await pool.query(
      `SELECT id, importo, metodo, tipo, created_at
       FROM pagamenti WHERE prenotazione_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    const totalePagamenti = pagamentiRes.rows.reduce((sum, p) => sum + parseFloat(p.importo || 0), 0);

    const arrotonda = n => Math.round(n * 100) / 100;
    const tassaDaRiscuotere = tassaDovuta - tassaRiscossa;
    const saldoDaIncassare = (totaleCamera + totaleAddebitiExtra) - totalePagamenti + tassaDaRiscuotere;

    res.json({
      camera: { totale: arrotonda(totaleCamera) },
      addebiti_extra: { totale: arrotonda(totaleAddebitiExtra), voci: addebitiExtra },
      tassa_soggiorno: {
        dovuta: arrotonda(tassaDovuta),
        riscossa: arrotonda(tassaRiscossa),
        da_riscuotere: arrotonda(tassaDaRiscuotere),
        soggiorni: tasseSoggiorno,
      },
      pagamenti: { totale: arrotonda(totalePagamenti), voci: pagamentiRes.rows },
      saldo_da_incassare: arrotonda(saldoDaIncassare),
    });
  } catch (err) {
    console.error('conto prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/prenotazioni — crea prenotazione + primo soggiorno + riga
// soggiorno_ospiti (capofamiglia, tipo_alloggiato='17'), in una transazione.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function crea(req, res) {
  const { canale_origine, external_booking_id, gruppo_id, note, soggiorno } = req.body;

  if (!canale_origine) {
    return res.status(400).json({ error: 'canale_origine è obbligatorio.' });
  }
  if (!soggiorno || !soggiorno.camera_id || !soggiorno.ospite_id || !soggiorno.data_arrivo || !soggiorno.data_partenza) {
    return res.status(400).json({ error: 'soggiorno.camera_id, ospite_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (soggiorno.data_partenza <= soggiorno.data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // data_scadenza_opzione calcolata lato backend (now + 48h) — mai dal client.
    const prenotazioneResult = await client.query(
      `INSERT INTO prenotazioni (canale_origine, external_booking_id, stato, data_scadenza_opzione, gruppo_id, note)
       VALUES ($1, $2, 'opzione', NOW() + INTERVAL '48 hours', $3, $4)
       RETURNING *`,
      [canale_origine, external_booking_id || null, gruppo_id || null, note || null]
    );
    const prenotazione = prenotazioneResult.rows[0];

    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale, pacchetto_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        prenotazione.id, soggiorno.camera_id, soggiorno.ospite_id,
        soggiorno.data_arrivo, soggiorno.data_partenza,
        soggiorno.num_ospiti || 1, soggiorno.tariffa_totale || null,
        soggiorno.pacchetto_id || null, // modulo 2.2 — se valorizzato, tariffa_totale viene dal pacchetto (comunque libera)
      ]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato)
       VALUES ($1, $2, '17')`,
      [soggiornoResult.rows[0].id, soggiorno.ospite_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...prenotazione, soggiorno: soggiornoResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (gestisciConflittoCamera(err, res)) return;
    console.error('crea prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// POST /api/prenotazioni/:id/soggiorni — aggiunge un altro soggiorno (camera)
// alla stessa prenotazione, caso multi-camera (stesso gruppo, camere diverse).
// Stesso payload "soggiorno" di crea(), stessa creazione automatica della
// riga soggiorno_ospiti capofamiglia (tipo_alloggiato='17') per coerenza.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiungiSoggiorno(req, res) {
  const { soggiorno } = req.body;
  if (!soggiorno || !soggiorno.camera_id || !soggiorno.ospite_id || !soggiorno.data_arrivo || !soggiorno.data_partenza) {
    return res.status(400).json({ error: 'soggiorno.camera_id, ospite_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (soggiorno.data_partenza <= soggiorno.data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prenotazioneResult = await client.query(
      'SELECT id FROM prenotazioni WHERE id = $1',
      [req.params.id]
    );
    if (!prenotazioneResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale, pacchetto_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id, soggiorno.camera_id, soggiorno.ospite_id,
        soggiorno.data_arrivo, soggiorno.data_partenza,
        soggiorno.num_ospiti || 1, soggiorno.tariffa_totale || null,
        soggiorno.pacchetto_id || null,
      ]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato)
       VALUES ($1, $2, '17')`,
      [soggiornoResult.rows[0].id, soggiorno.ospite_id]
    );

    await client.query('COMMIT');
    res.status(201).json(soggiornoResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (gestisciConflittoCamera(err, res)) return;
    console.error('aggiungi soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// PATCH /api/prenotazioni/:id — modifica solo note/canale_origine, mai lo stato.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiorna(req, res) {
  // gruppo_id gestito in modo undefined-safe (a differenza di note/
  // canale_origine, che usano COALESCE): deve poter essere impostato
  // esplicitamente a null per sganciare una prenotazione da un gruppo,
  // non solo valorizzato. $3 indica se il campo è stato inviato nel body,
  // $4 è il valore da scrivere solo in quel caso (CASE invece di COALESCE,
  // che non distinguerebbe "non inviato" da "inviato come null").
  const { note, canale_origine, gruppo_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE prenotazioni SET
         note           = COALESCE($1, note),
         canale_origine = COALESCE($2, canale_origine),
         gruppo_id      = CASE WHEN $3 THEN $4 ELSE gruppo_id END,
         updated_at     = NOW()
       WHERE id = $5
       RETURNING *`,
      [note ?? null, canale_origine || null, gruppo_id !== undefined, gruppo_id ?? null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/prenotazioni/:id/stato — transizione di stato esplicita.
// Permessi verificati a livello di route (richiedeTransizioneStato in
// routes/prenotazioni.js): qui si valida solo che la transizione richiesta
// sia ammessa dalla state machine, indipendentemente dal ruolo.
// Se la transizione è verso 'interrotta', imposta cancellato=true su tutti
// i soggiorni della prenotazione nella STESSA transazione (regola di
// sincronizzazione, docs/PRENOTAZIONI_FASE2.md Parte B.5) — altrimenti il
// vincolo EXCLUDE continuerebbe a bloccare quella camera/date per sempre.
async function aggiornaStato(req, res) {
  const { stato: statoRichiesto } = req.body;
  if (!statoRichiesto) {
    return res.status(400).json({ error: 'stato è obbligatorio.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const attuale = await client.query(
      'SELECT id, stato FROM prenotazioni WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!attuale.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    const statoAttuale = attuale.rows[0].stato;
    const transizioniAmmesse = TRANSIZIONI_VALIDE[statoAttuale] || [];
    if (!transizioniAmmesse.includes(statoRichiesto)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Transizione da '${statoAttuale}' a '${statoRichiesto}' non consentita.`,
      });
    }

    const result = await client.query(
      `UPDATE prenotazioni SET stato = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [statoRichiesto, req.params.id]
    );

    if (statoRichiesto === 'interrotta') {
      await client.query(
        'UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1',
        [req.params.id]
      );
    }

    // Ora reale del check-in (migration 035, 13/08/2026) — prerequisito
    // per la futura regola WS_ALLOGGIATI 24h/6h (day-use), vedi
    // docs/EVOLUTIVE.md "Modulo 2.5 — Fase 2". La transizione è per
    // prenotazione (non esiste uno stato per singolo soggiorno), quindi
    // valorizza tutti i soggiorni della prenotazione insieme. Guardia
    // IS NULL puramente difensiva: TRANSIZIONI_VALIDE non permette
    // comunque check_in → check_in, non dovrebbe mai sovrascrivere.
    if (statoRichiesto === 'check_in') {
      await client.query(
        `UPDATE soggiorni SET check_in_effettuato_at = NOW()
         WHERE prenotazione_id = $1 AND check_in_effettuato_at IS NULL`,
        [req.params.id]
      );
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);

    // Email di conferma — dopo aver già risposto al client: l'invio (Resend,
    // rete esterna) non deve mai far attendere né fallire la risposta HTTP.
    // inviaConfermaPrenotazione è "best effort" al suo interno (logga e
    // ritorna, non lancia mai) — comunque avvolta qui per sicurezza.
    if (statoRichiesto === 'confermata') {
      inviaConfermaPrenotazione(req.params.id).catch(err => {
        console.error('invio email conferma prenotazione — errore imprevisto:', err.message);
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('aggiorna stato prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// POST /api/prenotazioni/:id/test-email — invio manuale di test (modulo 5.3,
// 04/08/2026). Accessibile a: admin, titolare (azione 'test_email', vedi
// shared/ruoli.js). A differenza della conferma automatica in aggiornaStato,
// qui l'invio è ATTESO (non fire-and-forget): serve a mostrare all'admin
// l'esito reale — utile perché promemoria/recensione normalmente partono
// solo dal job giornaliero (backend/jobs/promemoriaEmail.js) in base a date
// calcolate, quindi altrimenti non testabili senza aspettare o manipolare
// il DB. Bypassa stato/date reali della prenotazione: non aggiorna nulla se
// non l'eventuale colonna email_*_inviata_at già gestita dentro emailPrenotazioni.js.
const INVIO_PER_TIPO = {
  conferma:    inviaConfermaPrenotazione,
  promemoria:  inviaPromemoriaPreArrivo,
  recensione:  inviaRichiestaRecensione,
};

async function testEmail(req, res) {
  const { tipo } = req.body;
  const invia = INVIO_PER_TIPO[tipo];
  if (!invia) {
    return res.status(400).json({ error: `tipo deve essere uno tra: ${Object.keys(INVIO_PER_TIPO).join(', ')}.` });
  }
  try {
    const controllo = await pool.query('SELECT id FROM prenotazioni WHERE id = $1', [req.params.id]);
    if (!controllo.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }
    const esito = await invia(req.params.id);
    res.json(esito);
  } catch (err) {
    console.error('test invio email prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/prenotazioni/:id/invia-pre-checkin — invio manuale (reale) del
// link di pre check-in (modulo 5.2 Fase B, 04/08/2026). Accessibile a:
// admin, titolare, receptionist (azione 'invia_pre_checkin'). A differenza
// di testEmail, qui l'invito viene davvero registrato
// (prenotazioni.pre_checkin_inviato_at) — il job del promemoria non lo
// includerà una seconda volta.
async function inviaPreCheckin(req, res) {
  try {
    const controllo = await pool.query('SELECT id FROM prenotazioni WHERE id = $1', [req.params.id]);
    if (!controllo.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }
    const esito = await inviaInvitoPreCheckin(req.params.id);
    res.json(esito);
  } catch (err) {
    console.error('invia pre-checkin error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { griglia, disponibilita, lista, dettaglio, conto, crea, aggiungiSoggiorno, aggiorna, aggiornaStato, testEmail, inviaPreCheckin, TRANSIZIONI_VALIDE };
