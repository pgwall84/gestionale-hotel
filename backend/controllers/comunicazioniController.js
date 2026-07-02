// Controller comunicazioni interne — bacheca aziendale.
// Il titolare pubblica, i dipendenti leggono.
// ruoli_destinatari = null significa visibile a tutti.

const pool = require('../config/db');

// GET /api/comunicazioni — lista comunicazioni visibili all'utente corrente
async function lista(req, res) {
  try {
    const result = await pool.query(`
      SELECT c.*, u.nome AS autore_nome, u.cognome AS autore_cognome
      FROM comunicazioni c JOIN users u ON u.id = c.autore_id
      WHERE c.ruoli_destinatari IS NULL
         OR $1 = ANY(c.ruoli_destinatari)
      ORDER BY c.created_at DESC
    `, [req.utente.ruolo]);
    res.json({ comunicazioni: result.rows });
  } catch (err) {
    console.error('Errore lista comunicazioni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/comunicazioni — pubblica comunicazione (solo titolare)
async function crea(req, res) {
  const { titolo, testo, ruoli_destinatari } = req.body;
  if (!titolo || !testo) {
    return res.status(400).json({ errore: 'Titolo e testo sono obbligatori.' });
  }
  try {
    // ruoli_destinatari può essere un array di ruoli o null (= tutti)
    const destinatari = Array.isArray(ruoli_destinatari) && ruoli_destinatari.length > 0
      ? ruoli_destinatari
      : null;

    const result = await pool.query(
      `INSERT INTO comunicazioni (titolo, testo, autore_id, ruoli_destinatari)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [titolo, testo, req.utente.id, destinatari]
    );
    res.status(201).json({ comunicazione: result.rows[0], messaggio: 'Comunicazione pubblicata.' });
  } catch (err) {
    console.error('Errore crea comunicazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/comunicazioni/:id — elimina (solo titolare)
async function elimina(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM comunicazioni WHERE id = $1', [id]);
    res.json({ messaggio: 'Comunicazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina comunicazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, crea, elimina };
