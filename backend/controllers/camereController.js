// Controller camere — stato giornaliero arrivi/partenze per la cameriera.
// Le camere sono statiche (21 totali); lo stato cambia ogni giorno.

const pool = require('../config/db');

// GET /api/camere?data=2026-06-28
// Ritorna tutte le 21 camere con il loro stato per la data richiesta.
// Se per una camera non esiste ancora un record, viene restituito con arrivo/partenza = false.
async function lista(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.numero, c.nome,
        COALESCE(s.arrivo,   false) AS arrivo,
        COALESCE(s.partenza, false) AS partenza,
        COALESCE(s.pronta,   false) AS pronta,
        s.note,
        s.updated_at
      FROM camere c
      LEFT JOIN stato_camere s ON s.camera_id = c.id AND s.data = $1
      ORDER BY
        CASE WHEN c.numero = 'app' THEN 999
             ELSE CAST(c.numero AS INTEGER) END
    `, [data]);
    res.json({ camere: result.rows, data });
  } catch (err) {
    console.error('Errore lista camere:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/camere/stato — salva arrivo/partenza/note (solo admin/titolare)
async function aggiornaStato(req, res) {
  const { camera_id, data, arrivo, partenza, note } = req.body;
  const dataRecord = data || new Date().toISOString().split('T')[0];
  if (!camera_id) return res.status(400).json({ errore: 'camera_id obbligatorio.' });
  try {
    const result = await pool.query(`
      INSERT INTO stato_camere (camera_id, data, arrivo, partenza, note, aggiornato_da, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (camera_id, data) DO UPDATE SET
        arrivo        = EXCLUDED.arrivo,
        partenza      = EXCLUDED.partenza,
        note          = EXCLUDED.note,
        aggiornato_da = EXCLUDED.aggiornato_da,
        updated_at    = NOW()
      RETURNING *
    `, [camera_id, dataRecord, arrivo ?? false, partenza ?? false, note || null, req.utente.id]);
    res.json({ stato: result.rows[0] });
  } catch (err) {
    console.error('Errore aggiorna stato camera:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/camere/pronta — la cameriera marca una camera come pronta/non pronta
async function segnaPronte(req, res) {
  const { camera_id, data, pronta } = req.body;
  const dataRecord = data || new Date().toISOString().split('T')[0];
  if (!camera_id) return res.status(400).json({ errore: 'camera_id obbligatorio.' });
  try {
    // Crea il record se non esiste, altrimenti aggiorna solo il campo pronta
    await pool.query(`
      INSERT INTO stato_camere (camera_id, data, pronta, aggiornato_da, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (camera_id, data) DO UPDATE SET
        pronta        = EXCLUDED.pronta,
        aggiornato_da = EXCLUDED.aggiornato_da,
        updated_at    = NOW()
    `, [camera_id, dataRecord, pronta ?? true, req.utente.id]);
    res.json({ messaggio: 'Camera aggiornata.' });
  } catch (err) {
    console.error('Errore segna pronta:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/camere/oggi — riepilogo rapido per popup cameriera
// Ritorna solo le camere con arrivo o partenza oggi
async function oggi(req, res) {
  const data = new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(`
      SELECT c.numero, c.nome, s.arrivo, s.partenza, s.pronta, s.note
      FROM stato_camere s
      JOIN camere c ON c.id = s.camera_id
      WHERE s.data = $1 AND (s.arrivo = true OR s.partenza = true)
      ORDER BY
        CASE WHEN c.numero = 'app' THEN 999
             ELSE CAST(c.numero AS INTEGER) END
    `, [data]);
    res.json({ camere: result.rows, data });
  } catch (err) {
    console.error('Errore riepilogo camere oggi:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, aggiornaStato, segnaPronte, oggi };
