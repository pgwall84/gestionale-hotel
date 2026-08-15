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
  vip, blacklist, blacklist_motivo, allergie, tag, duplicato_di,
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

// Totale speso (14/08/2026, CRM ospiti): camera (soggiorni.tariffa_totale)
// + addebiti extra collegati ai suoi soggiorni, esclusi i soggiorni
// cancellati. Non è mai persistito — sempre ricalcolato dal dato reale,
// per non rischiare che diventi stale rispetto a pagamenti/addebiti nuovi.
// Diverso e più completo del vecchio calcolo lato frontend (che sommava
// solo tariffa_totale, ignorando gli addebiti extra).
const TOTALE_SPESO = `
  (
    (SELECT COALESCE(SUM(s.tariffa_totale), 0) FROM soggiorni s
       WHERE s.ospite_id = ospiti.id AND s.cancellato = false)
    +
    (SELECT COALESCE(SUM(ae.importo), 0) FROM addebiti_extra ae
       JOIN soggiorni s2 ON s2.id = ae.soggiorno_id
       WHERE s2.ospite_id = ospiti.id AND s2.cancellato = false)
  ) AS totale_speso
`;

// Colonne di ordinamento consentite (whitelist — mai interpolare
// direttamente req.query.ordina in SQL, rischio injection sul nome colonna).
const COLONNE_ORDINAMENTO = {
  cognome: 'cognome, nome',
  numero_soggiorni: 'numero_soggiorni',
  totale_speso: 'totale_speso',
  created_at: 'created_at',
};

