// Controller scadenze dipendenti — visita medica, corsi, documenti in scadenza.
// Alert visivi nella dashboard quando mancano meno di giorni_alert giorni.

const pool = require('../config/db');

// GET /api/hr/scadenze — lista scadenze (solo titolare)
async function lista(req, res) {
  try {
    const result = await pool.query(`
      SELECT s.*, u.nome, u.cognome,
             (s.data_scadenza::date - CURRENT_DATE) AS giorni_mancanti
      FROM scadenze s JOIN users u ON u.id = s.user_id
      ORDER BY s.data_scadenza ASC
    `);
    res.json({ scadenze: result.rows });
  } catch (err) {
    console.error('Errore lista scadenze:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/hr/scadenze/alert — scadenze imminenti per la dashboard
async function alert(req, res) {
  try {
    const result = await pool.query(`
      SELECT s.*, u.nome, u.cognome,
             (s.data_scadenza::date - CURRENT_DATE) AS giorni_mancanti
      FROM scadenze s JOIN users u ON u.id = s.user_id
      WHERE (s.data_scadenza::date - CURRENT_DATE) <= s.giorni_alert
        AND s.data_scadenza >= CURRENT_DATE
      ORDER BY s.data_scadenza ASC
      LIMIT 10
    `);
    res.json({ alert: result.rows });
  } catch (err) {
    console.error('Errore alert scadenze:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/hr/scadenze
async function crea(req, res) {
  const { user_id, tipo, data_scadenza, giorni_alert, note } = req.body;
  if (!user_id || !tipo || !data_scadenza) {
    return res.status(400).json({ errore: 'user_id, tipo e data_scadenza sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO scadenze (user_id, tipo, data_scadenza, giorni_alert, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, tipo, data_scadenza, giorni_alert || 30, note || null]
    );
    res.status(201).json({ scadenza: result.rows[0] });
  } catch (err) {
    console.error('Errore crea scadenza:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PUT /api/hr/scadenze/:id
async function modifica(req, res) {
  const { id } = req.params;
  const { tipo, data_scadenza, giorni_alert, note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE scadenze SET tipo=$1, data_scadenza=$2, giorni_alert=$3, note=$4
       WHERE id=$5 RETURNING *`,
      [tipo, data_scadenza, giorni_alert || 30, note || null, id]
    );
    res.json({ scadenza: result.rows[0] });
  } catch (err) {
    console.error('Errore modifica scadenza:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/hr/scadenze/:id
async function elimina(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM scadenze WHERE id = $1', [id]);
    res.json({ messaggio: 'Scadenza eliminata.' });
  } catch (err) {
    console.error('Errore elimina scadenza:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, alert, crea, modifica, elimina };
