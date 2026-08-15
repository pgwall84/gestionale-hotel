// Controller registro HACCP — temperature e scongelamento/cottura.
// Modulo 6.1, punti 1+2 (15/08/2026). Stesso principio di haccpController.js
// (checklist pulizie): registrazione manuale rapida, storico consultabile
// per ispezione ASL. A differenza della checklist (una riga fissa per
// attrezzatura al giorno, sovrascritta ad ogni salvataggio), qui ogni
// rilevazione è una riga a sé — più letture nello stesso giorno sullo
// stesso punto di controllo sono normali (es. frigo controllato mattina e
// sera), quindi niente DELETE+INSERT come nella checklist.

const pool = require('../config/db');
const { moduloAttivo } = require('./configurazioneHaccpController');

// Tipi di apparecchiatura confrontabili con una soglia statica min/max.
// 'abbattitore' NON è qui: il suo limite critico (registri_HACCP_A1_A8.xlsx
// + CSV soglie fornito dal titolare, 16/08/2026) è un tempo di discesa
// +65°C→+10°C in ≤ 2h, non un range statico — un confronto min/max sarebbe
// semplicemente sbagliato. Resta registrabile (temperatura letta), ma senza
// giudizio fuori-soglia finché non costruiamo un controllo a tempo dedicato
// (fuori scope di questa sessione — segnalato, non improvvisato).
const TIPI_CON_SOGLIA_STATICA = ['frigo', 'freezer'];

// Soglie di allarme (°C) per TIPO di apparecchiatura (non per singolo
// apparecchio): tutti i frigo condividono la stessa soglia, tutti i freezer
// idem — coerente col CSV fornito dal titolare il 16/08/2026. Valori
// confermati: frigo ≤ +4°C (target +2/+4°C), freezer ≤ −18°C.
const SOGLIE_TEMPERATURA = {
  frigo:   { min: -Infinity, max: 4 },
  freezer: { min: -Infinity, max: -18 },
};

// fuoriSoglia(tipo, valore) — tipo è quello dell'apparecchiatura
// (apparecchiature_haccp.tipo), non più il nome del punto di controllo.
function fuoriSoglia(tipo, valore) {
  if (!TIPI_CON_SOGLIA_STATICA.includes(tipo)) return null; // abbattitore e altri: nessun giudizio statico
  const soglia = SOGLIE_TEMPERATURA[tipo];
  if (!soglia) return null;
  return Number(valore) < soglia.min || Number(valore) > soglia.max;
}

// Soglie A.4 buffet (CSV soglie fornito dal titolare, 16/08/2026): freddo
// ≤ +5°C, caldo ≥ +60°C. Stesso principio di fuoriSoglia() sopra ma per
// tipologia_buffet invece che tipo apparecchiatura — non è la stessa tabella
// (non tutte le tipologie buffet mappano su un'apparecchiatura fissa), quindi
// una funzione a sé, non un riuso forzato di fuoriSoglia().
const SOGLIE_BUFFET = {
  freddo: { min: -Infinity, max: 5 },
  caldo:  { min: 60, max: Infinity },
};

function fuoriSogliaBuffet(tipologia, valore) {
  const soglia = SOGLIE_BUFFET[tipologia];
  if (!soglia) return null;
  return Number(valore) < soglia.min || Number(valore) > soglia.max;
}

// ─── Temperature ────────────────────────────────────────────────────────────