// GET /api/ospiti?search=...&tag=...&vip=&blacklist=&consenso_marketing=&
//   allergia=&ordina=&direzione=&limit=&includi_duplicati=
// Lista/autocomplete per nome/cognome, con filtri ed ordinamento aggiunti
// il 14/08/2026 (CRM ospiti). Compatibilità con l'uso esistente (autocomplete
// "Nuova prenotazione", selezione manuale in Offerte): senza parametri di
// filtro/ordinamento il comportamento resta identico a prima (LIMIT 20,
// ordinato per cognome se c'è `search`, per data creazione altrimenti).
// `limit` esplicito arriva fino a 200 (stesso cap già in uso per
// GET /api/prenotazioni) — la pagina /clienti lo usa per non restare
// bloccata a 20 risultati quando applica un filtro/ordinamento.
// Esclude di default gli ospiti assorbiti da un'unione (duplicato_di
// valorizzato) — includi_duplicati=true li rimette per casi di audit.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function lista(req, res) {
  const search = (req.query.search || '').trim();
  const { tag, vip, blacklist, consenso_marketing, allergia, ordina, direzione, includi_duplicati } = req.query;

  const limitRichiesto = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRichiesto) ? Math.min(Math.max(limitRichiesto, 1), 200) : 20;

  const condizioni = [];
  const parametri = [];

  if (!includi_duplicati || includi_duplicati === 'false') {
    condizioni.push('duplicato_di IS NULL');
  }
  if (search) {
    // Ricerca per parole (15/08/2026, bug reale segnalato dal titolare):
    // prima un solo ILIKE sull'intera stringa contro nome e contro cognome
    // separatamente — "Mario Rossi" non trovava nulla perché nessuna delle
    // due colonne contiene "Mario Rossi" per intero, sono in colonne
    // diverse. Ora ogni parola digitata deve comparire in nome O cognome
    // (AND tra le parole, OR tra le due colonne per ciascuna) — funziona
    // digitando solo il nome, solo il cognome, o entrambi in qualsiasi ordine.
    const parole = search.split(/\s+/).filter(Boolean);
    const condizioniParole = parole.map(p => {
      parametri.push(`%${p}%`);
      return `(nome ILIKE $${parametri.length} OR cognome ILIKE $${parametri.length})`;
    });
    condizioni.push(condizioniParole.join(' AND '));
  }
  if (tag) {
    // && = "ha almeno uno dei tag richiesti" (operatore array overlap,
    // usa l'indice GIN su ospiti.tag). Più tag separati da virgola.
    parametri.push(tag.split(',').map(t => t.trim()).filter(Boolean));
    condizioni.push(`tag && $${parametri.length}::text[]`);
  }
  if (vip === 'true' || vip === 'false') {
    parametri.push(vip === 'true');
    condizioni.push(`vip = $${parametri.length}`);
  }
  if (blacklist === 'true' || blacklist === 'false') {
    parametri.push(blacklist === 'true');
    condizioni.push(`blacklist = $${parametri.length}`);
  }
  if (consenso_marketing === 'true' || consenso_marketing === 'false') {
    parametri.push(consenso_marketing === 'true');
    condizioni.push(`consenso_marketing = $${parametri.length}`);
  }
  if (allergia) {
    parametri.push(`%${allergia}%`);
    condizioni.push(`allergie ILIKE $${parametri.length}`);
  }

  const whereSql = condizioni.length ? `WHERE ${condizioni.join(' AND ')}` : '';
  const colonnaOrdine = COLONNE_ORDINAMENTO[ordina] || (search ? COLONNE_ORDINAMENTO.cognome : COLONNE_ORDINAMENTO.created_at);
  const direzioneSql = direzione === 'asc' ? 'ASC' : (direzione === 'desc' ? 'DESC' : (ordina && ordina !== 'cognome' ? 'DESC' : ''));

  try {
    // numero_soggiorni/totale_speso vanno nel SELECT prima di poterli
    // usare in ORDER BY (non sono colonne reali della tabella) — la
    // query resta comunque una singola SELECT, non una subquery annidata.
    const result = await pool.query(
      `SELECT ${COLONNE_PUBBLICHE}, ${NUMERO_SOGGIORNI}, ${TOTALE_SPESO}
       FROM ospiti
       ${whereSql}
       ORDER BY ${colonnaOrdine} ${direzioneSql}
       LIMIT ${limit}`,
      parametri
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista ospiti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/ospiti/tag — elenco dei tag già usati (autocomplete), per non
// far digitare da capo ogni volta lo stesso tag con varianti diverse.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function tagSuggeriti(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT unnest(tag) AS tag FROM ospiti
       WHERE duplicato_di IS NULL AND array_length(tag, 1) > 0
       ORDER BY tag`
    );
    res.json(result.rows.map(r => r.tag));
  } catch (err) {
    console.error('tag suggeriti ospiti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/ospiti/duplicati-sospetti — gruppi di ospiti con stesso
// nome+cognome (case-insensitive) e stessa data di nascita, esclusi quelli
// già assorbiti da un'unione precedente. Richiede data_nascita valorizzata
// su entrambi per evitare falsi positivi su semplici omonimie senza
// nessun altro dato a supporto — solo nome+cognome uguali non basta.
// Nessuna unione automatica qui: solo segnalazione, la scelta è sempre
// dell'operatore (vedi unisci sotto).
// Accessibile a: admin, titolare (stessa sensibilità dell'unione).
async function duplicatiSospetti(req, res) {
  try {
    const gruppi = await pool.query(
      `SELECT LOWER(nome) AS chiave_nome, LOWER(cognome) AS chiave_cognome, data_nascita
       FROM ospiti
       WHERE duplicato_di IS NULL AND data_nascita IS NOT NULL
       GROUP BY LOWER(nome), LOWER(cognome), data_nascita
       HAVING COUNT(*) > 1`
    );
    if (!gruppi.rows.length) return res.json([]);

    const risultati = [];
    for (const g of gruppi.rows) {
      const candidati = await pool.query(
        `SELECT id, nome, cognome, data_nascita, email, telefono, created_at,
                ${NUMERO_SOGGIORNI}, ${TOTALE_SPESO}
         FROM ospiti
         WHERE duplicato_di IS NULL AND LOWER(nome) = $1 AND LOWER(cognome) = $2 AND data_nascita = $3
         ORDER BY created_at ASC`,
        [g.chiave_nome, g.chiave_cognome, g.data_nascita]
      );
      risultati.push({ candidati: candidati.rows });
    }
    res.json(risultati);
  } catch (err) {
    console.error('duplicati sospetti ospiti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/ospiti/:id/unisci — body { con_id }. Unisce con_id (il
// "perdente") dentro :id (il "vincitore", sceglie sempre l'operatore in
// UI). MAI automatico, MAI cancella il perdente: lo marca con
// duplicato_di e riassegna a mano ogni tabella che lo referenzia, per
// non perdere lo storico soggiorni/documenti/invii collegato. Vedi
// docs/EVOLUTIVE.md "CRM ospiti" per il perché di questa scelta.
// Accessibile a: admin, titolare (azione 'ospiti'.unisci, più stretta
// della scrittura normale — niente receptionist).
async function unisci(req, res) {
  const vincitoreId = parseInt(req.params.id, 10);
  const perdenteId = parseInt(req.body.con_id, 10);

  if (!vincitoreId || !perdenteId || vincitoreId === perdenteId) {
    return res.status(400).json({ error: 'id e con_id devono essere due ospiti distinti.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const esistenti = await client.query(
      'SELECT id, nome, cognome, duplicato_di FROM ospiti WHERE id = ANY($1) FOR UPDATE',
      [[vincitoreId, perdenteId]]
    );
    if (esistenti.rows.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uno dei due ospiti non esiste.' });
    }
    if (esistenti.rows.some(r => r.duplicato_di !== null)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Uno dei due ospiti è già stato unito in precedenza.' });
    }

    await client.query('UPDATE soggiorni SET ospite_id = $1 WHERE ospite_id = $2', [vincitoreId, perdenteId]);

    // soggiorno_ospiti ha un vincolo UNIQUE(soggiorno_id, ospite_id): se lo
    // stesso soggiorno ha già una riga per il vincitore, la riga del
    // perdente per quel soggiorno andrebbe eliminata prima di riassegnare,
    // altrimenti l'UPDATE sotto violerebbe il vincolo.
    await client.query(
      `DELETE FROM soggiorno_ospiti so
       WHERE so.ospite_id = $2
         AND EXISTS (SELECT 1 FROM soggiorno_ospiti so2 WHERE so2.soggiorno_id = so.soggiorno_id AND so2.ospite_id = $1)`,
      [vincitoreId, perdenteId]
    );
    await client.query('UPDATE soggiorno_ospiti SET ospite_id = $1 WHERE ospite_id = $2', [vincitoreId, perdenteId]);

    await client.query('UPDATE offerte_email_destinatari SET ospite_id = $1 WHERE ospite_id = $2', [vincitoreId, perdenteId]);
    await client.query('UPDATE pre_checkin_ospiti SET applicato_ospite_id = $1 WHERE applicato_ospite_id = $2', [vincitoreId, perdenteId]);

    await client.query('UPDATE ospiti SET duplicato_di = $1, updated_at = NOW() WHERE id = $2', [vincitoreId, perdenteId]);

    await client.query('COMMIT');

    await logAudit(req.utente.id, 'unisci_ospiti', 'ospiti', vincitoreId, req, {
      vincitore_id: vincitoreId,
      perdente_id: perdenteId,
    });

    res.json({ ok: true, vincitore_id: vincitoreId, perdente_id: perdenteId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('unisci ospiti error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// GET /api/ospiti/:id — dettaglio + storico soggiorni.
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function dettaglio(req, res) {
  try {
    const ospite = await pool.query(
      `SELECT ${COLONNE_PUBBLICHE}, ${TOTALE_SPESO} FROM ospiti WHERE id = $1`,
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
    vip, blacklist, blacklist_motivo, allergie, tag,
  } = req.body;

  if (!nome || !cognome) {
    return res.status(400).json({ error: 'nome e cognome sono obbligatori.' });
  }
  if (sesso && !['M', 'F'].includes(sesso)) {
    return res.status(400).json({ error: "sesso deve essere 'M' o 'F'." });
  }
  if (tag !== undefined && !(Array.isArray(tag) && tag.every(t => typeof t === 'string'))) {
    return res.status(400).json({ error: 'tag deve essere un array di stringhe.' });
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
         email, telefono, note, consenso_marketing, consenso_marketing_data,
         vip, blacklist, blacklist_motivo, allergie, tag
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24, $25,
         CASE WHEN $25 THEN NOW() ELSE NULL END,
         $26, $27, $28, $29, $30
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
        vip ?? false, blacklist ?? false, blacklist_motivo || null, allergie || null, tag || [],
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
    vip, blacklist, blacklist_motivo, allergie, tag,
  } = req.body;

  if (sesso && !['M', 'F'].includes(sesso)) {
    return res.status(400).json({ error: "sesso deve essere 'M' o 'F'." });
  }
  // Come consenso_marketing sotto: undefined (campo omesso) → NULL →
  // COALESCE mantiene il valore esistente. false è un valore legittimo
  // (es. togliere il flag VIP) e NON deve diventare NULL — bug già evitato
  // altrove nel file per lo stesso motivo, replicato qui apposta.
  if (tag !== undefined && !(Array.isArray(tag) && tag.every(t => typeof t === 'string'))) {
    return res.status(400).json({ error: 'tag deve essere un array di stringhe.' });
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
         vip                   = COALESCE($27, vip),
         blacklist             = COALESCE($28, blacklist),
         blacklist_motivo      = COALESCE($29, blacklist_motivo),
         allergie              = COALESCE($30, allergie),
         tag                   = COALESCE($31, tag),
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
        vip === undefined ? null : vip,
        blacklist === undefined ? null : blacklist,
        blacklist_motivo === undefined ? null : blacklist_motivo,
        allergie === undefined ? null : allergie,
        tag === undefined ? null : tag,
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

module.exports = {
  lista, dettaglio, crea, aggiorna, svelaDocumento, impostaNucleo,
  tagSuggeriti, duplicatiSospetti, unisci, DOC_MASCHERATO,
};
