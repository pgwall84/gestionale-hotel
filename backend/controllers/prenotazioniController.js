// Controller Prenotazioni (Fase 2, modulo Prenotazioni Sezione 2 del contratto
// API). Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md Sezioni 2-3 e
// docs/API_PRENOTAZIONI_FASE2.md Sezione 2.
//
// Non implementa qui i sotto-endpoint di Sezione 3 (POST .../soggiorni,
// PATCH /api/soggiorni/:id) — sessione separata, come da
// "Suggerimento per spezzare in sessioni" del contratto.

const pool = require('../config/db');
const { DOC_MASCHERATO } = require('./anagraficaOspitiController');

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
async function griglia(req, res) {
  const { data_inizio, data_fine } = req.query;
  if (!data_inizio || !data_fine) {
    return res.status(400).json({ error: 'data_inizio e data_fine sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `SELECT s.id AS soggiorno_id, s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale,
              c.id AS camera_id, c.numero AS camera_numero, c.nome AS camera_nome, c.piano,
              p.id AS prenotazione_id, p.stato AS prenotazione_stato,
              o.id AS ospite_id, o.nome AS ospite_nome, o.cognome AS ospite_cognome
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       JOIN ospiti o ON o.id = s.ospite_id
       WHERE s.cancellato = false
         AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1, $2, '[)')
       ORDER BY c.piano NULLS LAST, c.numero, s.data_arrivo`,
      [data_inizio, data_fine]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('griglia prenotazioni error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/prenotazioni/:id — dettaglio completo.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function dettaglio(req, res) {
  try {
    const prenotazione = await pool.query(
      'SELECT * FROM prenotazioni WHERE id = $1',
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
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        prenotazione.id, soggiorno.camera_id, soggiorno.ospite_id,
        soggiorno.data_arrivo, soggiorno.data_partenza,
        soggiorno.num_ospiti || 1, soggiorno.tariffa_totale || null,
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
    // Violazione del vincolo anti-overbooking (EXCLUDE) — vedi
    // SCHEMA_PRENOTAZIONI_FASE2.md Sezione 3. Codice Postgres 23P01 =
    // exclusion_violation, err.constraint identifica il vincolo specifico.
    if (err.code === '23P01' && err.constraint === 'excl_soggiorni_camera_overlap') {
      return res.status(409).json({ error: 'Camera già occupata in queste date' });
    }
    console.error('crea prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// PATCH /api/prenotazioni/:id — modifica solo note/canale_origine, mai lo stato.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiorna(req, res) {
  const { note, canale_origine } = req.body;
  try {
    const result = await pool.query(
      `UPDATE prenotazioni SET
         note           = COALESCE($1, note),
         canale_origine = COALESCE($2, canale_origine),
         updated_at     = NOW()
       WHERE id = $3
       RETURNING *`,
      [note ?? null, canale_origine || null, req.params.id]
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
// sincronizzazione, SCHEMA_PRENOTAZIONI_FASE2.md Sezione 3) — altrimenti il
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

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('aggiorna stato prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

module.exports = { griglia, dettaglio, crea, aggiorna, aggiornaStato, TRANSIZIONI_VALIDE };
