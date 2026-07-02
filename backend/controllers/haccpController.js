// Controller checklist HACCP — pulizie e controlli igienici giornalieri.
// Compilata dal cuoco ogni giorno. Lo storico è disponibile per ispezioni ASL.

const pool = require('../config/db');

// Attrezzature standard da controllare ogni giorno
const ATTREZZATURE_DEFAULT = [
  'Frigorifero cucina',
  'Frigorifero bar',
  'Abbattitore',
  'Piano cottura',
  'Forno',
  'Lavello cucina',
  'Superfici di lavoro',
  'Cella frigorifera',
  'Lavastoviglie',
  'Zona rifiuti',
];

// GET /api/haccp?data=2026-06-28 — checklist del giorno
async function lista(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT h.*, u.nome, u.cognome
       FROM haccp_checklist h LEFT JOIN users u ON u.id = h.user_id
       WHERE h.data = $1 ORDER BY h.attrezzatura`,
      [data]
    );

    // Se non ci sono voci per oggi, ritorna la lista default non compilata
    // Il frontend la mostrerà come checklist vuota da compilare
    if (result.rows.length === 0) {
      const vuote = ATTREZZATURE_DEFAULT.map(a => ({
        attrezzatura: a, completata: false, data, note: null, user_id: null,
      }));
      return res.json({ checklist: vuote, esistente: false });
    }

    res.json({ checklist: result.rows, esistente: true });
  } catch (err) {
    console.error('Errore lista HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/haccp — salva/aggiorna l'intera checklist del giorno
// Riceve un array di { attrezzatura, completata, note }
async function salva(req, res) {
  const { data, voci } = req.body;
  const dataChecklist = data || new Date().toISOString().split('T')[0];

  if (!Array.isArray(voci) || voci.length === 0) {
    return res.status(400).json({ errore: 'Voci checklist obbligatorie.' });
  }

  try {
    // Elimina le voci esistenti per il giorno e le reinserisce
    // (più semplice che fare upsert su ogni riga)
    await pool.query('DELETE FROM haccp_checklist WHERE data = $1', [dataChecklist]);

    for (const voce of voci) {
      await pool.query(
        `INSERT INTO haccp_checklist (attrezzatura, user_id, data, completata, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [voce.attrezzatura, req.utente.id, dataChecklist, voce.completata || false, voce.note || null]
      );
    }

    res.json({ messaggio: 'Checklist HACCP salvata con successo.' });
  } catch (err) {
    console.error('Errore salva HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/haccp/storico?da=2026-06-01&a=2026-06-30 — storico per ASL
async function storico(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(`
      SELECT h.data, h.attrezzatura, h.completata, h.note, u.nome, u.cognome
      FROM haccp_checklist h LEFT JOIN users u ON u.id = h.user_id
      WHERE h.data BETWEEN $1 AND $2
      ORDER BY h.data DESC, h.attrezzatura
    `, [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]);
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, salva, storico };
