// Controller Tariffe derivate (Modulo tariffe derivate, 20/08/2026) —
// gestisce le tre tabelle nuove della migration 051: regole_derivazione_tariffe
// (percentuale + range dichiarato per i tipi camera derivati, per periodo),
// supplementi_trattamento (mezza pensione/pensione completa, a persona, per
// categoria+periodo) e configurazione_bambini (sconto fisso 3-11 anni sul
// supplemento trattamento). Lettura/scrittura: stessa azione 'tariffe' di
// tariffeController.js — è la stessa decisione di prezzo.
//
// Il vincolo min/max dichiarato alla Regione (Sezione 7 CLAUDE.md — mai
// superabile) è applicato in fase di CALCOLO (tariffeController.calcolaTariffa,
// clamp automatico + avviso), non qui in scrittura: un titolare deve poter
// salvare una percentuale anche se produce temporaneamente un numero fuori
// range per una notte (es. sta ancora configurando i periodi) senza essere
// bloccato — il clamp a runtime garantisce che non venga mai VENDUTO un
// prezzo fuori range, che è la garanzia che conta davvero.

const pool = require('../config/db');

// ---------------------------------------------------------------------
// Regole di derivazione (Singola/Doppia uso singola/Tripla/Quadrupla da
// Matrimoniale, con percentuale + range per periodo)
// ---------------------------------------------------------------------

