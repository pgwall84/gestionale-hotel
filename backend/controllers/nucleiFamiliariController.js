// Controller Nuclei familiari (modulo 5.2 Fase B, estensione richiesta dal
// titolare 04/08/2026): raggruppamento leggero tra clienti — creato
// automaticamente quando la reception applica una richiesta di pre
// check-in con più componenti (preCheckinController.applica), ma gestibile
// anche a mano da /clienti/:id (aggiungere/rimuovere un cliente esistente
// da un nucleo, o cambiarne l'etichetta). Stessi permessi di 'ospiti'
// (shared/ruoli.js sezione 'nuclei_familiari').

const pool = require('../config/db');

// GET /api/nuclei-familiari/:id — dettaglio con i membri collegati.
const dettaglio = async (req, res) => {
  try {
    const nucleo = await pool.query('SELECT id, etichetta, creato_at FROM nuclei_familiari WHERE id = $1', [req.params.id]);
    if (!nucleo.rows.length) {
      return res.status(404).json({ error: 'Nucleo familiare non trovato' });
    }
    const membri = await pool.query('SELECT id, nome, cognome FROM ospiti WHERE nucleo_familiare_id = $1 ORDER BY cognome, nome', [req.params.id]);
    res.json({ ...nucleo.rows[0], membri: membri.rows });
  } catch (err) {
    console.error('dettaglio nucleo familiare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// POST /api/nuclei-familiari — crea un nucleo (etichetta facoltativa).
const crea = async (req, res) => {
  const { etichetta } = req.body;
  try {
    const result = await pool.query('INSERT INTO nuclei_familiari (etichetta) VALUES ($1) RETURNING id, etichetta, creato_at', [etichetta || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea nucleo familiare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// PATCH /api/nuclei-familiari/:id — modifica l'etichetta.
const aggiorna = async (req, res) => {
  const { etichetta } = req.body;
  try {
    const result = await pool.query(
      'UPDATE nuclei_familiari SET etichetta = $1 WHERE id = $2 RETURNING id, etichetta, creato_at',
      [etichetta || null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Nucleo familiare non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna nucleo familiare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { dettaglio, crea, aggiorna };
