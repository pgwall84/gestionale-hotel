// Controller Gruppi di prenotazione (Fase 2, modulo Prenotazioni Sezione 6 del
// contratto API). Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md Sezione 1c e
// docs/API_PRENOTAZIONI_FASE2.md Sezione 6.
//
// Le singole prenotazioni del gruppo si creano con POST /api/prenotazioni
// passando gruppo_id nel body (nessun endpoint dedicato qui, vedi contratto).

const pool = require('../config/db');

// GET /api/gruppi/:id — dettaglio gruppo + prenotazioni collegate (con
// soggiorni nidificati) + totale addebiti e totale pagamenti aggregati.
// I due totali restano distinti nella risposta (non un saldo netto già
// calcolato) — la decisione di come presentarli è del frontend.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function dettaglio(req, res) {
  try {
    const gruppo = await pool.query(
      'SELECT * FROM gruppi_prenotazione WHERE id = $1',
      [req.params.id]
    );
    if (!gruppo.rows.length) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }

    const prenotazioniResult = await pool.query(
      `SELECT id, canale_origine, external_booking_id, stato, note, created_at, updated_at
       FROM prenotazioni
       WHERE gruppo_id = $1
       ORDER BY created_at`,
      [req.params.id]
    );
    const prenotazioneIds = prenotazioniResult.rows.map(p => p.id);

    const soggiorniResult = prenotazioneIds.length
      ? await pool.query(
          `SELECT s.id, s.prenotazione_id, s.camera_id, c.numero AS camera_numero, c.nome AS camera_nome,
                  s.data_arrivo, s.data_partenza, s.num_ospiti, s.tariffa_totale, s.cancellato,
                  o.id AS ospite_id, o.nome AS ospite_nome, o.cognome AS ospite_cognome
           FROM soggiorni s
           JOIN camere c ON c.id = s.camera_id
           JOIN ospiti o ON o.id = s.ospite_id
           WHERE s.prenotazione_id = ANY($1::int[])
           ORDER BY s.data_arrivo`,
          [prenotazioneIds]
        )
      : { rows: [] };

    const prenotazioni = prenotazioniResult.rows.map(p => ({
      ...p,
      soggiorni: soggiorniResult.rows.filter(s => s.prenotazione_id === p.id),
    }));

    // Totale addebiti: somma tariffa_totale dei soggiorni non cancellati di
    // tutte le prenotazioni del gruppo (un soggiorno cancellato non è più un
    // addebito reale, coerente con come /prenotazioni/griglia esclude
    // cancellato=true dalla vista attiva).
    const addebiti = await pool.query(
      `SELECT COALESCE(SUM(s.tariffa_totale), 0) AS totale
       FROM prenotazioni p
       JOIN soggiorni s ON s.prenotazione_id = p.id
       WHERE p.gruppo_id = $1 AND s.cancellato = false`,
      [req.params.id]
    );

    // Totale pagamenti: somma importo dei pagamenti registrati direttamente
    // sul gruppo (pagamenti.gruppo_id) — non quelli delle singole prenotazioni.
    const pagamenti = await pool.query(
      'SELECT COALESCE(SUM(importo), 0) AS totale FROM pagamenti WHERE gruppo_id = $1',
      [req.params.id]
    );

    res.json({
      ...gruppo.rows[0],
      prenotazioni,
      totale_addebiti: addebiti.rows[0].totale,
      totale_pagamenti: pagamenti.rows[0].totale,
    });
  } catch (err) {
    console.error('dettaglio gruppo error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/gruppi — crea un nuovo gruppo di prenotazione.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function crea(req, res) {
  const { nome, referente_nome, referente_email, referente_telefono, note } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'nome è obbligatorio.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO gruppi_prenotazione (nome, referente_nome, referente_email, referente_telefono, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome, referente_nome || null, referente_email || null, referente_telefono || null, note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea gruppo error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/gruppi/:id — aggiorna nome/dati referente.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiorna(req, res) {
  const { nome, referente_nome, referente_email, referente_telefono, note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE gruppi_prenotazione SET
         nome                = COALESCE($1, nome),
         referente_nome      = COALESCE($2, referente_nome),
         referente_email     = COALESCE($3, referente_email),
         referente_telefono  = COALESCE($4, referente_telefono),
         note                = COALESCE($5, note)
       WHERE id = $6
       RETURNING *`,
      [nome || null, referente_nome || null, referente_email || null, referente_telefono || null, note || null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna gruppo error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { dettaglio, crea, aggiorna };
