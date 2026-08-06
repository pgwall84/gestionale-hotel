// Controller anagrafica ospiti (Fase 2, modulo Prenotazioni) — non va confuso
// con backend/controllers/ospitiController.js (Modulo 1.2, ospiti_giornalieri
// / note cucina, montato su /api/hr/ospiti): sono due domini diversi.
// Vedi docs/PRENOTAZIONI_FASE2.md Parte B.1 e Parte A.1 per il contratto.
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
// Le colonne *_testo (migration 023) sono il testo libero che la reception
// scrive leggendo il documento fisico — sempre compilabile, indipendente
// dalla sincronizzazione Alloggiati Web. Le *_codice (migration 016)
// restano solo per l'invio schedina (Fase 2), valorizzate solo quando il
// testo corrisponde a un suggerimento delle tabelle sincronizzate.
const COLONNE_PUBBLICHE = `
  id, nome, cognome, sesso, data_nascita,
  stato_nascita_codice, stato_nascita_testo,
  comune_nascita_codice, comune_nascita_testo,
  provincia_nascita,
  cittadinanza_codice, cittadinanza_testo,
  documento_tipo_codice, documento_tipo_testo,
  documento_scadenza,
  luogo_rilascio_codice, luogo_rilascio_testo,
  stato_residenza_codice, stato_residenza_testo,
  comune_residenza_codice, comune_residenza_testo,
  email, telefono, note,
  consenso_marketing, consenso_marketing_data, created_at, updated_at,
  nucleo_familiare_id,
  ${DOC_MASCHERATO}
`;

// Sottoquery riusata in lista(): numero di soggiorni non cancellati
// dell'ospite. Sottoquery invece di JOIN+GROUP BY per non dover qualificare
// con alias tutte le colonne di COLONNE_PUBBLICHE (usata anche altrove senza
// prefisso tabella) — nessuna ambiguità, nessun rischio di rompere dettaglio/
// crea/aggiorna che riusano la stessa costante.
const NUMERO_SOGGIORNI = `
  (SELECT COUNT(*) FROM soggiorni s WHERE s.ospite_id = ospiti.id AND s.cancellato = false) AS numero_soggiorni
`;

