// Controller addebiti extra — conto camera per extra oltre il trattamento
// (soprattutto bar) e catalogo prodotti per la griglia rapida a quadratoni.
// Vedi database/migrations/031_ristorante_addebiti.sql per il contesto.
//
// Due percorsi verso addebiti_extra: la griglia rapida (qui, addebitoRapido)
// scrive direttamente senza passare da comanda/tavolo/cucina; il percorso
// da comanda reale (righe marcate addebito_camera) è in comandeController.js
// (chiudiComanda).

const pool = require('../config/db');

// ── Catalogo addebiti rapidi (Impostazioni) ─────────────────────────────────

// GET /api/impostazioni/catalogo-addebiti — lista voci del catalogo.
// Di default solo le voci attive (per la griglia); ?tutti=true per la
// pagina di gestione (mostra anche le disattivate, per poterle riattivare).
// Accessibile a: admin, titolare (lettura, come tariffe/pacchetti).
async function listaCatalogo(req, res) {
  try {
    const soloAttivi = req.query.tutti !== 'true';
    const r = await pool.query(
      `SELECT id, nome, prezzo, ordine, attivo
       FROM catalogo_addebiti_rapidi
       ${soloAttivi ? 'WHERE attivo = true' : ''}
       ORDER BY ordine, nome`
    );
    res.json({ catalogo: r.rows });
  } catch (err) {
    console.error('listaCatalogo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/impostazioni/catalogo-addebiti — crea una voce.
// Accessibile a: admin, titolare.
async function creaVoceCatalogo(req, res) {
  const { nome, prezzo, ordine } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ errore: 'Il nome è obbligatorio.' });
  }
  if (prezzo === undefined || prezzo === null || isNaN(prezzo) || Number(prezzo) < 0) {
    return res.status(400).json({ errore: 'Il prezzo è obbligatorio e deve essere un numero non negativo.' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO catalogo_addebiti_rapidi (nome, prezzo, ordine)
       VALUES ($1, $2, $3) RETURNING *`,
      [nome.trim(), prezzo, ordine ?? 0]
    );
    res.status(201).json({ voce: r.rows[0] });
  } catch (err) {
    console.error('creaVoceCatalogo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/impostazioni/catalogo-addebiti/:id — modifica nome/prezzo/ordine/attivo.
// Nessuna DELETE reale: solo disattivazione (attivo=false), stesso pattern
// già usato per camere/tavoli/prodotti magazzino — una voce disattivata può
// comunque essere referenziata da addebiti_extra storici.
// Accessibile a: admin, titolare.
async function modificaVoceCatalogo(req, res) {
  const { nome, prezzo, ordine, attivo } = req.body;
  if (prezzo !== undefined && prezzo !== null && (isNaN(prezzo) || Number(prezzo) < 0)) {
    return res.status(400).json({ errore: 'Il prezzo deve essere un numero non negativo.' });
  }
  try {
    const r = await pool.query(
      `UPDATE catalogo_addebiti_rapidi SET
         nome   = COALESCE($1, nome),
         prezzo = COALESCE($2, prezzo),
         ordine = COALESCE($3, ordine),
         attivo = COALESCE($4, attivo)
       WHERE id = $5 RETURNING *`,
      [nome?.trim() || null, prezzo ?? null, ordine ?? null, attivo ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Voce non trovata.' });
    res.json({ voce: r.rows[0] });
  } catch (err) {
    console.error('modificaVoceCatalogo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ── Addebiti su soggiorno ────────────────────────────────────────────────────

// GET /api/soggiorni/:id/addebiti — lista addebiti extra accumulati sul
// soggiorno (per il check-out) + totale.
// Accessibile a: admin, titolare, receptionist.
async function listaPerSoggiorno(req, res) {
  try {
    const r = await pool.query(
      `SELECT ae.id, ae.origine, ae.descrizione, ae.importo, ae.data, ae.comanda_id,
              u.nome AS user_nome
       FROM addebiti_extra ae
       LEFT JOIN users u ON u.id = ae.user_id
       WHERE ae.soggiorno_id = $1
       ORDER BY ae.created_at`,
      [req.params.id]
    );
    const totale = r.rows.reduce((s, a) => s + parseFloat(a.importo || 0), 0);
    res.json({ addebiti: r.rows, totale: Math.round(totale * 100) / 100 });
  } catch (err) {
    console.error('listaPerSoggiorno error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/soggiorni/:id/addebiti/rapido — addebito diretto dalla griglia
// a quadratoni (bar/camera), nessuna comanda coinvolta. Accetta o
// catalogo_id (voce del catalogo) o descrizione+importo manuali.
// Accessibile a: admin, titolare, receptionist, cameriere (chi gestisce il bar).
async function addebitoRapido(req, res) {
  const { catalogo_id, descrizione, importo } = req.body;
  try {
    const soggiorno = await pool.query('SELECT id FROM soggiorni WHERE id = $1', [req.params.id]);
    if (!soggiorno.rows.length) return res.status(404).json({ errore: 'Soggiorno non trovato.' });

    let desc = descrizione;
    let imp = importo;

    if (catalogo_id) {
      const voce = await pool.query(
        'SELECT nome, prezzo FROM catalogo_addebiti_rapidi WHERE id = $1 AND attivo = true',
        [catalogo_id]
      );
      if (!voce.rows.length) return res.status(404).json({ errore: 'Voce di catalogo non trovata o non attiva.' });
      desc = voce.rows[0].nome;
      imp = voce.rows[0].prezzo;
    }

    if (!desc || imp === undefined || imp === null || isNaN(imp) || Number(imp) < 0) {
      return res.status(400).json({ errore: 'catalogo_id oppure descrizione+importo (numero non negativo) sono obbligatori.' });
    }

    const r = await pool.query(
      `INSERT INTO addebiti_extra (soggiorno_id, origine, descrizione, importo, user_id)
       VALUES ($1, 'bar', $2, $3, $4) RETURNING *`,
      [req.params.id, desc, imp, req.utente.id]
    );
    res.status(201).json({ addebito: r.rows[0] });
  } catch (err) {
    console.error('addebitoRapido error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  listaCatalogo, creaVoceCatalogo, modificaVoceCatalogo,
  listaPerSoggiorno, addebitoRapido,
};
