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
             t.nome_stagione, t.data_inizio, t.data_fine, t.prezzo_notte
      FROM tariffe t
      JOIN tipi_camera tc ON tc.id = t.tipo_camera_id
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

// GET /api/tariffe/calcola?tipo_camera_id=&data_arrivo=&data_partenza=
// Somma il prezzo_notte di ogni notte del soggiorno (data_partenza esclusa,
// stesso range delle notti effettivamente pagate — coerente con l'EXCLUDE
// '[)' su soggiorni). Se una o più notti non hanno una tariffa configurata,
// le segnala in notti_scoperte invece di restituire un totale silenziosamente
// incompleto: il form frontend chiederà l'inserimento manuale in quel caso.
async function calcola(req, res) {
  const { tipo_camera_id, data_arrivo, data_partenza } = req.query;
  if (!tipo_camera_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'tipo_camera_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  try {
    const result = await pool.query(
      `SELECT n.notte::date AS notte, t.prezzo_notte
       FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       LEFT JOIN tariffe t
         ON t.tipo_camera_id = $1
        AND n.notte::date BETWEEN t.data_inizio AND t.data_fine
       ORDER BY n.notte`,
      [tipo_camera_id, data_arrivo, data_partenza]
    );

    const nottiScoperte = result.rows.filter(r => r.prezzo_notte === null).map(r => r.notte);
    const prezzoTotale = result.rows.reduce((somma, r) => somma + (r.prezzo_notte ? Number(r.prezzo_notte) : 0), 0);

    res.json({
      num_notti: result.rows.length,
      prezzo_totale: nottiScoperte.length === 0 ? prezzoTotale : null,
      notti_scoperte: nottiScoperte,
    });
  } catch (err) {
    console.error('calcola tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tariffe — crea una fascia tariffaria
async function crea(req, res) {
  const { tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte } = req.body;
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
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tipo_camera_id, nome_stagione || null, data_inizio, data_fine, prezzo_notte]
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

// PATCH /api/tariffe/:id — modifica una fascia tariffaria
async function aggiorna(req, res) {
  const { nome_stagione, data_inizio, data_fine, prezzo_notte } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tariffe
       SET nome_stagione = COALESCE($2, nome_stagione),
           data_inizio   = COALESCE($3, data_inizio),
           data_fine     = COALESCE($4, data_fine),
           prezzo_notte  = COALESCE($5, prezzo_notte),
           updated_at    = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome_stagione || null, data_inizio || null, data_fine || null, prezzo_notte || null]
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

module.exports = { lista, calcola, crea, aggiorna, elimina };