// GET /api/ospiti?search=... — lista/autocomplete per nome/cognome, max 20
// risultati. Usata sia dalla sezione Clienti (ricerca) sia dall'autocomplete
// del form "Nuova prenotazione" (Fase 2) — numero_soggiorni è un campo in
// più, non rompe il consumo esistente lato prenotazioni.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function lista(req, res) {
  const search = (req.query.search || '').trim();
  try {
    const result = search
      ? await pool.query(
          `SELECT ${COLONNE_PUBBLICHE}, ${NUMERO_SOGGIORNI} FROM ospiti
           WHERE nome ILIKE $1 OR cognome ILIKE $1
           ORDER BY cognome, nome
           LIMIT 20`,
          [`%${search}%`]
        )
      : await pool.query(
          `SELECT ${COLONNE_PUBBLICHE}, ${NUMERO_SOGGIORNI} FROM ospiti
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
    nome, cognome, sesso, data_nascita,
    stato_nascita_codice, stato_nascita_testo,
    comune_nascita_codice, comune_nascita_testo,
    provincia_nascita,
    cittadinanza_codice, cittadinanza_testo,
    documento_tipo_codice, documento_tipo_testo, documento_numero, documento_scadenza,
    luogo_rilascio_codice, luogo_rilascio_testo,
    stato_residenza_codice, stato_residenza_testo,
    comune_residenza_codice, comune_residenza_testo,
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
         nome, cognome, sesso, data_nascita,
         stato_nascita_codice, stato_nascita_testo,
         comune_nascita_codice, comune_nascita_testo,
         provincia_nascita,
         cittadinanza_codice, cittadinanza_testo,
         documento_tipo_codice, documento_tipo_testo, documento_numero, documento_scadenza,
         luogo_rilascio_codice, luogo_rilascio_testo,
         stato_residenza_codice, stato_residenza_testo,
         comune_residenza_codice, comune_residenza_testo,
         email, telefono, note, consenso_marketing, consenso_marketing_data
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24, $25,
         CASE WHEN $25 THEN NOW() ELSE NULL END
       )
       RETURNING ${COLONNE_PUBBLICHE}`,
      [
        nome, cognome, sesso || null, data_nascita || null,
        stato_nascita_codice || null, stato_nascita_testo || null,
        comune_nascita_codice || null, comune_nascita_testo || null,
        provincia_nascita || null,
        cittadinanza_codice || null, cittadinanza_testo || null,
        documento_tipo_codice || null, documento_tipo_testo || null, documento_numero || null, documento_scadenza || null,
        luogo_rilascio_codice || null, luogo_rilascio_testo || null,
        stato_residenza_codice || null, stato_residenza_testo || null,
        comune_residenza_codice || null, comune_residenza_testo || null,
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
    nome, cognome, sesso, data_nascita,
    stato_nascita_codice, stato_nascita_testo,
    comune_nascita_codice, comune_nascita_testo,
    provincia_nascita,
    cittadinanza_codice, cittadinanza_testo,
    documento_tipo_codice, documento_tipo_testo, documento_numero, documento_scadenza,
    luogo_rilascio_codice, luogo_rilascio_testo,
    stato_residenza_codice, stato_residenza_testo,
    comune_residenza_codice, comune_residenza_testo,
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
         stato_nascita_testo   = COALESCE($6, stato_nascita_testo),
         comune_nascita_codice = COALESCE($7, comune_nascita_codice),
         comune_nascita_testo  = COALESCE($8, comune_nascita_testo),
         provincia_nascita     = COALESCE($9, provincia_nascita),
         cittadinanza_codice   = COALESCE($10, cittadinanza_codice),
         cittadinanza_testo    = COALESCE($11, cittadinanza_testo),
         documento_tipo_codice = COALESCE($12, documento_tipo_codice),
         documento_tipo_testo  = COALESCE($13, documento_tipo_testo),
         documento_numero      = COALESCE($14, documento_numero),
         documento_scadenza    = COALESCE($15, documento_scadenza),
         luogo_rilascio_codice = COALESCE($16, luogo_rilascio_codice),
         luogo_rilascio_testo  = COALESCE($17, luogo_rilascio_testo),
         stato_residenza_codice  = COALESCE($18, stato_residenza_codice),
         stato_residenza_testo   = COALESCE($19, stato_residenza_testo),
         comune_residenza_codice = COALESCE($20, comune_residenza_codice),
         comune_residenza_testo  = COALESCE($21, comune_residenza_testo),
         email                 = COALESCE($22, email),
         telefono              = COALESCE($23, telefono),
         note                  = COALESCE($24, note),
         consenso_marketing    = COALESCE($25, consenso_marketing),
         consenso_marketing_data = CASE WHEN $25 IS TRUE THEN NOW() ELSE consenso_marketing_data END,
         updated_at            = NOW()
       WHERE id = $26
       RETURNING ${COLONNE_PUBBLICHE}`,
      [
        nome || null, cognome || null, sesso || null, data_nascita || null,
        stato_nascita_codice || null, stato_nascita_testo || null,
        comune_nascita_codice || null, comune_nascita_testo || null,
        provincia_nascita || null,
        cittadinanza_codice || null, cittadinanza_testo || null,
        documento_tipo_codice || null, documento_tipo_testo || null, documento_numero || null, documento_scadenza || null,
        luogo_rilascio_codice || null, luogo_rilascio_testo || null,
        stato_residenza_codice || null, stato_residenza_testo || null,
        comune_residenza_codice || null, comune_residenza_testo || null,
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

// POST /api/ospiti/:id/nucleo — collega/scollega un cliente esistente a un
// nucleo familiare (modulo 5.2 Fase B, estensione 04/08/2026). body:
// { nucleo_familiare_id } — un id esistente per collegare, null per
// scollegare. Non crea il nucleo: va creato prima con
// POST /api/nuclei-familiari (nucleiFamiliariController.crea).
async function impostaNucleo(req, res) {
  const { nucleo_familiare_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE ospiti SET nucleo_familiare_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, nucleo_familiare_id',
      [nucleo_familiare_id || null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ospite non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('imposta nucleo familiare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, dettaglio, crea, aggiorna, svelaDocumento, impostaNucleo, DOC_MASCHERATO };