// GET /api/tariffe/derivazione?tipo_camera_id=
async function listaDerivazioni(req, res) {
  const { tipo_camera_id } = req.query;
  try {
    const params = [];
    let query = `
      SELECT rd.id, rd.tipo_camera_id, tc.nome AS tipo_camera_nome,
             rd.tipo_camera_base_id, tcb.nome AS tipo_camera_base_nome,
             rd.periodo_id, per.nome AS periodo_nome,
             rd.percentuale, rd.prezzo_minimo, rd.prezzo_massimo,
             rd.created_at, rd.updated_at
      FROM regole_derivazione_tariffe rd
      JOIN tipi_camera tc  ON tc.id  = rd.tipo_camera_id
      JOIN tipi_camera tcb ON tcb.id = rd.tipo_camera_base_id
      LEFT JOIN periodi_stagionali per ON per.id = rd.periodo_id
    `;
    if (tipo_camera_id) {
      params.push(tipo_camera_id);
      query += ' WHERE rd.tipo_camera_id = $1';
    }
    query += ' ORDER BY tc.nome, per.data_inizio NULLS FIRST';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('lista derivazioni error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tariffe/derivazione — crea/sostituisce una regola per
// tipo_camera_id+periodo_id (upsert: al massimo una regola per coppia,
// vincolo già a livello DB — qui lo traduciamo in un aggiornamento invece
// di un 409, più comodo per il titolare che sta affinando i periodi).
async function creaDerivazione(req, res) {
  const { tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_minimo, prezzo_massimo } = req.body;
  if (!tipo_camera_id || !tipo_camera_base_id || percentuale === undefined || percentuale === null) {
    return res.status(400).json({ error: 'tipo_camera_id, tipo_camera_base_id e percentuale sono obbligatori.' });
  }
  if (Number(tipo_camera_id) === Number(tipo_camera_base_id)) {
    return res.status(400).json({ error: 'Un tipo camera non può derivare da se stesso.' });
  }
  if (prezzo_minimo != null && prezzo_massimo != null && Number(prezzo_massimo) < Number(prezzo_minimo)) {
    return res.status(400).json({ error: 'prezzo_massimo deve essere maggiore o uguale a prezzo_minimo.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_minimo, prezzo_massimo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tipo_camera_id, periodo_id) WHERE periodo_id IS NOT NULL
         DO UPDATE SET tipo_camera_base_id = EXCLUDED.tipo_camera_base_id,
                        percentuale = EXCLUDED.percentuale,
                        prezzo_minimo = EXCLUDED.prezzo_minimo,
                        prezzo_massimo = EXCLUDED.prezzo_massimo,
                        updated_at = now()
       RETURNING *`,
      [tipo_camera_id, tipo_camera_base_id, periodo_id || null, percentuale, prezzo_minimo ?? null, prezzo_massimo ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // Caso periodo_id NULL: l'indice parziale di fallback non è coperto
      // dall'ON CONFLICT sopra (Postgres richiede un target esplicito per
      // indice parziale) — upsert manuale in un secondo tentativo.
      if (!req.body.periodo_id) {
        try {
          const result = await pool.query(
            `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_minimo, prezzo_massimo)
             VALUES ($1, $2, NULL, $3, $4, $5)
             ON CONFLICT (tipo_camera_id) WHERE periodo_id IS NULL
               DO UPDATE SET tipo_camera_base_id = EXCLUDED.tipo_camera_base_id,
                              percentuale = EXCLUDED.percentuale,
                              prezzo_minimo = EXCLUDED.prezzo_minimo,
                              prezzo_massimo = EXCLUDED.prezzo_massimo,
                              updated_at = now()
             RETURNING *`,
            [tipo_camera_id, tipo_camera_base_id, percentuale, prezzo_minimo ?? null, prezzo_massimo ?? null]
          );
          return res.status(201).json(result.rows[0]);
        } catch (err2) {
          console.error('crea derivazione (fallback) error:', err2);
          return res.status(500).json({ error: 'Errore interno' });
        }
      }
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Tipo camera o periodo non valido.' });
    }
    console.error('crea derivazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/tariffe/derivazione/:id
async function aggiornaDerivazione(req, res) {
  const { percentuale, prezzo_minimo, prezzo_massimo, tipo_camera_base_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE regole_derivazione_tariffe
       SET percentuale         = COALESCE($2, percentuale),
           prezzo_minimo       = CASE WHEN $3::boolean THEN prezzo_minimo ELSE $4::numeric END,
           prezzo_massimo      = CASE WHEN $5::boolean THEN prezzo_massimo ELSE $6::numeric END,
           tipo_camera_base_id = COALESCE($7, tipo_camera_base_id),
           updated_at          = now()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id, percentuale ?? null,
        prezzo_minimo === undefined, prezzo_minimo === undefined ? null : prezzo_minimo,
        prezzo_massimo === undefined, prezzo_massimo === undefined ? null : prezzo_massimo,
        tipo_camera_base_id || null,
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Regola di derivazione non trovata.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna derivazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// DELETE /api/tariffe/derivazione/:id
async function eliminaDerivazione(req, res) {
  try {
    const result = await pool.query('DELETE FROM regole_derivazione_tariffe WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Regola di derivazione non trovata.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('elimina derivazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// ---------------------------------------------------------------------
// Supplementi trattamento (mezza pensione/pensione completa, a persona)
// ---------------------------------------------------------------------

// GET /api/tariffe/trattamento?categoria=
async function listaSupplementiTrattamento(req, res) {
  const { categoria } = req.query;
  try {
    const params = [];
    let query = `
      SELECT st.id, st.categoria, st.periodo_id, per.nome AS periodo_nome,
             st.trattamento, st.supplemento_a_persona, st.created_at, st.updated_at
      FROM supplementi_trattamento st
      LEFT JOIN periodi_stagionali per ON per.id = st.periodo_id
    `;
    if (categoria) {
      params.push(categoria);
      query += ' WHERE st.categoria = $1';
    }
    query += ' ORDER BY st.categoria, st.trattamento, per.data_inizio NULLS FIRST';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('lista supplementi trattamento error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tariffe/trattamento — upsert per categoria+periodo_id+trattamento,
// stesso principio di creaDerivazione sopra.
async function creaSupplementoTrattamento(req, res) {
  const { categoria, periodo_id, trattamento, supplemento_a_persona } = req.body;
  if (!categoria || !trattamento || supplemento_a_persona === undefined || supplemento_a_persona === null) {
    return res.status(400).json({ error: 'categoria, trattamento e supplemento_a_persona sono obbligatori.' });
  }
  if (!['singola', 'doppia'].includes(categoria)) {
    return res.status(400).json({ error: "categoria deve essere 'singola' o 'doppia'." });
  }
  if (!['mezza_pensione', 'pensione_completa'].includes(trattamento)) {
    return res.status(400).json({ error: "trattamento deve essere 'mezza_pensione' o 'pensione_completa'." });
  }
  if (Number(supplemento_a_persona) < 0) {
    return res.status(400).json({ error: 'supplemento_a_persona non può essere negativo.' });
  }
  try {
    let result;
    if (periodo_id) {
      result = await pool.query(
        `INSERT INTO supplementi_trattamento (categoria, periodo_id, trattamento, supplemento_a_persona)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (categoria, periodo_id, trattamento) WHERE periodo_id IS NOT NULL
           DO UPDATE SET supplemento_a_persona = EXCLUDED.supplemento_a_persona, updated_at = now()
         RETURNING *`,
        [categoria, periodo_id, trattamento, supplemento_a_persona]
      );
    } else {
      result = await pool.query(
        `INSERT INTO supplementi_trattamento (categoria, periodo_id, trattamento, supplemento_a_persona)
         VALUES ($1, NULL, $2, $3)
         ON CONFLICT (categoria, trattamento) WHERE periodo_id IS NULL
           DO UPDATE SET supplemento_a_persona = EXCLUDED.supplemento_a_persona, updated_at = now()
         RETURNING *`,
        [categoria, trattamento, supplemento_a_persona]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Periodo non valido.' });
    }
    console.error('crea supplemento trattamento error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// DELETE /api/tariffe/trattamento/:id
async function eliminaSupplementoTrattamento(req, res) {
  try {
    const result = await pool.query('DELETE FROM supplementi_trattamento WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Supplemento trattamento non trovato.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('elimina supplemento trattamento error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// ---------------------------------------------------------------------
// Configurazione bambini (sconto fisso 3-11 anni, riga singola)
// ---------------------------------------------------------------------

// GET /api/tariffe/configurazione-bambini
async function getConfigurazioneBambini(req, res) {
  try {
    const result = await pool.query(
      `SELECT sconto_mezza_pensione_percentuale, note, updated_at FROM configurazione_bambini WHERE id = 1`
    );
    res.json(result.rows[0] || { sconto_mezza_pensione_percentuale: 0, note: null });
  } catch (err) {
    console.error('get configurazione bambini error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/tariffe/configurazione-bambini
async function aggiornaConfigurazioneBambini(req, res) {
  const { sconto_mezza_pensione_percentuale, note } = req.body;
  if (sconto_mezza_pensione_percentuale === undefined || sconto_mezza_pensione_percentuale === null) {
    return res.status(400).json({ error: 'sconto_mezza_pensione_percentuale è obbligatorio.' });
  }
  if (Number(sconto_mezza_pensione_percentuale) < 0 || Number(sconto_mezza_pensione_percentuale) > 100) {
    return res.status(400).json({ error: 'sconto_mezza_pensione_percentuale deve essere tra 0 e 100.' });
  }
  try {
    const result = await pool.query(
      `UPDATE configurazione_bambini
       SET sconto_mezza_pensione_percentuale = $1, note = $2, updated_at = now()
       WHERE id = 1
       RETURNING sconto_mezza_pensione_percentuale, note, updated_at`,
      [sconto_mezza_pensione_percentuale, note || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna configurazione bambini error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = {
  listaDerivazioni, creaDerivazione, aggiornaDerivazione, eliminaDerivazione,
  listaSupplementiTrattamento, creaSupplementoTrattamento, eliminaSupplementoTrattamento,
  getConfigurazioneBambini, aggiornaConfigurazioneBambini,
};
