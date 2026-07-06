// Controller comande — gestione comande, righe e monitor cucina SSE.
// Flusso: cameriere apre comanda → aggiunge piatti → cucina aggiorna stati → cameriere serve → chiudi.
// SSE cucina:    tablet a parete su /cucina/stream — tutti i cambi stato
// SSE cameriere: telefono cameriere su /sala/stream — solo evento 'riga_pronta'

const pool = require('../config/db');

// Set di client SSE per canale cucina e canale sala (camerieri)
const clientiCucina    = new Set();
const clientiCameriere = new Set();

function broadcastCucina(evento, dati) {
  const payload = `data: ${JSON.stringify({ evento, ...dati })}\n\n`;
  for (const client of clientiCucina) {
    try { client.res.write(payload); } catch (_) {}
  }
}

function broadcastCameriere(evento, dati) {
  const payload = `data: ${JSON.stringify({ evento, ...dati })}\n\n`;
  for (const client of clientiCameriere) {
    try { client.res.write(payload); } catch (_) {}
  }
}

// ── SSE monitor cucina ────────────────────────────────────────────────────────

// GET /api/ristorante/cucina/stream — connessione SSE persistente per il tablet cucina
// Accessibile a: cuoco, titolare, admin, portiere_notte
async function streamCucina(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disabilita buffering Nginx
  res.flushHeaders();

  // Invia subito lo stato attuale delle comande aperte
  try {
    const [rRighe, rAllergie] = await Promise.all([
      pool.query(`
        SELECT cr.id, cr.comanda_id, cr.quantita, cr.note, cr.stato,
               cr.tipo_speciale, cr.motivo_speciale, cr.timestamp_pronto,
               mp.nome AS piatto_nome,
               mp.allergeni,
               t.numero AS tavolo_numero,
               c.timestamp_apertura
        FROM comande_righe cr
        JOIN comande c ON c.id = cr.comanda_id AND c.stato = 'aperta'
        JOIN tavoli t ON t.id = c.tavolo_id
        JOIN menu_piatti mp ON mp.id = cr.piatto_id
        WHERE cr.stato != 'servito'
        ORDER BY c.timestamp_apertura, cr.id
      `),
      pool.query(
        'SELECT note_allergie FROM ospiti_giornalieri WHERE data = CURRENT_DATE LIMIT 1'
      ),
    ]);
    const note_allergie_oggi = rAllergie.rows[0]?.note_allergie || null;
    res.write(`data: ${JSON.stringify({ evento: 'stato_iniziale', righe: rRighe.rows, note_allergie_oggi })}\n\n`);
  } catch (err) {
    console.error('SSE stato iniziale error:', err);
  }

  const client = { res, id: Date.now() };
  clientiCucina.add(client);

  // Heartbeat ogni 30s per mantenere la connessione viva attraverso proxy/firewall
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 30000);

  // Cleanup alla chiusura della connessione
  req.on('close', () => {
    clearInterval(heartbeat);
    clientiCucina.delete(client);
  });
}

// GET /api/ristorante/sala/stream — SSE per camerieri
// Invia stato iniziale (righe pronte non ancora servite) + eventi riga_pronta e comanda_chiusa.
// Accessibile a: cameriere, titolare, admin, receptionist
async function streamSala(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Stato iniziale: righe già pronte che attendono il cameriere
  try {
    const r = await pool.query(`
      SELECT cr.id, cr.comanda_id, cr.quantita, cr.stato,
             mp.nome AS piatto_nome,
             t.numero AS tavolo_numero
      FROM comande_righe cr
      JOIN comande c ON c.id = cr.comanda_id AND c.stato = 'aperta'
      JOIN tavoli t ON t.id = c.tavolo_id
      JOIN menu_piatti mp ON mp.id = cr.piatto_id
      WHERE cr.stato = 'pronto'
      ORDER BY cr.timestamp_pronto
    `);
    res.write(`data: ${JSON.stringify({ evento: 'stato_iniziale', righe: r.rows })}\n\n`);
  } catch (err) {
    console.error('SSE sala stato iniziale error:', err);
  }

  const client = { res, id: Date.now() };
  clientiCameriere.add(client);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientiCameriere.delete(client);
  });
}

