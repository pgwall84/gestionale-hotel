// Controller Pre check-in — lato reception (modulo 5.2 Fase B, 04/08/2026).
// Gestisce la coda di revisione: i dati inviati dall'ospite tramite il form
// pubblico (preCheckinPubblicoController.js) restano "in attesa" finché
// admin/titolare/receptionist non li applica (crea/aggiorna gli ospiti veri
// e li collega al soggiorno) o li scarta. Accessibile a: admin, titolare,
// receptionist (shared/ruoli.js sezione 'pre_checkin').

const pool = require('../config/db');

// Stesso vincolo applicativo di soggiorniController.js: un soggiorno deve
// avere esattamente un intestatario (singolo/capofamiglia/capogruppo).
const TIPI_INTESTATARIO = ['16', '17', '18'];
const TIPI_VALIDI = ['16', '17', '18', '19', '20'];

// GET /api/pre-checkin?stato=in_attesa — coda di revisione (default: solo
// da rivedere). Join minimo su prenotazioni per mostrare a colpo d'occhio
// a quale prenotazione appartiene ciascuna richiesta.
const lista = async (req, res) => {
  const stato = req.query.stato || 'in_attesa';
  try {
    const result = await pool.query(
      `SELECT r.id, r.stato, r.creato_at, r.prenotazione_id,
              (SELECT COUNT(*) FROM pre_checkin_ospiti po WHERE po.richiesta_id = r.id) AS numero_ospiti,
              (SELECT MIN(s.data_arrivo) FROM soggiorni s WHERE s.prenotazione_id = r.prenotazione_id AND s.cancellato = false) AS data_arrivo
       FROM pre_checkin_richieste r
       WHERE r.stato = $1
       ORDER BY r.creato_at DESC`,
      [stato]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista pre-checkin error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// GET /api/pre-checkin/:id — dettaglio con gli ospiti proposti, raggruppati
// per soggiorno (camera) per facilitare la UI di revisione.
const dettaglio = async (req, res) => {
  try {
    const richiesta = await pool.query('SELECT * FROM pre_checkin_richieste WHERE id = $1', [req.params.id]);
    if (!richiesta.rows.length) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }

    const ospiti = await pool.query(
      `SELECT po.*, c.numero AS camera_numero, s.data_arrivo, s.data_partenza,
              s.ospite_id AS capofamiglia_id, o.nome AS capofamiglia_nome, o.cognome AS capofamiglia_cognome
       FROM pre_checkin_ospiti po
       JOIN soggiorni s ON s.id = po.soggiorno_id
       JOIN camere c ON c.id = s.camera_id
       LEFT JOIN ospiti o ON o.id = s.ospite_id
       WHERE po.richiesta_id = $1
       ORDER BY s.data_arrivo, po.id`,
      [req.params.id]
    );

    res.json({ ...richiesta.rows[0], ospiti: ospiti.rows });
  } catch (err) {
    console.error('dettaglio pre-checkin error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// POST /api/pre-checkin/:id/applica — crea/aggiorna gli ospiti reali e li
// collega al soggiorno. body: { ospiti: [{ soggiorno_id, ospite_id_esistente,
// tipo_alloggiato, nome, cognome, sesso, data_nascita, cittadinanza_testo,
// documento_tipo_testo, documento_numero, documento_scadenza,
// luogo_nascita_testo, provincia_nascita }, ...] } — i valori arrivano dalla
// UI di revisione, eventualmente corretti dalla reception rispetto a quanto
// proposto in pre_checkin_ospiti (che resta lo storico di cosa ha scritto
// l'ospite, mai sovrascritto).
//
// Nucleo familiare: se la richiesta ha più di un ospite, tutti gli ospiti
// applicati vengono collegati allo stesso nucleo_familiare_id — riusando
// quello già presente su un ospite esistente (es. il capofamiglia di un
// soggiorno precedente), altrimenti creandone uno nuovo.
const applica = async (req, res) => {
  const { ospiti } = req.body;
  if (!Array.isArray(ospiti) || ospiti.length === 0) {
    return res.status(400).json({ error: 'ospiti deve essere un array non vuoto.' });
  }
  for (const o of ospiti) {
    if (!o.soggiorno_id || !o.nome || !o.cognome || !o.tipo_alloggiato) {
      return res.status(400).json({ error: 'Per ogni ospite servono soggiorno_id, nome, cognome e tipo_alloggiato.' });
    }
    if (!TIPI_VALIDI.includes(o.tipo_alloggiato)) {
      return res.status(400).json({ error: `tipo_alloggiato deve essere uno tra: ${TIPI_VALIDI.join(', ')}.` });
    }
  }
  // Un solo intestatario (16/17/18) per soggiorno tra le righe inviate.
  const intestatariPerSoggiorno = {};
  for (const o of ospiti) {
    if (TIPI_INTESTATARIO.includes(o.tipo_alloggiato)) {
      intestatariPerSoggiorno[o.soggiorno_id] = (intestatariPerSoggiorno[o.soggiorno_id] || 0) + 1;
    }
  }
  if (Object.values(intestatariPerSoggiorno).some(n => n > 1)) {
    return res.status(400).json({ error: 'Ogni camera può avere un solo intestatario (singolo/capofamiglia/capogruppo).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const richiesta = await client.query(`SELECT * FROM pre_checkin_richieste WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!richiesta.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    if (richiesta.rows[0].stato !== 'in_attesa') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Richiesta già ${richiesta.rows[0].stato}.` });
    }

    // Determina il nucleo familiare (solo se più di un ospite in questa
    // richiesta): riusa quello di un ospite esistente se presente, altrimenti
    // ne crea uno nuovo — assegnato solo dopo aver creato/aggiornato le righe.
    let nucleoId = null;
    if (ospiti.length > 1) {
      const idsEsistenti = ospiti.map(o => o.ospite_id_esistente).filter(Boolean);
      if (idsEsistenti.length) {
        const conNucleo = await client.query(
          `SELECT nucleo_familiare_id FROM ospiti WHERE id = ANY($1) AND nucleo_familiare_id IS NOT NULL LIMIT 1`,
          [idsEsistenti]
        );
        if (conNucleo.rows.length) nucleoId = conNucleo.rows[0].nucleo_familiare_id;
      }
      if (!nucleoId) {
        const nuovoNucleo = await client.query(`INSERT INTO nuclei_familiari DEFAULT VALUES RETURNING id`);
        nucleoId = nuovoNucleo.rows[0].id;
      }
    }

    const ospitiCreati = [];
    for (const o of ospiti) {
      let ospiteId;
      if (o.ospite_id_esistente) {
        const aggiornato = await client.query(
          `UPDATE ospiti SET
             nome = COALESCE($1, nome), cognome = COALESCE($2, cognome),
             sesso = COALESCE($3, sesso), data_nascita = COALESCE($4, data_nascita),
             cittadinanza_testo = COALESCE($5, cittadinanza_testo),
             cittadinanza_codice = COALESCE($6, cittadinanza_codice),
             documento_tipo_testo = COALESCE($7, documento_tipo_testo),
             documento_tipo_codice = COALESCE($8, documento_tipo_codice),
             documento_numero = COALESCE($9, documento_numero),
             documento_scadenza = COALESCE($10, documento_scadenza),
             comune_nascita_testo = COALESCE($11, comune_nascita_testo),
             provincia_nascita = COALESCE($12, provincia_nascita),
             stato_residenza_testo = COALESCE($13, stato_residenza_testo),
             stato_residenza_codice = COALESCE($14, stato_residenza_codice),
             comune_residenza_testo = COALESCE($15, comune_residenza_testo),
             comune_residenza_codice = COALESCE($16, comune_residenza_codice),
             updated_at = NOW()
           WHERE id = $17 RETURNING id`,
          [o.nome || null, o.cognome || null, o.sesso || null, o.data_nascita || null,
           o.cittadinanza_testo || null, o.cittadinanza_codice || null,
           o.documento_tipo_testo || null, o.documento_tipo_codice || null,
           o.documento_numero || null, o.documento_scadenza || null,
           o.luogo_nascita_testo || null, o.provincia_nascita || null,
           o.stato_residenza_testo || null, o.stato_residenza_codice || null,
           o.comune_residenza_testo || null, o.comune_residenza_codice || null,
           o.ospite_id_esistente]
        );
        if (!aggiornato.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Cliente esistente con id ${o.ospite_id_esistente} non trovato.` });
        }
        ospiteId = aggiornato.rows[0].id;
      } else {
        const creato = await client.query(
          `INSERT INTO ospiti (nome, cognome, sesso, data_nascita, cittadinanza_testo, cittadinanza_codice,
                                documento_tipo_testo, documento_tipo_codice, documento_numero, documento_scadenza,
                                comune_nascita_testo, provincia_nascita,
                                stato_residenza_testo, stato_residenza_codice, comune_residenza_testo, comune_residenza_codice)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
          [o.nome, o.cognome, o.sesso || null, o.data_nascita || null, o.cittadinanza_testo || null, o.cittadinanza_codice || null,
           o.documento_tipo_testo || null, o.documento_tipo_codice || null, o.documento_numero || null, o.documento_scadenza || null,
           o.luogo_nascita_testo || null, o.provincia_nascita || null,
           o.stato_residenza_testo || null, o.stato_residenza_codice || null,
           o.comune_residenza_testo || null, o.comune_residenza_codice || null]
        );
        ospiteId = creato.rows[0].id;
      }

      await client.query(
        `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato)
         VALUES ($1, $2, $3)
         ON CONFLICT (soggiorno_id, ospite_id) DO UPDATE SET tipo_alloggiato = EXCLUDED.tipo_alloggiato`,
        [o.soggiorno_id, ospiteId, o.tipo_alloggiato]
      );

      if (o.pre_checkin_ospiti_id) {
        await client.query('UPDATE pre_checkin_ospiti SET applicato_ospite_id = $1 WHERE id = $2', [ospiteId, o.pre_checkin_ospiti_id]);
      }

      ospitiCreati.push(ospiteId);
    }

    if (nucleoId) {
      await client.query(
        `UPDATE ospiti SET nucleo_familiare_id = $1 WHERE id = ANY($2) AND nucleo_familiare_id IS NULL`,
        [nucleoId, ospitiCreati]
      );
    }

    await client.query(
      `UPDATE pre_checkin_richieste SET stato = 'applicata', applicata_da = $1, applicata_at = NOW() WHERE id = $2`,
      [req.utente.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, ospiti_creati: ospitiCreati, nucleo_familiare_id: nucleoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('applica pre-checkin error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
};

// POST /api/pre-checkin/:id/scarta — segna la richiesta come scartata
// (l'ospite potrà inviarne una nuova, il form pubblico blocca solo se
// esiste una richiesta non scartata).
const scarta = async (req, res) => {
  const { motivo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE pre_checkin_richieste SET stato = 'scartata', motivo_scarto = $1
       WHERE id = $2 AND stato = 'in_attesa' RETURNING id`,
      [motivo || null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Richiesta non trovata o non più in attesa.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('scarta pre-checkin error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { lista, dettaglio, applica, scarta };
