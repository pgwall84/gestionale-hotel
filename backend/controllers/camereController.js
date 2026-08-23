// Controller camere — stato giornaliero arrivi/partenze per la cameriera,
// più l'anagrafica delle camere fisiche (Impostazioni▸Camere, 31/07/2026).
// Prima di questa data le camere erano considerate statiche (21 totali,
// gestite solo a DB); ora sono creabili/modificabili/disattivabili da UI.
//
// Modulo 5.1 (Check-in/check-out digitale + housekeeping, 03/08/2026):
// `arrivo`/`partenza` non sono più impostati a mano (POST /api/camere/stato
// non li accetta più) — si calcolano SEMPRE in tempo reale da `soggiorni`,
// unica fonte di verità già usata da /planning-camere. Nel wire format
// restano gli stessi due nomi di sempre per non toccare i consumatori
// frontend esistenti (home/page.jsx, camere/page.jsx): `partenza` = camera
// con un soggiorno non cancellato la cui data_partenza è la data richiesta
// (il cliente parte oggi); `arrivo` (mostrato in UI come "Fermata") = camera
// occupata da un soggiorno non cancellato che continua oltre la data
// richiesta (il cliente NON parte oggi). Le due condizioni sono derivate da
// soggiorni diversi e possono essere entrambe vere lo stesso giorno sulla
// stessa camera (turnover: chi parte la mattina + chi arriva nel pomeriggio
// e si ferma altre notti) — l'EXCLUDE anti-overbooking su `soggiorni`
// permette range adiacenti '[)' sulla stessa data, quindi il caso è
// legittimo, non un bug. Essendo calcolato a runtime, riflette sempre lo
// stato attuale di `soggiorni` anche se una prenotazione viene accorciata
// (partenza anticipata) dopo che il giorno era già stato classificato
// "Fermata" — nessun aggiornamento manuale necessario.
// Solo `pronta` (pulizia fatta/da fare) resta l'unico campo scrivibile a
// mano in `stato_camere`, insieme a `note` (usate anche dalla "scopetta" del
// planning). Le colonne arrivo/partenza di `stato_camere` restano nello
// schema per lo storico pre-5.1 ma non sono più lette né scritte da qui.
const CALCOLO_PARTENZA = `
  EXISTS (
    SELECT 1 FROM soggiorni sg
    WHERE sg.camera_id = c.id AND sg.cancellato = false AND sg.data_partenza = $1
  )
`;
const CALCOLO_FERMATA = `
  EXISTS (
    SELECT 1 FROM soggiorni sg
    WHERE sg.camera_id = c.id AND sg.cancellato = false
      AND sg.data_arrivo <= $1 AND sg.data_partenza > $1
  )
`;

const pool = require('../config/db');

