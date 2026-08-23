// Controller Periodi stagionali (Modulo tariffe derivate, 20/08/2026) —
// /api/periodi-stagionali. Entità di riferimento condivisa (nome + date,
// es. "Alta stagione" luglio-agosto) usata dalla tariffa madre, dalle regole
// di derivazione e dai supplementi trattamento — così il titolare cambia le
// date di un periodo in un solo posto invece che in tre. Numero e confini
// dei periodi sono decisi liberamente dal titolare, nessun valore di default
// imposto dal codice. Lettura/scrittura: stessa azione 'tariffe' già in uso
// per tipi_camera/tariffe (shared/ruoli.js) — è la stessa decisione di
// prezzo, non serve un'azione permesso separata.

const pool = require('../config/db');

// GET /api/periodi-stagionali — elenco periodi, ordinati per data
async function lista(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, nome, data_inizio, data_fine, created_at, updated_at
       FROM periodi_stagionali
       ORDER BY data_inizio`,
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista periodi stagionali error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/periodi-stagionali — crea un periodo
async function crea(req, res) {
  const { nome, data_inizio, data_fine } = req.body;
  if (!nome || !data_inizio || !data_fine) {
    return res.status(400).json({ error: 'nome, data_inizio e data_fine sono obbligatori.' });
  }
  if (data_fine < data_inizio) {
    return res.status(400).json({ error: 'data_fine deve essere successiva o uguale a data_inizio.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO periodi_stagionali (nome, data_inizio, data_fine)
       VALUES ($1, $2, $3) RETURNING *`,
      [nome, data_inizio, data_fine]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') { // exclusion_violation — sovrapposizione date
      return res.status(409).json({ error: 'Le date si sovrappongono a un periodo stagionale già esistente.' });
    }
    console.error('crea periodo stagionale error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/periodi-stagionali/:id — modifica un periodo
async function aggiorna(req, res) {
  const { nome, data_inizio, data_fine } = req.body;
  try {
    const result = await pool.query(
      `UPDATE periodi_stagionali
       SET nome        = COALESCE($2, nome),
           data_inizio = COALESCE($3, data_inizio),
           data_fine   = COALESCE($4, data_fine),
           updated_at  = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome || null, data_inizio || null, data_fine || null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Periodo stagionale non trovato.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Le date si sovrappongono a un periodo stagionale già esistente.' });
    }
    console.error('aggiorna periodo stagionale error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// DELETE /api/periodi-stagionali/:id — elimina un periodo. Blocco esplicito
// se referenziato da tariffe/regole di derivazione/supplementi trattamento:
// eliminarlo "sotto" a quei dati li lascerebbe orfani di stagionalità in
// modo silenzioso — meglio chiedere di scollegare/aggiornare prima.
async function elimina(req, res) {
  const { id } = req.params;
  try {
    const usiResult = await pool.query(
      `SELECT
         (SELECT count(*) FROM tariffe WHERE periodo_id = $1) AS tariffe,
         (SELECT count(*) FROM regole_derivazione_tariffe WHERE periodo_id = $1) AS derivazioni,
         (SELECT count(*) FROM supplementi_trattamento WHERE periodo_id = $1) AS supplementi`,
      [id]
    );
    const usi = usiResult.rows[0];
    const totaleUsi = Number(usi.tariffe) + Number(usi.derivazioni) + Number(usi.supplementi);
    if (totaleUsi > 0) {
      return res.status(409).json({
        error: `Periodo in uso (${usi.tariffe} tariffe, ${usi.derivazioni} regole di derivazione, ${usi.supplementi} supplementi trattamento) — scollegarli prima di eliminarlo.`,
      });
    }
    const result = await pool.query('DELETE FROM periodi_stagionali WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Periodo stagionale non trovato.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('elimina periodo stagionale error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, crea, aggiorna, elimina };
