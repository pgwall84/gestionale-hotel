// Controller ospiti giornalieri — note cucina inserite dal receptionist ogni sera.
// Contiene: coperti colazione/pranzo/cena e allergie ospiti hotel.
// Visibile in cucina come promemoria giornaliero.

const pool = require('../config/db');

// GET /api/ospiti?data=2026-06-28
async function get(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      'SELECT * FROM ospiti_giornalieri WHERE data = $1',
      [data]
    );
    // Se non c'è ancora il record per oggi ritorna valori a zero
    res.json({
      ospiti: result.rows[0] || {
        data, coperti_colazione: 0, coperti_pranzo: 0, coperti_cena: 0, note_allergie: '',
      },
    });
  } catch (err) {
    console.error('Errore get ospiti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ospiti — inserisce o aggiorna il record del giorno (upsert)
async function salva(req, res) {
  const { data, coperti_colazione, coperti_pranzo, coperti_cena, note_allergie } = req.body;
  const dataRecord = data || new Date().toISOString().split('T')[0];

  try {
    // ON CONFLICT: se esiste già il record per quella data, lo aggiorna
    const result = await pool.query(`
      INSERT INTO ospiti_giornalieri (data, coperti_colazione, coperti_pranzo, coperti_cena, note_allergie, inserito_da, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (data) DO UPDATE SET
        coperti_colazione = EXCLUDED.coperti_colazione,
        coperti_pranzo    = EXCLUDED.coperti_pranzo,
        coperti_cena      = EXCLUDED.coperti_cena,
        note_allergie     = EXCLUDED.note_allergie,
        inserito_da       = EXCLUDED.inserito_da,
        updated_at        = NOW()
      RETURNING *
    `, [dataRecord, coperti_colazione || 0, coperti_pranzo || 0, coperti_cena || 0, note_allergie || null, req.utente.id]);

    res.json({ ospiti: result.rows[0], messaggio: 'Note cucina salvate.' });
  } catch (err) {
    console.error('Errore salva ospiti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { get, salva };
