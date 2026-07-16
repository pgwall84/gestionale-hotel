// Controller anagrafica ospiti (Fase 2, modulo Prenotazioni) — non va confuso
// con backend/controllers/ospitiController.js (Modulo 1.2, ospiti_giornalieri
// / note cucina, montato su /api/hr/ospiti): sono due domini diversi.
// Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md Sezione 1 e
// docs/API_PRENOTAZIONI_FASE2.md Sezione 1 per il contratto.
//
// Regola di sicurezza (non derogabile): documento_numero non deve MAI
// transitare in chiaro nel payload di lista/dettaglio/crea/aggiorna. Le
// query qui sotto non selezionano mai la colonna grezza per quegli endpoint
// — costruiscono invece "documento_mascherato" lato SQL (RIGHT() sulle
// ultime 4 cifre). Solo svelaDocumento fa una SELECT sulla colonna reale.
// Per questo le RETURNING di crea/aggiorna elencano le colonne esplicite
// invece di RETURNING * (deviazione intenzionale dal pattern di CLAUDE.md
// Sezione 5, giustificata dalla regola sopra).

const pool = require('../config/db');
const { logAudit } = require('./auditController');

// Espressione SQL riusata in lista/dettaglio/crea/aggiorna: non espone mai
// documento_numero in chiaro, solo tipo documento + ultime 4 cifre.
const DOC_MASCHERATO = `
  CASE WHEN documento_numero IS NOT NULL
    THEN COALESCE(documento_tipo_codice, '—') || ' · ••••' || RIGHT(documento_numero, 4)
    ELSE NULL
  END AS documento_mascherato
`;

// Colonne pubbliche restituite da lista/dettaglio/crea/aggiorna — mai documento_numero.
const COLONNE_PUBBLICHE = `
  id, nome, cognome, sesso, data_nascita, stato_nascita_codice,
  comune_nascita_codice, provincia_nascita, cittadinanza_codice,
  documento_tipo_codice, luogo_rilascio_codice, email, telefono, note,
  consenso_marketing, consenso_marketing_data, created_at, updated_at,
  ${DOC_MASCHERATO}
`;

