// Controller sala — configurazioni sala, tavoli, etichette prenotazione.
// Gestisce i layout della sala, la posizione dei tavoli, lo stato occupazione
// e l'associazione prenotazione→tavolo per il servizio serale.
// Accessibile a: titolare/admin per modifiche, tutti i ruoli operativi per lettura.

const pool = require('../config/db');

// ── Configurazioni sala ───────────────────────────────────────────────────────

async function listaConfig(req, res) {
  try {
    const r = await pool.query(
      'SELECT id, nome, attiva, is_default FROM configurazioni_sala ORDER BY is_default DESC, id'
    );
    res.json({ configurazioni: r.rows });
  } catch (err) {
    console.error('listaConfig error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function creaConfig(req, res) {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ errore: 'Nome configurazione obbligatorio.' });
  try {
    const r = await pool.query(
      'INSERT INTO configurazioni_sala (nome, attiva, is_default) VALUES ($1, false, false) RETURNING *',
      [nome.trim()]
    );
    res.status(201).json({ configurazione: r.rows[0] });
  } catch (err) {
    console.error('creaConfig error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function attivaConfig(req, res) {
  const { id } = req.params;
  try {
    await pool.query('UPDATE configurazioni_sala SET attiva = false');
    const r = await pool.query(
      'UPDATE configurazioni_sala SET attiva = true WHERE id = $1 RETURNING *',
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Configurazione non trovata.' });
    res.json({ configurazione: r.rows[0] });
  } catch (err) {
    console.error('attivaConfig error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ── Tavoli ────────────────────────────────────────────────────────────────────

// GET /api/ristorante/tavoli — tavoli attivi con stato comanda, etichetta e prenotazione associata
async function listaTavoli(req, res) {
  try {
    const r = await pool.query(`
      SELECT
        t.id, t.numero, t.coperti, t.attivo,
        t.etichetta, t.prenotazione_id,
        p.nome          AS prenotazione_nome,
        p.ora           AS prenotazione_ora,
        p.coperti       AS prenotazione_coperti,
        c.id            AS comanda_id,
        c.stato         AS comanda_stato,
        c.ospite_hotel  AS comanda_ospite_hotel,
        c.timestamp_apertura,
        COUNT(cr.id) > 0 AS ha_righe,
        COUNT(cr.id) FILTER (WHERE cr.stato IN ('in_attesa','in_preparazione')) AS piatti_in_attesa,
        COUNT(cr.id) FILTER (WHERE cr.stato = 'pronto') AS piatti_pronti,
        (SELECT note_allergie FROM ospiti_giornalieri
         WHERE data = CURRENT_DATE LIMIT 1) AS note_allergie_oggi
      FROM tavoli t
      JOIN configurazioni_sala cs ON cs.id = t.configurazione_id AND cs.attiva = true
      LEFT JOIN prenotazioni_ristorante p ON p.id = t.prenotazione_id
      LEFT JOIN comande c ON c.tavolo_id = t.id AND c.stato = 'aperta'
      LEFT JOIN comande_righe cr ON cr.comanda_id = c.id
      WHERE t.attivo = true
      GROUP BY t.id, p.id, c.id
      ORDER BY t.numero
    `);
    res.json({ tavoli: r.rows });
  } catch (err) {
    console.error('listaTavoli error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function creaTavolo(req, res) {
  const { numero, coperti, posizione_x, posizione_y, configurazione_id } = req.body;
  if (!numero || !coperti) {
    return res.status(400).json({ errore: 'numero e coperti sono obbligatori.' });
  }
  if (coperti < 1) {
    return res.status(400).json({ errore: 'coperti deve essere almeno 1.' });
  }
  try {
    let configId = configurazione_id;
    if (!configId) {
      const cfg = await pool.query('SELECT id FROM configurazioni_sala WHERE attiva = true LIMIT 1');
      if (!cfg.rows.length) return res.status(400).json({ errore: 'Nessuna configurazione sala attiva.' });
      configId = cfg.rows[0].id;
    }
    // Controlla duplicato numero nella stessa configurazione
    const dup = await pool.query(
      'SELECT id FROM tavoli WHERE numero = $1 AND configurazione_id = $2 AND attivo = true',
      [numero, configId]
    );
    if (dup.rows.length) {
      return res.status(409).json({ errore: `Il tavolo numero ${numero} esiste già in questa configurazione.` });
    }
    const r = await pool.query(
      `INSERT INTO tavoli (numero, coperti, posizione_x, posizione_y, configurazione_id, attivo)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [numero, coperti, posizione_x ?? 0, posizione_y ?? 0, configId]
    );
    res.status(201).json({ tavolo: r.rows[0] });
  } catch (err) {
    console.error('creaTavolo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function modificaTavolo(req, res) {
  const { numero, coperti, posizione_x, posizione_y, etichetta } = req.body;
  try {
    const r = await pool.query(
      `UPDATE tavoli SET
         numero      = COALESCE($1, numero),
         coperti     = COALESCE($2, coperti),
         posizione_x = COALESCE($3, posizione_x),
         posizione_y = COALESCE($4, posizione_y),
         etichetta   = COALESCE($5, etichetta)
       WHERE id = $6 RETURNING *`,
      [numero ?? null, coperti ?? null, posizione_x ?? null, posizione_y ?? null,
       etichetta ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Tavolo non trovato.' });
    res.json({ tavolo: r.rows[0] });
  } catch (err) {
    console.error('modificaTavolo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function eliminaTavolo(req, res) {
  try {
    // Blocca se il tavolo ha una comanda aperta
    const aperta = await pool.query(
      "SELECT id FROM comande WHERE tavolo_id = $1 AND stato = 'aperta' LIMIT 1",
      [req.params.id]
    );
    if (aperta.rows.length) {
      return res.status(400).json({ errore: 'Impossibile eliminare il tavolo: ha una comanda aperta.' });
    }
    const r = await pool.query(
      'UPDATE tavoli SET attivo = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Tavolo non trovato.' });
    res.json({ messaggio: 'Tavolo disattivato.' });
  } catch (err) {
    console.error('eliminaTavolo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ristorante/tavoli/:id/prenotazione — associa o rimuove una prenotazione dal tavolo.
// Imposta etichetta = cognome della prenotazione e prenotazione_id = id.
// Passare prenotazione_id: null per rimuovere l'associazione.
// Accessibile a: cameriere, titolare, admin, receptionist.
async function associaPrenotazione(req, res) {
  const { prenotazione_id } = req.body;
  try {
    let etichetta = null;
    if (prenotazione_id) {
      const p = await pool.query(
        'SELECT nome, ora, coperti FROM prenotazioni_ristorante WHERE id = $1',
        [prenotazione_id]
      );
      if (!p.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata.' });
      // Usa il primo cognome/nome come etichetta breve
      etichetta = p.rows[0].nome.split(' ')[0];
    }
    const r = await pool.query(
      'UPDATE tavoli SET prenotazione_id = $1, etichetta = $2 WHERE id = $3 RETURNING *',
      [prenotazione_id || null, etichetta, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Tavolo non trovato.' });
    res.json({ tavolo: r.rows[0] });
  } catch (err) {
    console.error('associaPrenotazione error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  listaConfig, creaConfig, attivaConfig,
  listaTavoli, creaTavolo, modificaTavolo, eliminaTavolo,
  associaPrenotazione,
};