// ── Comande ───────────────────────────────────────────────────────────────────

// GET /api/ristorante/comande — comande aperte oggi
// Accessibile a: cameriere, titolare, admin
async function listaComande(req, res) {
  try {
    const r = await pool.query(`
      SELECT c.id, c.tavolo_id, c.cameriere_id, c.stato, c.ospite_hotel,
             c.timestamp_apertura, c.timestamp_chiusura,
             t.numero AS tavolo_numero,
             u.nome AS cameriere_nome,
             COUNT(cr.id) AS totale_righe,
             COUNT(cr.id) FILTER (WHERE cr.stato = 'in_attesa') AS righe_in_attesa
      FROM comande c
      JOIN tavoli t ON t.id = c.tavolo_id
      LEFT JOIN users u ON u.id = c.cameriere_id
      LEFT JOIN comande_righe cr ON cr.comanda_id = c.id
      WHERE c.stato = 'aperta'
        AND c.timestamp_apertura::date = CURRENT_DATE
      GROUP BY c.id, t.numero, u.nome
      ORDER BY c.timestamp_apertura
    `);
    res.json({ comande: r.rows });
  } catch (err) {
    console.error('listaComande error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ristorante/comande — apri comanda su un tavolo
// Accessibile a: cameriere, titolare, admin
async function apriComanda(req, res) {
  const { tavolo_id, ospite_hotel } = req.body;
  if (!tavolo_id) return res.status(400).json({ errore: 'tavolo_id obbligatorio.' });
  try {
    // Verifica che il tavolo non abbia già una comanda aperta
    const esistente = await pool.query(
      'SELECT id FROM comande WHERE tavolo_id = $1 AND stato = $2',
      [tavolo_id, 'aperta']
    );
    if (esistente.rows.length) {
      return res.status(409).json({
        errore: 'Il tavolo ha già una comanda aperta.',
        comanda_id: esistente.rows[0].id,
      });
    }
    const r = await pool.query(
      `INSERT INTO comande (tavolo_id, cameriere_id, stato, ospite_hotel)
       VALUES ($1, $2, 'aperta', $3) RETURNING *`,
      [tavolo_id, req.utente.id, ospite_hotel ?? false]
    );
    broadcastCucina('comanda_aperta',    { comanda: r.rows[0] });
    broadcastCameriere('comanda_aperta', { comanda: r.rows[0] });
    res.status(201).json({ comanda: r.rows[0] });
  } catch (err) {
    console.error('apriComanda error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/ristorante/comande/:id — dettaglio comanda con righe e prezzi
// Accessibile a: cameriere, cuoco, titolare, admin
async function dettaglioComanda(req, res) {
  try {
    const comanda = await pool.query(`
      SELECT c.*, t.numero AS tavolo_numero, u.nome AS cameriere_nome
      FROM comande c
      JOIN tavoli t ON t.id = c.tavolo_id
      LEFT JOIN users u ON u.id = c.cameriere_id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!comanda.rows.length) return res.status(404).json({ errore: 'Comanda non trovata.' });

    const righe = await pool.query(`
      SELECT cr.id, cr.piatto_id, cr.quantita, cr.note, cr.stato,
             cr.tipo_speciale, cr.motivo_speciale, cr.timestamp_pronto,
             mp.nome AS piatto_nome, mp.prezzo, mp.allergeni,
             mp.descrizione
      FROM comande_righe cr
      JOIN menu_piatti mp ON mp.id = cr.piatto_id
      WHERE cr.comanda_id = $1
      ORDER BY cr.id
    `, [req.params.id]);

    res.json({ comanda: comanda.rows[0], righe: righe.rows });
  } catch (err) {
    console.error('dettaglioComanda error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ristorante/comande/:id/righe — aggiungi piatto alla comanda
// Accessibile a: cameriere, titolare, admin
async function aggiungiRiga(req, res) {
  const { piatto_id, quantita, note } = req.body;
  if (!piatto_id) return res.status(400).json({ errore: 'piatto_id obbligatorio.' });
  try {
    // Verifica che la comanda sia aperta
    const comanda = await pool.query(
      'SELECT id, stato FROM comande WHERE id = $1',
      [req.params.id]
    );
    if (!comanda.rows.length) return res.status(404).json({ errore: 'Comanda non trovata.' });
    if (comanda.rows[0].stato !== 'aperta') {
      return res.status(409).json({ errore: 'Comanda non aperta — impossibile aggiungere piatti.' });
    }

    const r = await pool.query(
      `INSERT INTO comande_righe (comanda_id, piatto_id, quantita, note, stato)
       VALUES ($1, $2, $3, $4, 'in_attesa') RETURNING *`,
      [req.params.id, piatto_id, quantita ?? 1, note || null]
    );

    // Recupera nome piatto, allergeni e numero tavolo per il broadcast SSE
    const info = await pool.query(`
      SELECT mp.nome AS piatto_nome, mp.allergeni, t.numero AS tavolo_numero
      FROM comande c
      JOIN tavoli t ON t.id = c.tavolo_id
      JOIN menu_piatti mp ON mp.id = $1
      WHERE c.id = $2
    `, [piatto_id, req.params.id]);

    broadcastCucina('nuova_riga', {
      riga: {
        ...r.rows[0],
        piatto_nome:   info.rows[0]?.piatto_nome,
        allergeni:     info.rows[0]?.allergeni,
        tavolo_numero: info.rows[0]?.tavolo_numero,
      },
    });

    res.status(201).json({ riga: r.rows[0] });
  } catch (err) {
    console.error('aggiungiRiga error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/ristorante/comande/righe/:rigaId — rimuovi piatto dalla comanda
// Accessibile a: cameriere, titolare, admin (solo se in_attesa)
async function rimuoviRiga(req, res) {
  try {
    const riga = await pool.query(
      'SELECT id, stato FROM comande_righe WHERE id = $1',
      [req.params.rigaId]
    );
    if (!riga.rows.length) {
      return res.status(404).json({ errore: 'Riga non trovata.' });
    }
    if (riga.rows[0].stato !== 'in_attesa') {
      return res.status(400).json({ errore: 'La riga è già in preparazione e non può essere rimossa.' });
    }
    await pool.query('DELETE FROM comande_righe WHERE id = $1', [req.params.rigaId]);
    broadcastCucina('riga_rimossa', { riga_id: req.params.rigaId });
    res.json({ messaggio: 'Piatto rimosso dalla comanda.' });
  } catch (err) {
    console.error('rimuoviRiga error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ristorante/comande/righe/:rigaId/stato — cuoco aggiorna stato riga
// Transizioni valide per ruolo:
//   cuoco/admin/titolare: in_attesa → in_preparazione → pronto
//   cameriere/admin/titolare: pronto → servito
async function aggiornaStatoRiga(req, res) {
  const { stato } = req.body;
  const statiValidi = ['in_attesa', 'in_preparazione', 'pronto', 'servito'];
  if (!stato || !statiValidi.includes(stato)) {
    return res.status(400).json({ errore: `Stato non valido. Valori: ${statiValidi.join(', ')}.` });
  }

  // Transizioni ammesse: ogni stato può avanzare solo al successivo
  const successivo = { in_attesa: 'in_preparazione', in_preparazione: 'pronto', pronto: 'servito' };

  // Ruoli che possono impostare ogni stato di destinazione
  const ruoliPerStato = {
    in_preparazione: ['admin', 'titolare', 'cuoco'],
    pronto:          ['admin', 'titolare', 'cuoco'],
    servito:         ['admin', 'titolare', 'cameriere'],
    in_attesa:       [],  // nessuno può tornare indietro via API
  };

  const ruoloUtente = req.utente.ruolo;

  if (!ruoliPerStato[stato]?.includes(ruoloUtente)) {
    return res.status(403).json({ errore: `Il ruolo '${ruoloUtente}' non può impostare lo stato '${stato}'.` });
  }

  try {
    const rigaAtt = await pool.query(
      'SELECT id, stato FROM comande_righe WHERE id = $1',
      [req.params.rigaId]
    );
    if (!rigaAtt.rows.length) return res.status(404).json({ errore: 'Riga non trovata.' });

    const statoAttuale = rigaAtt.rows[0].stato;
    if (successivo[statoAttuale] !== stato) {
      return res.status(400).json({
        errore: `Transizione non valida: da '${statoAttuale}' non si può passare a '${stato}'. Prossimo stato atteso: '${successivo[statoAttuale] ?? 'nessuno'}'.`,
      });
    }

    let r;
    if (stato === 'pronto') {
      r = await pool.query(
        'UPDATE comande_righe SET stato = $1, timestamp_pronto = NOW() WHERE id = $2 RETURNING *',
        [stato, req.params.rigaId]
      );
    } else {
      r = await pool.query(
        'UPDATE comande_righe SET stato = $1 WHERE id = $2 RETURNING *',
        [stato, req.params.rigaId]
      );
    }

    broadcastCucina('stato_riga_aggiornato', { riga: r.rows[0] });

    // Notifica i camerieri quando un piatto è pronto o viene servito
    if (stato === 'pronto' || stato === 'servito') {
      const info = await pool.query(`
        SELECT mp.nome AS piatto_nome, t.numero AS tavolo_numero, cr.quantita, cr.comanda_id
        FROM comande_righe cr
        JOIN comande c ON c.id = cr.comanda_id
        JOIN tavoli t ON t.id = c.tavolo_id
        JOIN menu_piatti mp ON mp.id = cr.piatto_id
        WHERE cr.id = $1
      `, [req.params.rigaId]);
      if (info.rows.length) {
        const evento = stato === 'pronto' ? 'riga_pronta' : 'riga_servita';
        broadcastCameriere(evento, { riga: { ...r.rows[0], ...info.rows[0] } });
      }
    }

    res.json({ riga: r.rows[0] });
  } catch (err) {
    console.error('aggiornaStatoRiga error:', err.message, err.detail);
    res.status(500).json({ errore: 'Errore interno del server.', dettaglio: err.message });
  }
}

// PATCH /api/ristorante/comande/righe/:rigaId/tipo-speciale — omaggio, autoconsumo, sconto
// Accessibile a: titolare, admin
async function tipoSpecialeRiga(req, res) {
  const { tipo_speciale, motivo_speciale } = req.body;
  const tipiValidi = ['omaggio', 'autoconsumo', 'sconto', null];
  if (!tipiValidi.includes(tipo_speciale)) {
    return res.status(400).json({ errore: 'Tipo non valido. Valori: omaggio, autoconsumo, sconto.' });
  }
  if (tipo_speciale === 'omaggio' && !motivo_speciale) {
    return res.status(400).json({ errore: 'Il motivo è obbligatorio per gli omaggi.' });
  }
  try {
    const r = await pool.query(
      `UPDATE comande_righe SET tipo_speciale = $1, motivo_speciale = $2 WHERE id = $3 RETURNING *`,
      [tipo_speciale, motivo_speciale || null, req.params.rigaId]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Riga non trovata.' });
    res.json({ riga: r.rows[0] });
  } catch (err) {
    console.error('tipoSpecialeRiga error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/ristorante/conto/:id — riepilogo conto della comanda
// Accessibile a: cameriere, titolare, admin
async function conto(req, res) {
  try {
    const comanda = await pool.query(`
      SELECT c.id, c.stato, c.ospite_hotel, c.timestamp_apertura,
             t.numero AS tavolo_numero, u.nome AS cameriere_nome
      FROM comande c
      JOIN tavoli t ON t.id = c.tavolo_id
      LEFT JOIN users u ON u.id = c.cameriere_id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!comanda.rows.length) return res.status(404).json({ errore: 'Comanda non trovata.' });

    const righe = await pool.query(`
      SELECT cr.id, cr.quantita, cr.note, cr.stato, cr.tipo_speciale, cr.motivo_speciale,
             mp.nome AS piatto_nome, mp.prezzo,
             -- prezzo effettivo: 0 per omaggio/autoconsumo, altrimenti prezzo × quantità
             CASE
               WHEN cr.tipo_speciale IN ('omaggio','autoconsumo') THEN 0
               ELSE COALESCE(mp.prezzo, 0) * cr.quantita
             END AS subtotale
      FROM comande_righe cr
      JOIN menu_piatti mp ON mp.id = cr.piatto_id
      WHERE cr.comanda_id = $1
      ORDER BY cr.id
    `, [req.params.id]);

    const totale = righe.rows.reduce((s, r) => s + parseFloat(r.subtotale || 0), 0);

    res.json({
      comanda: comanda.rows[0],
      righe: righe.rows,
      totale: Math.round(totale * 100) / 100,
      ospite_hotel: comanda.rows[0].ospite_hotel,
    });
  } catch (err) {
    console.error('conto error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ristorante/comande/:id/tutto-pronto — segna come pronto tutte le righe non ancora pronte
// Accessibile a: cuoco, cameriere, titolare, admin
async function tuttoProonto(req, res) {
  const { id } = req.params;
  try {
    const comanda = await pool.query(
      'SELECT id, stato FROM comande WHERE id = $1',
      [id]
    );
    if (!comanda.rows.length) return res.status(404).json({ errore: 'Comanda non trovata.' });
    if (comanda.rows[0].stato !== 'aperta') {
      return res.status(400).json({ errore: 'Comanda non aperta.' });
    }

    const righeAggiornate = await pool.query(
      `UPDATE comande_righe
       SET stato = 'pronto', timestamp_pronto = NOW()
       WHERE comanda_id = $1 AND stato NOT IN ('pronto', 'servito')
       RETURNING id`,
      [id]
    );

    // Broadcast stato aggiornato a tutti i client cucina
    const [r, rAllergie] = await Promise.all([
      pool.query(`
        SELECT cr.id, cr.comanda_id, cr.quantita, cr.note, cr.stato,
               cr.tipo_speciale, cr.motivo_speciale, cr.timestamp_pronto,
               mp.nome AS piatto_nome,
               mp.allergeni,
               t.numero AS tavolo_numero,
               c.timestamp_apertura
        FROM comande_righe cr
        JOIN comande c ON c.id = cr.comanda_id AND c.stato = 'aperta'
        JOIN tavoli t ON t.id = c.tavolo_id
        JOIN menu_piatti mp ON mp.id = cr.piatto_id
        WHERE cr.stato != 'servito'
        ORDER BY c.timestamp_apertura, cr.id
      `),
      pool.query(
        'SELECT note_allergie FROM ospiti_giornalieri WHERE data = CURRENT_DATE LIMIT 1'
      ),
    ]);
    const note_allergie_oggi = rAllergie.rows[0]?.note_allergie || null;
    broadcastCucina('stato_iniziale', { righe: r.rows, note_allergie_oggi });

    // Notifica camerieri: un evento riga_pronta per ogni piatto appena segnato pronto
    // (tavolo_numero già disponibile dalla JOIN comande→tavoli della query sopra)
    const idAggiornati = new Set(righeAggiornate.rows.map(riga => riga.id));
    for (const riga of r.rows) {
      if (idAggiornati.has(riga.id)) {
        broadcastCameriere('riga_pronta', {
          riga: {
            id: riga.id,
            piatto_nome: riga.piatto_nome,
            tavolo_numero: riga.tavolo_numero,
            comanda_id: riga.comanda_id,
            quantita: riga.quantita,
          },
        });
      }
    }

    res.json({ messaggio: 'Tutti i piatti segnati come pronti.' });
  } catch (err) {
    console.error('tuttoProonto error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/ristorante/comande/:id — elimina comanda senza righe (es. tavolo aperto per errore)
// Accessibile a: cameriere, titolare, admin
async function eliminaComanda(req, res) {
  try {
    const comanda = await pool.query(
      'SELECT id, stato, tavolo_id FROM comande WHERE id = $1',
      [req.params.id]
    );
    if (!comanda.rows.length) return res.status(404).json({ errore: 'Comanda non trovata.' });
    if (comanda.rows[0].stato !== 'aperta') {
      return res.status(400).json({ errore: 'Solo le comande aperte possono essere eliminate.' });
    }

    const righe = await pool.query(
      'SELECT COUNT(*) AS n FROM comande_righe WHERE comanda_id = $1',
      [req.params.id]
    );
    if (parseInt(righe.rows[0].n) > 0) {
      return res.status(400).json({ errore: 'Comanda con ordini non eliminabile.' });
    }

    await pool.query('DELETE FROM comande WHERE id = $1', [req.params.id]);
    broadcastCucina('comanda_eliminata', { comanda_id: req.params.id });
    broadcastCameriere('comanda_eliminata', { comanda_id: req.params.id });
    res.json({ messaggio: 'Comanda eliminata.' });
  } catch (err) {
    console.error('eliminaComanda error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ristorante/comande/:id/chiudi — chiude la comanda
// tipo normale: cameriere, titolare, admin (default se omesso)
// tipo omaggio/autoconsumo: solo titolare, admin
async function chiudiComanda(req, res) {
  const tipo = req.body?.tipo || 'normale';
  const ruolo = req.utente.ruolo;
  const RUOLI_SPECIALI = ['admin', 'titolare'];

  if ((tipo === 'omaggio' || tipo === 'autoconsumo') && !RUOLI_SPECIALI.includes(ruolo)) {
    return res.status(403).json({ errore: `Il ruolo '${ruolo}' non può chiudere una comanda come ${tipo}.` });
  }

  if (tipo === 'omaggio' && !req.body?.motivo?.trim()) {
    return res.status(400).json({ errore: 'Il motivo è obbligatorio per un omaggio.' });
  }
  if (tipo === 'autoconsumo' && (!req.body?.user_id || !req.body?.valore_costo)) {
    return res.status(400).json({ errore: 'user_id e valore_costo sono obbligatori per un autoconsumo.' });
  }

  try {
    const comanda = await pool.query(
      'SELECT id, stato, tavolo_id FROM comande WHERE id = $1',
      [req.params.id]
    );
    if (!comanda.rows.length) {
      return res.status(404).json({ errore: 'Comanda non trovata.' });
    }
    if (comanda.rows[0].stato !== 'aperta') {
      return res.status(400).json({ errore: 'Comanda già chiusa o annullata.' });
    }

    // Verifica che non ci siano piatti non ancora serviti
    const nonServiti = await pool.query(
      `SELECT COUNT(*) AS n FROM comande_righe
       WHERE comanda_id = $1 AND stato != 'servito'`,
      [req.params.id]
    );
    if (parseInt(nonServiti.rows[0].n) > 0) {
      return res.status(400).json({
        errore: `Ci sono ${nonServiti.rows[0].n} piatti non ancora serviti. Servi tutti i piatti prima di chiudere.`,
        piatti_non_serviti: parseInt(nonServiti.rows[0].n),
      });
    }

    const { tavolo_id } = comanda.rows[0];

    // Calcola totale comanda per storico
    const totaleRes = await pool.query(`
      SELECT COALESCE(SUM(
        CASE WHEN cr.tipo_speciale IN ('omaggio','autoconsumo') THEN 0
             ELSE COALESCE(mp.prezzo, 0) * cr.quantita END
      ), 0) AS totale
      FROM comande_righe cr
      JOIN menu_piatti mp ON mp.id = cr.piatto_id
      WHERE cr.comanda_id = $1
    `, [req.params.id]);
    const totale = parseFloat(totaleRes.rows[0].totale);

    if (tipo === 'omaggio') {
      await pool.query(
        `INSERT INTO omaggi (comanda_id, tavolo_id, motivo, valore_omaggio, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, tavolo_id, req.body.motivo.trim(), totale, req.utente.id]
      );
    } else if (tipo === 'autoconsumo') {
      await pool.query(
        `INSERT INTO autoconsumi (comanda_id, tavolo_id, consumatore_id, valore_costo, valore_listino, autorizzato_da)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, tavolo_id, req.body.user_id, req.body.valore_costo, totale, req.utente.id]
      );
    }

    const r = await pool.query(
      `UPDATE comande SET stato = 'chiusa', timestamp_chiusura = NOW(), tipo_chiusura = $2
       WHERE id = $1 RETURNING *`,
      [req.params.id, tipo]
    );
    broadcastCucina('comanda_chiusa', { comanda_id: req.params.id });
    broadcastCameriere('comanda_chiusa', { comanda_id: req.params.id });
    res.json({ comanda: r.rows[0], messaggio: 'Comanda chiusa.' });
  } catch (err) {
    console.error('chiudiComanda error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  streamCucina, streamSala,
  broadcastCameriere,
  listaComande, apriComanda, dettaglioComanda,
  eliminaComanda, chiudiComanda,
  aggiungiRiga, rimuoviRiga, aggiornaStatoRiga, tipoSpecialeRiga,
  tuttoProonto,
  conto,
};
