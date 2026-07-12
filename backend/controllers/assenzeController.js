// Controller richieste assenza — ferie, permessi, malattie.
// Il dipendente crea la richiesta, il titolare la approva o rifiuta.

const pool = require('../config/db');

// GET /api/assenze — lista richieste
// Titolare vede tutte, dipendente solo le sue
async function lista(req, res) {
  try {
    let query = `
      SELECT r.*, u.nome, u.cognome, u.ruolo
      FROM richieste_assenza r JOIN users u ON u.id = r.user_id
    `;
    const params = [];

    if (req.utente.ruolo !== 'titolare') {
      query += ' WHERE r.user_id = $1';
      params.push(req.utente.id);
    }

    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ richieste: result.rows });
  } catch (err) {
    console.error('Errore lista assenze:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/assenze — dipendente crea richiesta
async function crea(req, res) {
  const { tipo, data_inizio, data_fine, note } = req.body;
  if (!tipo || !data_inizio || !data_fine) {
    return res.status(400).json({ errore: 'tipo, data_inizio e data_fine sono obbligatori.' });
  }
  if (!['ferie', 'permesso', 'malattia'].includes(tipo)) {
    return res.status(400).json({ errore: 'Tipo non valido. Valori: ferie, permesso, malattia.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO richieste_assenza (user_id, tipo, data_inizio, data_fine, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.utente.id, tipo, data_inizio, data_fine, note || null]
    );
    res.status(201).json({ richiesta: result.rows[0], messaggio: 'Richiesta inviata con successo.' });
  } catch (err) {
    console.error('Errore crea assenza:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/assenze/:id/stato — titolare approva o rifiuta
async function aggiornaStato(req, res) {
  const { id } = req.params;
  const { stato } = req.body;
  if (!['approvata', 'rifiutata'].includes(stato)) {
    return res.status(400).json({ errore: 'Stato non valido. Valori: approvata, rifiutata.' });
  }
  try {
    const result = await pool.query(
      `UPDATE richieste_assenza SET stato=$1, data_decisione=NOW() WHERE id=$2
       RETURNING *, (SELECT nome || ' ' || cognome FROM users WHERE id = richieste_assenza.user_id) AS dipendente`,
      [stato, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Richiesta non trovata.' });
    res.json({ richiesta: result.rows[0], messaggio: `Richiesta ${stato}.` });
  } catch (err) {
    console.error('Errore aggiorna stato assenza:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, crea, aggiornaStato };
