// Controller Soggiorni + Soggiorno_ospiti (Fase 2, modulo Prenotazioni
// Sezioni 3-4 del contratto API). Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md
// Sezione 3/1b e docs/API_PRENOTAZIONI_FASE2.md Sezione 3-4.
//
// POST /api/prenotazioni/:id/soggiorni (aggiunge un soggiorno multi-camera
// alla stessa prenotazione) resta in prenotazioniController.js perché è
// montato sotto /api/prenotazioni — qui solo gli endpoint sotto /api/soggiorni.

const pool = require('../config/db');
const { DOC_MASCHERATO } = require('./anagraficaOspitiController');
const { gestisciConflittoCamera } = require('../utils/erroriDb');

// Tipi che identificano l'intestatario del soggiorno (Codice Tabella
// Tipo_Alloggiato: singolo/capofamiglia/capogruppo). Ogni soggiorno deve
// averne esattamente uno in ogni momento — vincolo applicativo, non CHECK DB
// (SCHEMA_PRENOTAZIONI_FASE2.md Sezione 1b).
const TIPI_INTESTATARIO = ['16', '17', '18'];

// PATCH /api/soggiorni/:id — modifica camera_id/date/tariffa. È l'endpoint
// che il drag-and-drop della griglia planning chiama per spostare una
// prenotazione. Può restituire 409 per lo stesso vincolo anti-overbooking
// di POST /api/prenotazioni (stesso helper condiviso).
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiorna(req, res) {
  const { camera_id, data_arrivo, data_partenza, tariffa_totale } = req.body;
  if (data_arrivo && data_partenza && data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }

  try {
    const result = await pool.query(
      `UPDATE soggiorni SET
         camera_id      = COALESCE($1, camera_id),
         data_arrivo    = COALESCE($2, data_arrivo),
         data_partenza  = COALESCE($3, data_partenza),
         tariffa_totale = COALESCE($4, tariffa_totale),
         updated_at     = NOW()
       WHERE id = $5
       RETURNING *`,
      [camera_id || null, data_arrivo || null, data_partenza || null, tariffa_totale ?? null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Soggiorno non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (gestisciConflittoCamera(err, res)) return;
    console.error('aggiorna soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/soggiorni/:id/ospiti — lista componenti gruppo/famiglia.
// Ordinata per tipo_alloggiato: capofamiglia/singolo/capogruppo (16/17/18)
// prima dei familiari/membri gruppo (19/20) — stesso ordine richiesto per
// generare la schedina Alloggiati Web (SCHEMA_PRENOTAZIONI_FASE2.md, note
// implementative modulo 2.5).
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function listaOspiti(req, res) {
  try {
    const result = await pool.query(
      `SELECT so.id, so.soggiorno_id, so.tipo_alloggiato, so.created_at,
              o.id AS ospite_id, o.nome, o.cognome, ${DOC_MASCHERATO}
       FROM soggiorno_ospiti so
       JOIN ospiti o ON o.id = so.ospite_id
       WHERE so.soggiorno_id = $1
       ORDER BY so.tipo_alloggiato ASC, so.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista ospiti soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/soggiorni/:id/ospiti — aggiunge un ospite al soggiorno.
// Body: { ospite_id, tipo_alloggiato }. Se tipo_alloggiato è capofamiglia/
// singolo/capogruppo (16/17/18) e ce n'è già uno per questo soggiorno → 400
// (vincolo applicativo, non CHECK DB). Il conteggio avviene con FOR UPDATE
// dentro la transazione, prima dell'INSERT, per evitare la race condition
// di due richieste concorrenti che aggiungono entrambe un capofamiglia.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiungiOspite(req, res) {
  const { ospite_id, tipo_alloggiato } = req.body;
  const soggiornoId = req.params.id;

  if (!ospite_id || !tipo_alloggiato) {
    return res.status(400).json({ error: 'ospite_id e tipo_alloggiato sono obbligatori.' });
  }
  if (!['16', '17', '18', '19', '20'].includes(tipo_alloggiato)) {
    return res.status(400).json({ error: "tipo_alloggiato deve essere uno tra '16','17','18','19','20'." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (TIPI_INTESTATARIO.includes(tipo_alloggiato)) {
      const esistente = await client.query(
        `SELECT id FROM soggiorno_ospiti
         WHERE soggiorno_id = $1 AND tipo_alloggiato IN ('16','17','18')
         FOR UPDATE`,
        [soggiornoId]
      );
      if (esistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Il soggiorno ha già un capofamiglia/singolo/capogruppo.' });
      }
    }

    const result = await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [soggiornoId, ospite_id, tipo_alloggiato]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('aggiungi ospite soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// DELETE /api/soggiorni/:id/ospiti/:ospiteId — rimuove un ospite dal
// soggiorno. Se è l'unico capofamiglia/singolo/capogruppo rimasto → 400
// (non si può lasciare un soggiorno senza intestatario). Il conteggio degli
// intestatari avviene con FOR UPDATE PRIMA della DELETE, non dopo — serve
// sapere se si sta per rimuovere l'ultimo prima di farlo.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function rimuoviOspite(req, res) {
  const { id: soggiornoId, ospiteId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const riga = await client.query(
      `SELECT id, tipo_alloggiato FROM soggiorno_ospiti
       WHERE soggiorno_id = $1 AND ospite_id = $2
       FOR UPDATE`,
      [soggiornoId, ospiteId]
    );
    if (!riga.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ospite non trovato in questo soggiorno' });
    }

    if (TIPI_INTESTATARIO.includes(riga.rows[0].tipo_alloggiato)) {
      const intestatari = await client.query(
        `SELECT id FROM soggiorno_ospiti
         WHERE soggiorno_id = $1 AND tipo_alloggiato IN ('16','17','18')
         FOR UPDATE`,
        [soggiornoId]
      );
      if (intestatari.rows.length <= 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "Non si può rimuovere l'unico intestatario del soggiorno." });
      }
    }

    await client.query('DELETE FROM soggiorno_ospiti WHERE id = $1', [riga.rows[0].id]);

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('rimuovi ospite soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

module.exports = { aggiorna, listaOspiti, aggiungiOspite, rimuoviOspite };
