// Controller Pagamenti (Fase 2, modulo Prenotazioni Sezione 5 del contratto
// API). Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md Sezione 4 per il vincolo CHECK
// XOR (chk_pagamenti_prenotazione_o_gruppo, migration 017).
//
// Un pagamento è sempre legato o a una prenotazione o a un gruppo, mai a
// entrambi né a nessuno dei due: ognuna delle 4 funzioni sotto valorizza SOLO
// il campo giusto in base all'endpoint chiamato, così il controller rispetta
// il vincolo prima ancora che sia il DB a scoprire l'errore.
//
// Pagamenti registrati qui manualmente sono sempre stato='completato' — non
// c'è flusso 'pending' in questo contratto (arriverà con i webhook WuBook,
// modulo 2.3, fuori scope).

const pool = require('../config/db');

function validaPayload(body) {
  const { importo, tipo } = body;
  if (importo === undefined || importo === null || isNaN(importo) || Number(importo) <= 0) {
    return 'importo è obbligatorio e deve essere un numero positivo.';
  }
  if (!tipo) {
    return 'tipo è obbligatorio (es. caparra, saldo, corrispettivo).';
  }
  return null;
}

// GET /api/prenotazioni/:id/pagamenti — lista pagamenti della prenotazione.
// Accessibile a: admin, titolare, receptionist.
async function listaPerPrenotazione(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM pagamenti WHERE prenotazione_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista pagamenti prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/prenotazioni/:id/pagamenti — registra un pagamento manuale legato
// alla prenotazione (prenotazione_id valorizzato, gruppo_id resta NULL).
// Accessibile a: admin, titolare, receptionist.
async function creaPerPrenotazione(req, res) {
  const erroreValidazione = validaPayload(req.body);
  if (erroreValidazione) {
    return res.status(400).json({ error: erroreValidazione });
  }
  const { importo, metodo, tipo } = req.body;
  try {
    const prenotazione = await pool.query('SELECT id FROM prenotazioni WHERE id = $1', [req.params.id]);
    if (!prenotazione.rows.length) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    const result = await pool.query(
      `INSERT INTO pagamenti (prenotazione_id, importo, metodo, tipo, stato)
       VALUES ($1, $2, $3, $4, 'completato')
       RETURNING *`,
      [req.params.id, importo, metodo || null, tipo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea pagamento prenotazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/gruppi/:id/pagamenti — lista pagamenti registrati sul gruppo
// (non spezzati sulle singole prenotazioni).
// Accessibile a: admin, titolare, receptionist.
async function listaPerGruppo(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM pagamenti WHERE gruppo_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista pagamenti gruppo error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/gruppi/:id/pagamenti — registra un pagamento manuale legato al
// gruppo (gruppo_id valorizzato, prenotazione_id resta NULL). Stesso payload
// di creaPerPrenotazione.
// Accessibile a: admin, titolare, receptionist.
async function creaPerGruppo(req, res) {
  const erroreValidazione = validaPayload(req.body);
  if (erroreValidazione) {
    return res.status(400).json({ error: erroreValidazione });
  }
  const { importo, metodo, tipo } = req.body;
  try {
    const gruppo = await pool.query('SELECT id FROM gruppi_prenotazione WHERE id = $1', [req.params.id]);
    if (!gruppo.rows.length) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }

    const result = await pool.query(
      `INSERT INTO pagamenti (gruppo_id, importo, metodo, tipo, stato)
       VALUES ($1, $2, $3, $4, 'completato')
       RETURNING *`,
      [req.params.id, importo, metodo || null, tipo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea pagamento gruppo error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { listaPerPrenotazione, creaPerPrenotazione, listaPerGruppo, creaPerGruppo };
