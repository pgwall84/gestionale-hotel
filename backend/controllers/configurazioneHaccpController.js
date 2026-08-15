// Controller Impostazioni HACCP — anagrafica apparecchiature (condivisa tra
// A.2 registro temperature e A.6 manutenzioni programmate) + on/off dei
// moduli "in forse" (A.4 buffet, A.6 manutenzioni). Modulo 6.1, ricostruzione
// 16/08/2026. Riservato admin/titolare (soloTitolare), stesso livello delle
// altre pagine /impostazioni/*.

const pool = require('../config/db');

// ─── Apparecchiature ────────────────────────────────────────────────────────

// GET /api/impostazioni/haccp/apparecchiature?solo_attive=true
async function listaApparecchiature(req, res) {
  const soloAttive = req.query.solo_attive === 'true';
  try {
    const result = await pool.query(
      `SELECT * FROM apparecchiature_haccp
       ${soloAttive ? 'WHERE attivo = true' : ''}
       ORDER BY tipo, nome`
    );
    res.json({ apparecchiature: result.rows });
  } catch (err) {
    console.error('Errore lista apparecchiature HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

const TIPI_VALIDI = ['frigo', 'freezer', 'abbattitore', 'cappa', 'piano_cottura', 'forno', 'lavastoviglie', 'zona_rifiuti', 'altro'];

// POST /api/impostazioni/haccp/apparecchiature
async function creaApparecchiatura(req, res) {
  const { nome, tipo, ubicazione } = req.body;
  if (!nome?.trim() || !TIPI_VALIDI.includes(tipo)) {
    return res.status(400).json({ errore: `nome obbligatorio, tipo deve essere uno tra: ${TIPI_VALIDI.join(', ')}.` });
  }
  try {
    const result = await pool.query(
      `INSERT INTO apparecchiature_haccp (nome, tipo, ubicazione) VALUES ($1, $2, $3) RETURNING *`,
      [nome.trim(), tipo, ubicazione || null]
    );
    res.status(201).json({ apparecchiatura: result.rows[0] });
  } catch (err) {
    console.error('Errore crea apparecchiatura HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PUT /api/impostazioni/haccp/apparecchiature/:id — modifica dati o
// attivo/disattivo. Niente DELETE fisica: le letture già registrate hanno
// una FK verso questa riga (stesso principio già in uso per prodotti/
// fornitori nel magazzino, modulo 1.7 — "attivo" invece di cancellare).
async function modificaApparecchiatura(req, res) {
  const { id } = req.params;
  const { nome, tipo, ubicazione, attivo } = req.body;
  if (tipo !== undefined && !TIPI_VALIDI.includes(tipo)) {
    return res.status(400).json({ errore: `tipo deve essere uno tra: ${TIPI_VALIDI.join(', ')}.` });
  }
  try {
    const result = await pool.query(
      `UPDATE apparecchiature_haccp SET
         nome = COALESCE($1, nome),
         tipo = COALESCE($2, tipo),
         ubicazione = COALESCE($3, ubicazione),
         attivo = COALESCE($4, attivo)
       WHERE id = $5 RETURNING *`,
      [nome || null, tipo || null, ubicazione ?? null, attivo ?? null, id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ errore: 'Apparecchiatura non trovata.' });
    }
    res.json({ apparecchiatura: result.rows[0] });
  } catch (err) {
    console.error('Errore modifica apparecchiatura HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── Configurazione moduli (A.4 buffet, A.6 manutenzioni) ──────────────────

// GET /api/impostazioni/haccp/moduli
async function listaModuli(req, res) {
  try {
    const result = await pool.query('SELECT * FROM configurazione_moduli_haccp ORDER BY modulo');
    res.json({ moduli: result.rows });
  } catch (err) {
    console.error('Errore lista moduli HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PUT /api/impostazioni/haccp/moduli/:modulo — { attivo: true/false }
async function modificaModulo(req, res) {
  const { modulo } = req.params;
  const { attivo } = req.body;
  if (typeof attivo !== 'boolean') {
    return res.status(400).json({ errore: 'attivo (booleano) obbligatorio.' });
  }
  try {
    const result = await pool.query(
      `UPDATE configurazione_moduli_haccp
       SET attivo = $1, aggiornato_da = $2, aggiornato_il = NOW()
       WHERE modulo = $3 RETURNING *`,
      [attivo, req.utente.id, modulo]
    );
    if (!result.rows.length) {
      return res.status(404).json({ errore: 'Modulo non trovato.' });
    }
    res.json({ modulo: result.rows[0] });
  } catch (err) {
    console.error('Errore modifica modulo HACCP:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// Helper interno riusato da altri controller (es. registro-haccp/page per
// nascondere i tab A.4/A.6 se spenti) — non passa da HTTP.
async function moduloAttivo(nomeModulo) {
  const result = await pool.query('SELECT attivo FROM configurazione_moduli_haccp WHERE modulo = $1', [nomeModulo]);
  return result.rows[0]?.attivo ?? true; // se non configurato, non blocca per errore di scrittura mancante
}

module.exports = {
  listaApparecchiature, creaApparecchiatura, modificaApparecchiatura,
  listaModuli, modificaModulo, moduloAttivo,
};