// GET /api/camere?data=2026-06-28
// Ritorna tutte le 21 camere con il loro stato per la data richiesta.
// Se per una camera non esiste ancora un record, viene restituito con arrivo/partenza = false.
// tipo_camera_id/tipo_camera_nome/piano aggiunti per il modulo 2.2 (Tariffe) —
// servono in UI per assegnare la categoria e per il listino stagionale.
// ORDER BY con regex (fix 31/07/2026, da docs/EVOLUTIVE.md): prima gestiva
// solo il caso 'app' e faceva CAST diretto su tutto il resto — un numero non
// numerico diverso da 'app' rompeva l'intera query con 500. Stesso pattern
// già in uso in prenotazioniController.js (griglia): qualunque valore non
// puramente numerico va in fondo all'ordinamento, senza mai un CAST che
// possa fallire.
// Filtro attivo=true (modulo Impostazioni▸Camere, 31/07/2026): questo
// endpoint alimenta le viste operative del giorno (Stato Camere, scopetta
// del planning) — una camera disattivata non deve comparire qui di default.
// La pagina Impostazioni▸Camere, che deve invece poter vedere e riattivare
// le camere disattivate, passa ?tutte=true per saltare il filtro. Le query
// storiche con JOIN da soggiorni/stato_camere (es. scheda ospite, gruppi)
// NON vanno filtrate allo stesso modo: uno storico deve restare leggibile
// anche se la camera è stata disattivata nel frattempo.
async function lista(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  const soloAttive = req.query.tutte !== 'true';
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.numero, c.nome, c.piano, c.tipo_camera_id, tc.nome AS tipo_camera_nome,
        c.attivo,
        ${CALCOLO_FERMATA}  AS arrivo,
        ${CALCOLO_PARTENZA} AS partenza,
        COALESCE(s.pronta, false) AS pronta,
        s.note,
        s.updated_at,
        sogg.soggiorno_id, sogg.ospite_nome, sogg.ospite_cognome,
        man.manutenzione_priorita, man.manutenzione_descrizione
      FROM camere c
      LEFT JOIN stato_camere s ON s.camera_id = c.id AND s.data = $1
      LEFT JOIN tipi_camera tc ON tc.id = c.tipo_camera_id
      LEFT JOIN LATERAL (
        SELECT sg.id AS soggiorno_id, o.nome AS ospite_nome, o.cognome AS ospite_cognome
        FROM soggiorni sg
        JOIN ospiti o ON o.id = sg.ospite_id
        WHERE sg.camera_id = c.id AND sg.cancellato = false
          AND sg.data_arrivo <= $1 AND sg.data_partenza > $1
        LIMIT 1
      ) sogg ON true
      -- Manutenzione aperta (16/08/2026, punto 2 dell'evolutiva dashboard):
      -- segnalazioni_manutenzione non ha mai fatto JOIN verso questa vista
      -- operativa — era visibile solo nell'alert dashboard e nella pagina
      -- /manutenzione dedicata, non su Stato Camere dove lavora la
      -- cameriera/reception giorno per giorno. Solo la più urgente/vecchia
      -- (stesso ORDER BY già usato in dashboardController.js per l'alert),
      -- non filtrata per data: una segnalazione aperta resta rilevante finché
      -- non è risolta, indipendentemente dal giorno visualizzato.
      LEFT JOIN LATERAL (
        SELECT sm.priorita AS manutenzione_priorita, sm.descrizione AS manutenzione_descrizione
        FROM segnalazioni_manutenzione sm
        WHERE sm.camera_id = c.id AND sm.stato IN ('aperta', 'in_lavorazione')
        ORDER BY (sm.priorita = 'alta') DESC, sm.created_at ASC
        LIMIT 1
      ) man ON true
      ${soloAttive ? 'WHERE c.attivo = true' : ''}
      ORDER BY
        CASE WHEN c.numero ~ '^\\d+$' THEN c.numero::INTEGER ELSE 999999 END
    `, [data]);
    res.json({ camere: result.rows, data });
  } catch (err) {
    console.error('Errore lista camere:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/camere/:id/tipo — assegna la categoria (tipo_camera_id) a una
// camera. Solo admin/titolare (modulo 2.2). Usa la chiave 'error' (inglese,
// convenzione CLAUDE.md Sezione 5) invece di 'errore' come il resto di
// questo file: è codice nuovo, non una modifica alle funzioni esistenti —
// vedi docs/EVOLUTIVE.md per l'incoerenza errore/error già nota nel resto
// del gestionale, qui non si tocca il comportamento esistente.
async function aggiornaTipo(req, res) {
  const { tipo_camera_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE camere SET tipo_camera_id = $2
       WHERE id = $1
       RETURNING id, numero, nome, tipo_camera_id`,
      [req.params.id, tipo_camera_id ?? null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Camera non trovata.' });
    }
    // Fix 23/08/2026 (code review 22/08, Tier 2) — vedi collegaVenditaOnline.
    // Una camera assegnata a una categoria DOPO la creazione (percorso più
    // comune: crea() senza tipo, poi lo si assegna da qui) deve risultare
    // idonea alla vendita online tanto quanto una assegnata in creazione.
    await collegaVenditaOnline(tipo_camera_id ?? null, result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Tipo camera non valido.' });
    }
    console.error('Errore aggiornaTipo camera:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/camere/stato — salva la nota del giorno per una camera.
// Da modulo 5.1 (03/08/2026) NON accetta più arrivo/partenza: sono
// calcolati sempre da `soggiorni` (vedi commento in cima al file), passarli
// qui non avrebbe più alcun effetto — il body li ignora silenziosamente
// per non rompere eventuali client vecchi che li inviano ancora.
// Risposta: stato salvato + arrivo/partenza ricalcolati, stessa forma di
// prima (GET /api/camere), cosi il frontend non deve distinguere le due fonti.
async function aggiornaStato(req, res) {
  const { camera_id, data, note } = req.body;
  const dataRecord = data || new Date().toISOString().split('T')[0];
  if (!camera_id) return res.status(400).json({ errore: 'camera_id obbligatorio.' });
  try {
    await pool.query(`
      INSERT INTO stato_camere (camera_id, data, note, aggiornato_da, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (camera_id, data) DO UPDATE SET
        note          = EXCLUDED.note,
        aggiornato_da = EXCLUDED.aggiornato_da,
        updated_at    = NOW()
    `, [camera_id, dataRecord, note || null, req.utente.id]);

    const result = await pool.query(`
      SELECT c.id AS camera_id, s.pronta, s.note, s.updated_at,
             ${CALCOLO_FERMATA}  AS arrivo,
             ${CALCOLO_PARTENZA} AS partenza
      FROM camere c
      LEFT JOIN stato_camere s ON s.camera_id = c.id AND s.data = $1
      WHERE c.id = $2
    `, [dataRecord, camera_id]);

    res.json({ stato: { ...result.rows[0], pronta: result.rows[0]?.pronta ?? false } });
  } catch (err) {
    console.error('Errore aggiorna stato camera:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/camere/pronta — la cameriera marca una camera come pronta/non pronta
async function segnaPronte(req, res) {
  const { camera_id, data, pronta } = req.body;
  const dataRecord = data || new Date().toISOString().split('T')[0];
  if (!camera_id) return res.status(400).json({ errore: 'camera_id obbligatorio.' });
  try {
    // Crea il record se non esiste, altrimenti aggiorna solo il campo pronta
    await pool.query(`
      INSERT INTO stato_camere (camera_id, data, pronta, aggiornato_da, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (camera_id, data) DO UPDATE SET
        pronta        = EXCLUDED.pronta,
        aggiornato_da = EXCLUDED.aggiornato_da,
        updated_at    = NOW()
    `, [camera_id, dataRecord, pronta ?? true, req.utente.id]);
    res.json({ messaggio: 'Camera aggiornata.' });
  } catch (err) {
    console.error('Errore segna pronta:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/camere/oggi — riepilogo rapido per popup cameriera
// Ritorna solo le camere con arrivo (fermata) o partenza oggi, calcolati da
// soggiorni come in lista()/aggiornaStato() — vedi commento in cima al file.
async function oggi(req, res) {
  const data = new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(`
      SELECT c.numero, c.nome,
             ${CALCOLO_FERMATA}  AS arrivo,
             ${CALCOLO_PARTENZA} AS partenza,
             COALESCE(s.pronta, false) AS pronta,
             s.note
      FROM camere c
      LEFT JOIN stato_camere s ON s.camera_id = c.id AND s.data = $1
      WHERE c.attivo = true AND (${CALCOLO_FERMATA} OR ${CALCOLO_PARTENZA})
      ORDER BY
        CASE WHEN c.numero ~ '^\\d+$' THEN c.numero::INTEGER ELSE 999999 END
    `, [data]);
    res.json({ camere: result.rows, data });
  } catch (err) {
    console.error('Errore riepilogo camere oggi:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ── Anagrafica camere (Impostazioni▸Camere, 31/07/2026) ─────────────────────
// Crea/modifica/attiva-disattiva una camera fisica. Riservato ad
// admin/titolare (shared/ruoli.js, sezione 'camere'.'anagrafica').
// Usa la chiave 'error' (inglese), come aggiornaTipo — codice nuovo, stessa
// convenzione già adottata per quella funzione (vedi nota lì sopra).

// Collega una camera al suo tipo_camera in tipi_camera_camere — la tabella
// di idoneità letta dal Booking Engine Diretto (migration 050). Fix
// 23/08/2026 (code review 22/08, Tier 2): prima questo collegamento andava
// fatto SEMPRE a mano (script/SQL diretto) dopo aver creato o riassegnato
// una camera, altrimenti restava invisibile alla vendita online pur
// comparendo normalmente in reception/planning. Puramente ADDITIVO — mai
// una DELETE: una camera può essere idonea per PIÙ tipi contemporaneamente
// (shared inventory, es. camere 2/7/12/21 idonee sia a "Singola" sia a
// "Matrimoniale Piccola", vedi migration 050) e quelle associazioni
// aggiuntive restano sempre una decisione manuale del titolare in
// Impostazioni▸Camere — qui si collega solo l'etichetta fisica di default
// (camere.tipo_camera_id), mai si tocca o rimuove un collegamento esistente.
// ON CONFLICT DO NOTHING: la coppia potrebbe già esistere (es. tipo
// riassegnato allo stesso valore), non è un errore.
async function collegaVenditaOnline(tipoCameraId, cameraId) {
  if (!tipoCameraId) return;
  try {
    await pool.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tipoCameraId, cameraId]
    );
  } catch (err) {
    // Best-effort: la camera/il tipo sono già stati creati/aggiornati con
    // successo a questo punto — un problema qui non deve far fallire
    // l'operazione principale, solo essere loggato per un collegamento
    // manuale successivo.
    console.error(`collegaVenditaOnline (tipo=${tipoCameraId}, camera=${cameraId}) — errore imprevisto:`, err.message);
  }
}

// POST /api/camere — crea una nuova camera fisica.
// `nome` è NOT NULL sullo schema reale (scoperto in verifica locale, non
// documentato da nessuna migration — vedi nota sulla tabella `camere` non
// tracciata in docs/EVOLUTIVE.md): se lasciato vuoto in UI (è "opzionale"
// solo dal punto di vista dell'utente), va in fallback sul numero/codice.
async function crea(req, res) {
  const { numero, nome, piano, tipo_camera_id } = req.body;
  if (!numero || !String(numero).trim()) {
    return res.status(400).json({ error: 'Il numero/codice camera è obbligatorio.' });
  }
  try {
    // Fallback calcolato in JS (non con COALESCE($2, $1) in SQL): riusare
    // lo stesso parametro $1 in due punti della query con un tipo di dato
    // diverso dedotto dal contesto (character varying per la colonna
    // `numero`, text dentro COALESCE) fa fallire Postgres con "tipi di dati
    // dedotti per il parametro non consistenti" (42P08) — scoperto in
    // verifica locale.
    const numeroPulito = String(numero).trim();
    const nomeFinale = nome && String(nome).trim() ? String(nome).trim() : numeroPulito;
    const result = await pool.query(
      `INSERT INTO camere (numero, nome, piano, tipo_camera_id, attivo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [numeroPulito, nomeFinale, piano === '' || piano == null ? null : Number(piano), tipo_camera_id || null]
    );
    // Fix 23/08/2026 (code review 22/08, Tier 2) — vedi collegaVenditaOnline.
    await collegaVenditaOnline(tipo_camera_id || null, result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esiste già una camera con questo numero.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Categoria camera non valida.' });
    }
    console.error('crea camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/camere/:id — modifica numero/nome/piano di una camera esistente.
// `nome` è NOT NULL (vedi nota su crea() qui sopra): se omesso o svuotato
// dal form, resta invariato (COALESCE), non viene mai azzerato a NULL — un
// campo obbligatorio a livello di schema non può sparire da una modifica
// parziale. Non tocca tipo_camera_id (resta compito di PATCH /:id/tipo,
// modulo 2.2) né attivo (resta compito di PATCH /:id/attivo qui sotto) — un
// endpoint, una responsabilità, stesso principio già seguito nel resto del file.
async function modifica(req, res) {
  const { numero, nome, piano } = req.body;
  if (numero !== undefined && !String(numero).trim()) {
    return res.status(400).json({ error: 'Il numero/codice camera non può essere vuoto.' });
  }
  try {
    const result = await pool.query(
      `UPDATE camere
       SET numero = COALESCE($2, numero),
           nome   = COALESCE($3, nome),
           piano  = $4
       WHERE id = $1
       RETURNING *`,
      [req.params.id, numero !== undefined ? String(numero).trim() : null, nome && String(nome).trim() ? String(nome).trim() : null, piano === '' || piano == null ? null : Number(piano)]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Camera non trovata.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esiste già una camera con questo numero.' });
    }
    console.error('modifica camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PATCH /api/camere/:id/attivo — attiva/disattiva una camera. Mai una
// DELETE reale: la camera resta referenziata da soggiorni/stato_camere
// storici. Disattivazione bloccata (409) se esistono soggiorni non
// cancellati con partenza odierna o futura — non si può "far sparire" una
// camera con un soggiorno in corso o prenotato. Stesso pattern di
// PATCH /api/users/:id/attivo.
async function attivaDisattiva(req, res) {
  const { attivo } = req.body;
  if (typeof attivo !== 'boolean') {
    return res.status(400).json({ error: 'Il campo attivo (booleano) è obbligatorio.' });
  }
  try {
    if (attivo === false) {
      const inUso = await pool.query(
        `SELECT s.id FROM soggiorni s
         WHERE s.camera_id = $1 AND s.cancellato = false AND s.data_partenza >= CURRENT_DATE
         LIMIT 1`,
        [req.params.id]
      );
      if (inUso.rows.length) {
        return res.status(409).json({ error: 'Non puoi disattivare questa camera: ha soggiorni in corso o futuri.' });
      }
    }
    const result = await pool.query(
      `UPDATE camere SET attivo = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, attivo]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Camera non trovata.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('attivaDisattiva camera error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, aggiornaStato, segnaPronte, oggi, aggiornaTipo, crea, modifica, attivaDisattiva };
