const pool = require('../config/db');

// GET /api/hr/turni-standard
async function lista(req, res) {
  try {
    const r = await pool.query(`
      SELECT ts.*, u.nome, u.cognome, u.ruolo
      FROM turni_standard ts JOIN users u ON u.id = ts.user_id
      WHERE u.attivo = true ORDER BY u.cognome, u.nome
    `);
    res.json({ turniStandard: r.rows });
  } catch (err) {
    console.error('Errore lista turni standard:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/hr/turni-standard — upsert turno standard per un dipendente
async function salva(req, res) {
  const { user_id, tipo_turno, ora_inizio, ora_fine, note } = req.body;
  if (!user_id || !tipo_turno) {
    return res.status(400).json({ errore: 'user_id e tipo_turno sono obbligatori.' });
  }
  const isRiposo = tipo_turno === 'riposo';
  try {
    const r = await pool.query(`
      INSERT INTO turni_standard (user_id, tipo_turno, ora_inizio, ora_fine, note, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        tipo_turno = EXCLUDED.tipo_turno,
        ora_inizio = EXCLUDED.ora_inizio,
        ora_fine   = EXCLUDED.ora_fine,
        note       = EXCLUDED.note,
        updated_at = NOW()
      RETURNING *
    `, [user_id, tipo_turno, isRiposo ? null : (ora_inizio || null), isRiposo ? null : (ora_fine || null), note || null]);
    res.json({ turnoStandard: r.rows[0] });
  } catch (err) {
    console.error('Errore salva turno standard:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/hr/turni-standard/:user_id
async function elimina(req, res) {
  try {
    await pool.query('DELETE FROM turni_standard WHERE user_id = $1', [req.params.user_id]);
    res.json({ messaggio: 'Turno standard rimosso.' });
  } catch (err) {
    console.error('Errore elimina turno standard:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, salva, elimina };
