// Controller pacchetti — prezzo fisso indipendente dal calcolo per notte
// (es. "Weekend Relax 2 notti" a 250€ tutto compreso). Modulo 2.2, Fase 2A.
// Lettura: admin, titolare, receptionist. Scrittura: admin, titolare
// (shared/ruoli.js, sezione 'pacchetti').
// Nessun DELETE fisico: un soggiorno passato può referenziare ancora un
// pacchetto non più in vendita — la "eliminazione" dalla UI disattiva
// soltanto (PATCH con attivo: false).

const pool = require('../config/db');

// GET /api/pacchetti?attivo=true — elenco pacchetti, filtro opzionale su attivo
async function lista(req, res) {
  const { attivo } = req.query;
  try {
    const params = [];
    let query = 'SELECT * FROM pacchetti';
    if (attivo !== undefined) {
      params.push(attivo === 'true');
      query += ' WHERE attivo = $1';
    }
    query += ' ORDER BY nome';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('lista pacchetti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/pacchetti — crea pacchetto
async function crea(req, res) {
  const { nome, descrizione, num_notti, prezzo_totale } = req.body;
  if (!nome || !nome.trim() || !num_notti || !prezzo_totale) {
    return res.status(400).json({ error: 'nome, num_notti e prezzo_totale sono obbligatori.' });
  }
  if (Number(num_notti) <= 0 || Number(prezzo_totale) <= 0) {
    return res.status(400).json({ error: 'num_notti e prezzo_totale devono essere maggiori di zero.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO pacchetti (nome, descrizione, num_notti, prezzo_totale)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nome.trim(), descrizione || null, num_notti, prezzo_totale]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea pacchetto error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/pacchetti/:id — modifica pacchetto (include il toggle attivo/disattivo)
async function aggiorna(req, res) {
  const { nome, descrizione, num_notti, prezzo_totale, attivo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE pacchetti
       SET nome          = COALESCE($2, nome),
           descrizione   = COALESCE($3, descrizione),
           num_notti     = COALESCE($4, num_notti),
           prezzo_totale = COALESCE($5, prezzo_totale),
           attivo        = COALESCE($6, attivo),
           updated_at    = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome?.trim() || null, descrizione ?? null, num_notti || null, prezzo_totale || null, attivo ?? null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Pacchetto non trovato.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna pacchetto error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, crea, aggiorna };
