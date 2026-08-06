// Controller categorie camera (tipi_camera) — Modulo 2.2, Fase 2A.
// Anagrafica delle categorie usate sia per il listino tariffe sia, in
// futuro, per la mappatura con i canali OTA (modulo 2.3 — nel frattempo
// solo il campo `note` per annotazioni manuali). Vedi docs/PRENOTAZIONI_FASE2.md.
// Accessibile in lettura a: admin, titolare, receptionist.
// Scrittura riservata a: admin, titolare (shared/ruoli.js, sezione 'tipi_camera').

const pool = require('../config/db');

// GET /api/tipi-camera — elenco categorie con conteggio camere assegnate
// (utile in UI per capire se una categoria è "in uso" prima di eliminarla).
async function lista(req, res) {
  try {
    const result = await pool.query(`
      SELECT tc.id, tc.nome, tc.capienza_max, tc.note, tc.created_at,
             COUNT(c.id)::INTEGER AS camere_assegnate
      FROM tipi_camera tc
      LEFT JOIN camere c ON c.tipo_camera_id = tc.id
      GROUP BY tc.id
      ORDER BY tc.nome
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('lista tipi_camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tipi-camera — crea categoria
async function crea(req, res) {
  const { nome, capienza_max, note } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: 'Il nome della categoria è obbligatorio.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tipi_camera (nome, capienza_max, note) VALUES ($1, $2, $3) RETURNING *`,
      [nome.trim(), capienza_max || null, note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esiste già una categoria con questo nome.' });
    }
    console.error('crea tipo_camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/tipi-camera/:id — modifica categoria (nome/capienza/note)
async function aggiorna(req, res) {
  const { nome, capienza_max, note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tipi_camera
       SET nome = COALESCE($2, nome),
           capienza_max = $3,
           note = $4
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome?.trim() || null, capienza_max ?? null, note ?? null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Categoria non trovata.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esiste già una categoria con questo nome.' });
    }
    console.error('aggiorna tipo_camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// DELETE /api/tipi-camera/:id — elimina categoria, bloccata se camere o
// tariffe la referenziano ancora (FK RESTRICT di default su Postgres).
async function elimina(req, res) {
  try {
    const result = await pool.query('DELETE FROM tipi_camera WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Categoria non trovata.' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Non puoi eliminare questa categoria: è collegata a camere o tariffe esistenti.' });
    }
    console.error('elimina tipo_camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, crea, aggiorna, elimina };