// GET /api/registro-haccp/temperature?data=2026-08-15
// "puntiMancanti" oggi = apparecchiature attive di tipo frigo/freezer/
// abbattitore senza nessuna lettura in data — gli altri tipi (cappa, forno,
// ecc.) non hanno temperatura da rilevare, sono solo per A.6 manutenzioni.
async function listaTemperature(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const [apparecchiatureRes, lettureRes] = await Promise.all([
      pool.query(
        `SELECT id, nome, tipo, ubicazione FROM apparecchiature_haccp
         WHERE attivo = true AND tipo IN ('frigo', 'freezer', 'abbattitore')
         ORDER BY tipo, nome`
      ),
      pool.query(
        `SELECT t.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome,
                a.nome AS apparecchio_nome, a.tipo AS apparecchio_tipo, a.ubicazione AS apparecchio_ubicazione
         FROM registro_temperature t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN apparecchiature_haccp a ON a.id = t.apparecchiatura_id
         WHERE t.data = $1 ORDER BY t.ora DESC`,
        [data]
      ),
    ]);

    const letture = lettureRes.rows.map(r => ({ ...r, fuoriSoglia: fuoriSoglia(r.apparecchio_tipo, r.valore) }));
    const apparecchiRilevatiOggi = new Set(letture.map(l => l.apparecchiatura_id).filter(Boolean));
    const puntiMancanti = apparecchiatureRes.rows.filter(a => !apparecchiRilevatiOggi.has(a.id));

    res.json({ letture, apparecchiature: apparecchiatureRes.rows, puntiMancanti });
  } catch (err) {
    console.error('Errore lista registro temperature:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/temperature
async function creaTemperatura(req, res) {
  const { apparecchiatura_id, valore, data, note, azione_correttiva } = req.body;
  if (!apparecchiatura_id || valore === undefined || valore === null || valore === '') {
    return res.status(400).json({ errore: 'apparecchiatura_id e valore sono obbligatori.' });
  }
  try {
    const app = await pool.query('SELECT tipo FROM apparecchiature_haccp WHERE id = $1 AND attivo = true', [apparecchiatura_id]);
    if (!app.rows.length) {
      return res.status(404).json({ errore: 'Apparecchiatura non trovata o non attiva.' });
    }
    const tipo = app.rows[0].tipo;
    const result = await pool.query(
      `INSERT INTO registro_temperature (apparecchiatura_id, valore, data, user_id, note, azione_correttiva)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6) RETURNING *`,
      [apparecchiatura_id, valore, data || null, req.utente.id, note || null, azione_correttiva || null]
    );
    res.status(201).json({ temperatura: { ...result.rows[0], fuoriSoglia: fuoriSoglia(tipo, valore) } });
  } catch (err) {
    console.error('Errore crea registro temperatura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/temperature/:id — corregge un inserimento sbagliato
async function eliminaTemperatura(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_temperature WHERE id = $1', [id]);
    res.json({ messaggio: 'Rilevazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro temperatura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/temperature/storico?da=2026-07-01&a=2026-07-31 — per ispezione ASL
async function storicoTemperature(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT t.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome,
              a.nome AS apparecchio_nome, a.tipo AS apparecchio_tipo, a.ubicazione AS apparecchio_ubicazione
       FROM registro_temperature t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN apparecchiature_haccp a ON a.id = t.apparecchiatura_id
       WHERE t.data BETWEEN $1 AND $2
       ORDER BY t.data DESC, t.ora DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    const storico = result.rows.map(r => ({ ...r, fuoriSoglia: fuoriSoglia(r.apparecchio_tipo, r.valore) }));
    res.json({ storico });
  } catch (err) {
    console.error('Errore storico registro temperature:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── Scongelamento / cottura ────────────────────────────────────────────────

// GET /api/registro-haccp/cottura?data=2026-08-15
async function listaCottura(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT c.*, u.nome, u.cognome, mp.nome AS piatto_nome
       FROM registro_cottura c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN menu_piatti mp ON mp.id = c.menu_piatto_id
       WHERE c.data = $1 ORDER BY c.ora DESC`,
      [data]
    );
    res.json({ registrazioni: result.rows });
  } catch (err) {
    console.error('Errore lista registro cottura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/cottura
// lotto_partita/limite_critico/tempo_cottura_min/azione_correttiva aggiunti
// in sessione 4 (migration 045) per allinearsi al template A.3 — vedi nota
// nella migration sul perché limite_critico resta testo libero.
async function creaCottura(req, res) {
  const {
    tipo, prodotto, menu_piatto_id, metodo, temperatura_cuore, data, note,
    lotto_partita, limite_critico, tempo_cottura_min, azione_correttiva,
  } = req.body;
  if (!tipo || !['scongelamento', 'cottura'].includes(tipo)) {
    return res.status(400).json({ errore: "tipo obbligatorio, deve essere 'scongelamento' o 'cottura'." });
  }
  if (!prodotto) {
    return res.status(400).json({ errore: 'prodotto è obbligatorio.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO registro_cottura
         (tipo, prodotto, menu_piatto_id, metodo, temperatura_cuore, data, user_id, note,
          lotto_partita, limite_critico, tempo_cottura_min, azione_correttiva)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8, $9, $10, $11, $12) RETURNING *`,
      [tipo, prodotto, menu_piatto_id || null, metodo || null, temperatura_cuore || null,
       data || null, req.utente.id, note || null,
       lotto_partita || null, limite_critico || null, tempo_cottura_min || null, azione_correttiva || null]
    );
    res.status(201).json({ registrazione: result.rows[0] });
  } catch (err) {
    console.error('Errore crea registro cottura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/cottura/:id
async function eliminaCottura(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_cottura WHERE id = $1', [id]);
    res.json({ messaggio: 'Registrazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro cottura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/cottura/storico?da=&a= — per ispezione ASL
async function storicoCottura(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT c.*, u.nome, u.cognome, mp.nome AS piatto_nome
       FROM registro_cottura c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN menu_piatti mp ON mp.id = c.menu_piatto_id
       WHERE c.data BETWEEN $1 AND $2
       ORDER BY c.data DESC, c.ora DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico registro cottura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── A.1 — Ricevimento merci (sessione 2, 16/08/2026) ──────────────────────
// Sempre attivo (obbligatorio, "regola pratica" del titolare) — nessun
// controllo moduloAttivo qui, a differenza di A.4 buffet sotto.

// GET /api/registro-haccp/ricevimento?data=2026-08-16
async function listaRicevimento(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT r.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_ricevimento_merci r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.data = $1 ORDER BY r.created_at DESC`,
      [data]
    );
    res.json({ ricevimenti: result.rows });
  } catch (err) {
    console.error('Errore lista registro ricevimento merci:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/ricevimento
async function creaRicevimento(req, res) {
  const {
    fornitore, prodotto, lotto, scadenza_tmc, quantita, unita_misura,
    temp_ricevimento, integrita_confezione, esito, azione_correttiva, data, note,
  } = req.body;
  if (!fornitore?.trim() || !prodotto?.trim()) {
    return res.status(400).json({ errore: 'fornitore e prodotto sono obbligatori.' });
  }
  if (!['conforme', 'non_conforme'].includes(esito)) {
    return res.status(400).json({ errore: "esito obbligatorio, deve essere 'conforme' o 'non_conforme'." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO registro_ricevimento_merci
         (fornitore, prodotto, lotto, scadenza_tmc, quantita, unita_misura,
          temp_ricevimento, integrita_confezione, esito, azione_correttiva, data, user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, CURRENT_DATE), $12, $13)
       RETURNING *`,
      [fornitore.trim(), prodotto.trim(), lotto || null, scadenza_tmc || null,
       quantita || null, unita_misura || null, temp_ricevimento ?? null,
       integrita_confezione || null, esito, azione_correttiva || null,
       data || null, req.utente.id, note || null]
    );
    res.status(201).json({ ricevimento: result.rows[0] });
  } catch (err) {
    console.error('Errore crea registro ricevimento merci:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/ricevimento/:id
async function eliminaRicevimento(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_ricevimento_merci WHERE id = $1', [id]);
    res.json({ messaggio: 'Registrazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro ricevimento merci:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/ricevimento/storico?da=&a= — per ispezione ASL
async function storicoRicevimento(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT r.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_ricevimento_merci r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.data BETWEEN $1 AND $2
       ORDER BY r.data DESC, r.created_at DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico registro ricevimento merci:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── A.4 — Buffet (sessione 2, 16/08/2026) ─────────────────────────────────
// Modulo "in forse" (configurazione_moduli_haccp.modulo = 'buffet'): la
// lettura resta sempre possibile (storico non si nasconde mai), ma la
// creazione di nuove righe è bloccata se il titolare l'ha spenta da
// /impostazioni/haccp — il tab nel frontend si nasconde comunque via
// GET /impostazioni/haccp/moduli, questo è un controllo di backup lato server.

// GET /api/registro-haccp/buffet?data=2026-08-16
async function listaBuffet(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT b.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_buffet b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.data = $1 ORDER BY b.ora DESC`,
      [data]
    );
    const rilevazioni = result.rows.map(r => ({
      ...r, fuoriSoglia: fuoriSogliaBuffet(r.tipologia_buffet, r.temp_rilevata),
    }));
    res.json({ rilevazioni });
  } catch (err) {
    console.error('Errore lista registro buffet:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/buffet
async function creaBuffet(req, res) {
  const { tipologia_buffet, prodotto_vaschetta, temp_rilevata, azione_correttiva, data, note } = req.body;
  if (!['freddo', 'caldo'].includes(tipologia_buffet)) {
    return res.status(400).json({ errore: "tipologia_buffet obbligatoria, deve essere 'freddo' o 'caldo'." });
  }
  if (!prodotto_vaschetta?.trim() || temp_rilevata === undefined || temp_rilevata === null || temp_rilevata === '') {
    return res.status(400).json({ errore: 'prodotto_vaschetta e temp_rilevata sono obbligatori.' });
  }
  try {
    if (!(await moduloAttivo('buffet'))) {
      return res.status(403).json({ errore: 'Il modulo buffet (A.4) è spento in Impostazioni HACCP.' });
    }
    const result = await pool.query(
      `INSERT INTO registro_buffet
         (tipologia_buffet, prodotto_vaschetta, temp_rilevata, azione_correttiva, data, user_id, note)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7) RETURNING *`,
      [tipologia_buffet, prodotto_vaschetta.trim(), temp_rilevata, azione_correttiva || null,
       data || null, req.utente.id, note || null]
    );
    res.status(201).json({ rilevazione: { ...result.rows[0], fuoriSoglia: fuoriSogliaBuffet(tipologia_buffet, temp_rilevata) } });
  } catch (err) {
    console.error('Errore crea registro buffet:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/buffet/:id
async function eliminaBuffet(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_buffet WHERE id = $1', [id]);
    res.json({ messaggio: 'Rilevazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro buffet:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/buffet/storico?da=&a= — per ispezione ASL
async function storicoBuffet(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT b.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_buffet b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.data BETWEEN $1 AND $2
       ORDER BY b.data DESC, b.ora DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    const storico = result.rows.map(r => ({ ...r, fuoriSoglia: fuoriSogliaBuffet(r.tipologia_buffet, r.temp_rilevata) }));
    res.json({ storico });
  } catch (err) {
    console.error('Errore storico registro buffet:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/apparecchiature — elenco apparecchiature attive di
// TUTTI i tipi (non solo frigo/freezer/abbattitore come in listaTemperature),
// per il form A.6 manutenzioni. Diversa da GET /impostazioni/haccp/
// apparecchiature (soloTitolare, include anche le disattivate per la UI di
// modifica): qui serve solo la lista utile a compilare un intervento,
// leggibile da chiunque abbia la sezione haccp.
async function apparecchiatureAttive(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, nome, tipo, ubicazione FROM apparecchiature_haccp WHERE attivo = true ORDER BY tipo, nome`
    );
    res.json({ apparecchiature: result.rows });
  } catch (err) {
    console.error('Errore lista apparecchiature attive:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── A.6 — Manutenzioni programmate (sessione 3, 16/08/2026) ──────────────
// Modulo "in forse" (configurazione_moduli_haccp.modulo =
// 'manutenzioni_programmate'): stesso principio di A.4 buffet — lettura
// sempre possibile, scrittura bloccata se il titolare l'ha spenta.
// "attrezzatura"/"ubicazione" del template letti via JOIN su
// apparecchiature_haccp, non duplicati (anagrafica condivisa con A.2).

// GET /api/registro-haccp/manutenzioni?data=2026-08-16
async function listaManutenzioni(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT m.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome,
              a.nome AS apparecchio_nome, a.ubicazione AS apparecchio_ubicazione
       FROM registro_manutenzioni m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN apparecchiature_haccp a ON a.id = m.apparecchiatura_id
       WHERE m.data = $1 ORDER BY m.created_at DESC`,
      [data]
    );
    res.json({ manutenzioni: result.rows });
  } catch (err) {
    console.error('Errore lista registro manutenzioni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/manutenzioni
async function creaManutenzione(req, res) {
  const {
    apparecchiatura_id, tipo_intervento, descrizione_intervento, ditta_operatore,
    pezzi_sostituiti, esito, prossima_manutenzione, firma_responsabile, data, note,
  } = req.body;
  if (!apparecchiatura_id) {
    return res.status(400).json({ errore: 'apparecchiatura_id è obbligatorio.' });
  }
  if (!['eseguita', 'non_eseguita'].includes(esito)) {
    return res.status(400).json({ errore: "esito obbligatorio, deve essere 'eseguita' o 'non_eseguita'." });
  }
  try {
    if (!(await moduloAttivo('manutenzioni_programmate'))) {
      return res.status(403).json({ errore: 'Il modulo manutenzioni programmate (A.6) è spento in Impostazioni HACCP.' });
    }
    const app = await pool.query('SELECT id FROM apparecchiature_haccp WHERE id = $1 AND attivo = true', [apparecchiatura_id]);
    if (!app.rows.length) {
      return res.status(404).json({ errore: 'Apparecchiatura non trovata o non attiva.' });
    }
    const result = await pool.query(
      `INSERT INTO registro_manutenzioni
         (apparecchiatura_id, tipo_intervento, descrizione_intervento, ditta_operatore,
          pezzi_sostituiti, esito, prossima_manutenzione, firma_responsabile, data, user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE), $10, $11) RETURNING *`,
      [apparecchiatura_id, tipo_intervento || null, descrizione_intervento || null, ditta_operatore || null,
       pezzi_sostituiti || null, esito, prossima_manutenzione || null, firma_responsabile || null,
       data || null, req.utente.id, note || null]
    );
    res.status(201).json({ manutenzione: result.rows[0] });
  } catch (err) {
    console.error('Errore crea registro manutenzioni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/manutenzioni/:id
async function eliminaManutenzione(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_manutenzioni WHERE id = $1', [id]);
    res.json({ messaggio: 'Registrazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro manutenzioni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/manutenzioni/storico?da=&a= — per ispezione ASL
async function storicoManutenzioni(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT m.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome,
              a.nome AS apparecchio_nome, a.ubicazione AS apparecchio_ubicazione
       FROM registro_manutenzioni m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN apparecchiature_haccp a ON a.id = m.apparecchiatura_id
       WHERE m.data BETWEEN $1 AND $2
       ORDER BY m.data DESC, m.created_at DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico registro manutenzioni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── A.7 — Formazione (sessione 3, 16/08/2026) ─────────────────────────────
// Sempre attivo (obbligatorio). "nome_cognome" resta testo libero — vedi
// nota nella migration 044 (il partecipante può non essere ancora censito
// come utente del gestionale, o essere il docente esterno).

// GET /api/registro-haccp/formazione?data=2026-08-16
async function listaFormazione(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT f.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_formazione f
       LEFT JOIN users u ON u.id = f.user_id
       WHERE f.data = $1 ORDER BY f.created_at DESC`,
      [data]
    );
    res.json({ formazioni: result.rows });
  } catch (err) {
    console.error('Errore lista registro formazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/formazione
async function creaFormazione(req, res) {
  const {
    nome_cognome, qualifica_ruolo, titolo_corso, durata_ore, contenuti,
    docente_ente, attestato, numero_attestato, firma_partecipante, data, note,
  } = req.body;
  if (!nome_cognome?.trim() || !titolo_corso?.trim()) {
    return res.status(400).json({ errore: 'nome_cognome e titolo_corso sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO registro_formazione
         (nome_cognome, qualifica_ruolo, titolo_corso, durata_ore, contenuti,
          docente_ente, attestato, numero_attestato, firma_partecipante, data, user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_DATE), $11, $12) RETURNING *`,
      [nome_cognome.trim(), qualifica_ruolo || null, titolo_corso.trim(), durata_ore || null,
       contenuti || null, docente_ente || null, !!attestato, numero_attestato || null,
       !!firma_partecipante, data || null, req.utente.id, note || null]
    );
    res.status(201).json({ formazione: result.rows[0] });
  } catch (err) {
    console.error('Errore crea registro formazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/formazione/:id
async function eliminaFormazione(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_formazione WHERE id = $1', [id]);
    res.json({ messaggio: 'Registrazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro formazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/formazione/storico?da=&a= — per ispezione ASL
async function storicoFormazione(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT f.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_formazione f
       LEFT JOIN users u ON u.id = f.user_id
       WHERE f.data BETWEEN $1 AND $2
       ORDER BY f.data DESC, f.created_at DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico registro formazione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── A.8 — Controllo infestanti (sessione 3, 16/08/2026) ───────────────────
// Sempre attivo (obbligatorio). "firma_responsabile" resta testo libero —
// spesso è la ditta esterna di disinfestazione, non un utente del gestionale.

// GET /api/registro-haccp/infestanti?data=2026-08-16
async function listaInfestanti(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT i.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_infestanti i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.data = $1 ORDER BY i.created_at DESC`,
      [data]
    );
    res.json({ controlli: result.rows });
  } catch (err) {
    console.error('Errore lista registro infestanti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/registro-haccp/infestanti
async function creaInfestanti(req, res) {
  const { tipo_controllo, punti_controllati, esito, azioni_effettuate, prossimo_controllo, firma_responsabile, data, note } = req.body;
  if (!['nessuna_traccia', 'presenza_rilevata'].includes(esito)) {
    return res.status(400).json({ errore: "esito obbligatorio, deve essere 'nessuna_traccia' o 'presenza_rilevata'." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO registro_infestanti
         (tipo_controllo, punti_controllati, esito, azioni_effettuate, prossimo_controllo, firma_responsabile, data, user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9) RETURNING *`,
      [tipo_controllo || null, punti_controllati || null, esito, azioni_effettuate || null,
       prossimo_controllo || null, firma_responsabile || null, data || null, req.utente.id, note || null]
    );
    res.status(201).json({ controllo: result.rows[0] });
  } catch (err) {
    console.error('Errore crea registro infestanti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/registro-haccp/infestanti/:id
async function eliminaInfestanti(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_infestanti WHERE id = $1', [id]);
    res.json({ messaggio: 'Registrazione eliminata.' });
  } catch (err) {
    console.error('Errore elimina registro infestanti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/infestanti/storico?da=&a= — per ispezione ASL
async function storicoInfestanti(req, res) {
  const { da, a } = req.query;
  try {
    const result = await pool.query(
      `SELECT i.*, u.nome AS operatore_nome, u.cognome AS operatore_cognome
       FROM registro_infestanti i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.data BETWEEN $1 AND $2
       ORDER BY i.data DESC, i.created_at DESC`,
      [da || '2020-01-01', a || new Date().toISOString().split('T')[0]]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('Errore storico registro infestanti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ─── Export (sessione 4, 16/08/2026) ───────────────────────────────────────
// L'export ispezione ad-hoc costruito in sessione precedente (datiIspezione/
// ispezioneJson/ispezioneExcel: 5 fogli con intestazioni inventate, tracciava
// la formazione dalle scadenze invece che dal registro A.7 vero) è stato
// SOSTITUITO da `esportazioneHaccpController.js` — export per singolo
// registro + omnicomprensivo, tutti sugli 8 fogli del template
// registri_HACCP_A1_A8.xlsx con le intestazioni ESATTE lette dal file
// originale (non tradotte in italiano leggibile: è la richiesta esplicita
// del titolare, "formato esatto del template"). Vedi routes/registroHaccp.js
// per i nuovi endpoint /export/*. Tracciabilità fornitori (movimenti_
// magazzino) non è più un foglio a sé nell'omnicomprensivo: i dati restano
// disponibili da Magazzino, ma non fanno parte di nessuno degli 8 registri
// del template, quindi non hanno più un foglio dedicato in questo export
// (nessuna perdita di dati, solo non più duplicati qui).

module.exports = {
  fuoriSoglia, fuoriSogliaBuffet, // esportate per dashboardController.js (alert)
  apparecchiatureAttive,
  listaTemperature, creaTemperatura, eliminaTemperatura, storicoTemperature,
  listaCottura, creaCottura, eliminaCottura, storicoCottura,
  listaRicevimento, creaRicevimento, eliminaRicevimento, storicoRicevimento,
  listaBuffet, creaBuffet, eliminaBuffet, storicoBuffet,
  listaManutenzioni, creaManutenzione, eliminaManutenzione, storicoManutenzioni,
  listaFormazione, creaFormazione, eliminaFormazione, storicoFormazione,
  listaInfestanti, creaInfestanti, eliminaInfestanti, storicoInfestanti,
};