// GET /api/ospiti?search=... — autocomplete per nome/cognome, max 20 risultati.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function lista(req, res) {
  const search = (req.query.search || '').trim();
  try {
    const result = search
      ? await pool.query(
          `SELECT ${COLONNE_PUBBLICHE} FROM ospiti
           WHERE nome ILIKE $1 OR cognome ILIKE $1
           ORDER BY cognome, nome
           LIMIT 20`,
          [`%${search}%`]
        )
      : await pool.query(
          `SELECT ${COLONNE_PUBBLICHE} FROM ospiti
           ORDER BY created_at DESC
           LIMIT 20`
        );
    res.json(result.rows);
  } catch (err) {
    console.error('lista ospiti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/ospiti/:id — dettaglio + storico soggiorni.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function dettaglio(req, res) {
  try {
    const ospite = await pool.query(
      `SELECT ${COLONNE_PUBBLICHE} FROM ospiti WHERE id = $1`,
      [req.params.id]
    );
    if (!ospite.rows.length) {
      return res.status(404).json({ error: 'Ospite non trovato' });
    }

    const storico = await pool.query(
      `SELECT s.id, s.data_arrivo, s.data_partenza, s.num_ospiti,
              s.tariffa_totale, s.cancellato,
              c.numero AS camera_numero, c.nome AS camera_nome,
              p.id AS prenotazione_id, p.stato AS prenotazione_stato
       FROM soggiorni s
       JOIN camere c ON c.id = s.camera_id
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       WHERE s.ospite_id = $1
       ORDER BY s.data_arrivo DESC`,
      [req.params.id]
    );

    res.json({ ...ospite.rows[0], storico_soggiorni: storico.rows });
  } catch (err) {
    console.error('dettaglio ospite error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/ospiti — crea nuovo ospite.
// Accessibile a: admin, titolare, receptionist (scrittura).
async function crea(req, res) {
  const {
    nome, cognome, sesso, data_nascita, stato_nascita_codice,
    comune_nascita_codice, provincia_nascita, cittadinanza_codice,
    documento_tipo_codice, documento_numero, luogo_rilascio_codice,
    email, telefono, note, consenso_marketing,
  } = req.body;

  if (!nome || !cognome) {
    return res.status(400).json({ error: 'nome e cognome sono obbligatori.' });
  }
  if (sesso && !['M', 'F'].includes(sesso)) {
    return res.status(400).json({ error: "sesso deve essere 'M' o 'F'." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ospiti (
         nome, cognome, sesso, data_nascita, stato_nascita_codice,
         comune_nascita_codice, provincia_nascita, cittadinanza_codice,
         documento_tipo_codice, documento_numero, luogo_rilascio_codice,
         email, telefono, note, consenso_marketing, consenso_marketing_data
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         CASE WHEN $15 THEN NOW() ELSE NULL END
       )
       RETURNING ${COLONNE_PUBBLICHE}`,
      [
        nome, cognome, sesso || null, data_nascita || null, stato_nascita_codice || null,
        comune_nascita_codice || null, provincia_nascita || null, cittadinanza_codice || null,
        documento_tipo_codice || null, documento_numero || null, luogo_rilascio_codice || null,
        email || null, telefono || null, note || null, consenso_marketing ?? false,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea ospite error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/ospiti/:id — aggiorna dati ospite esistente (campi opzionali).
// Accessibile a: admin, titolare, receptionist (scrittura).
async function aggiorna(req, res) {
  const {
    nome, cognome, sesso, data_nascita, stato_nascita_codice,
    comune_nascita_codice, provincia_nascita, cittadinanza_codice,
    documento_tipo_codice, documento_numero, luogo_rilascio_codice,
    email, telefono, note, consenso_marketing,
  } = req.body;

  if (sesso && !['M', 'F'].includes(sesso)) {
    return res.status(400).json({ error: "sesso deve essere 'M' o 'F'." });
  }

  try {
    const result = await pool.query(
      `UPDATE ospiti SET
         nome                  = COALESCE($1, nome),
         cognome               = COALESCE($2, cognome),
         sesso                 = COALESCE($3, sesso),
         data_nascita          = COALESCE($4, data_nascita),
         stato_nascita_codice  = COALESCE($5, stato_nascita_codice),
         comune_nascita_codice = COALESCE($6, comune_nascita_codice),
         provincia_nascita     = COALESCE($7, provincia_nascita),
         cittadinanza_codice   = COALESCE($8, cittadinanza_codice),
         documento_tipo_codice = COALESCE($9, documento_tipo_codice),
         documento_numero      = COALESCE($10, documento_numero),
         luogo_rilascio_codice = COALESCE($11, luogo_rilascio_codice),
         email                 = COALESCE($12, email),
         telefono              = COALESCE($13, telefono),
         note                  = COALESCE($14, note),
         consenso_marketing    = COALESCE($15, consenso_marketing),
         consenso_marketing_data = CASE WHEN $15 IS TRUE THEN NOW() ELSE consenso_marketing_data END,
         updated_at            = NOW()
       WHERE id = $16
       RETURNING ${COLONNE_PUBBLICHE}`,
      [
        nome || null, cognome || null, sesso || null, data_nascita || null, stato_nascita_codice || null,
        comune_nascita_codice || null, provincia_nascita || null, cittadinanza_codice || null,
        documento_tipo_codice || null, documento_numero || null, luogo_rilascio_codice || null,
        email || null, telefono || null, note || null,
        consenso_marketing === undefined ? null : consenso_marketing,
        req.params.id,
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ospite non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiorna ospite error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/ospiti/:id/svela-documento — unico endpoint che restituisce
// documento_numero in chiaro. Scrive sempre una riga in audit_log.
// Accessibile a: admin, titolare, receptionist (MAI portiere_notte).
async function svelaDocumento(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, nome, cognome, documento_tipo_codice, documento_numero, luogo_rilascio_codice
       FROM ospiti WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ospite non trovato' });
    }
    const ospite = result.rows[0];

    // Audit obbligatorio ad ogni chiamata, indipendentemente dal fatto che
    // il documento sia valorizzato o meno — è l'accesso stesso a essere tracciato.
    await logAudit(req.utente.id, 'svela_documento', 'ospiti', ospite.id, req, {
      nome: ospite.nome,
      cognome: ospite.cognome,
    });

    res.json(ospite);
  } catch (err) {
    console.error('svela documento ospite error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, dettaglio, crea, aggiorna, svelaDocumento, DOC_MASCHERATO };
