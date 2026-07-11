// Controller magazzino — prodotti, fornitori, movimenti (carico/scarico/consegna),
// alert sottoscorta, lookup EAN esterno, food cost globale.
// Permessi: lettura + movimenti a admin/titolare/cuoco/receptionist/portiere_notte
// (sezione 'magazzino'); anagrafica prodotti/fornitori e food cost solo admin/titolare
// (soloTitolare) — vedi routes/magazzino.js.

const pool = require('../config/db');

// Genera un codice QR interno univoco per un prodotto (non un'immagine — solo
// la stringa codificata nel QR; il rendering avviene lato frontend con qrcode.react).
function generaQrCode() {
  return `PRD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

// GET /api/magazzino/prodotti — lista prodotti con giacenza calcolata e flag sottoscorta
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function listaProdotti(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nome, p.categoria, p.unita_misura, p.soglia_minima,
             p.qr_code, p.barcode_ean, p.attivo, p.created_at,
             COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza
      FROM prodotti p
      LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
      WHERE p.attivo = true
      GROUP BY p.id
      ORDER BY p.nome
    `);
    const prodotti = result.rows.map(p => ({
      ...p,
      giacenza: parseFloat(p.giacenza),
      sottoscorta: parseFloat(p.giacenza) < parseFloat(p.soglia_minima),
    }));
    res.json({ prodotti });
  } catch (err) {
    console.error('listaProdotti error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/magazzino/prodotti — crea prodotto (manuale o dopo lookup EAN)
// Accessibile a: admin, titolare (anagrafica)
async function creaProdotto(req, res) {
  const { nome, categoria, unita_misura, soglia_minima, barcode_ean } = req.body;
  if (!nome?.trim()) {
    return res.status(400).json({ errore: 'nome obbligatorio.' });
  }
  try {
    const qr_code = generaQrCode();
    const result = await pool.query(
      `INSERT INTO prodotti (nome, categoria, unita_misura, soglia_minima, qr_code, barcode_ean)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome.trim(), categoria || null, unita_misura || null, soglia_minima ?? 0, qr_code, barcode_ean || null]
    );
    res.status(201).json({ prodotto: result.rows[0] });
  } catch (err) {
    console.error('creaProdotto error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/prodotti/lookup-ean/:ean — proxy Open Food Facts (server-side)
// Accessibile a: admin, titolare (serve solo per creare un nuovo prodotto)
async function lookupEan(req, res) {
  const { ean } = req.params;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json`);
    if (!r.ok) {
      return res.json({ trovato: false });
    }
    const dati = await r.json();
    if (dati.status !== 1 || !dati.product) {
      return res.json({ trovato: false });
    }
    res.json({
      trovato: true,
      nome: dati.product.product_name || '',
      categoria: dati.product.categories?.split(',')[0]?.trim() || '',
    });
  } catch (err) {
    // Open Food Facts irraggiungibile o lento: non blocca mai la creazione manuale
    console.error('lookupEan error:', err.message);
    res.json({ trovato: false });
  }
}

// GET /api/magazzino/prodotti/qr/:qr_code — lookup prodotto da QR scansionato (scaffale)
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function prodottoPerQr(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, nome, categoria, unita_misura, soglia_minima, qr_code FROM prodotti WHERE qr_code = $1 AND attivo = true',
      [req.params.qr_code]
    );
    if (!result.rows.length) {
      return res.status(404).json({ errore: 'Prodotto non trovato per questo QR.' });
    }
    res.json({ prodotto: result.rows[0] });
  } catch (err) {
    console.error('prodottoPerQr error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/fornitori — lista fornitori attivi (serve anche per il form movimenti)
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function listaFornitori(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, nome, contatto, email, telefono, note FROM fornitori WHERE attivo = true ORDER BY nome'
    );
    res.json({ fornitori: result.rows });
  } catch (err) {
    console.error('listaFornitori error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/magazzino/fornitori — crea fornitore
// Accessibile a: admin, titolare (anagrafica)
async function creaFornitore(req, res) {
  const { nome, contatto, email, telefono, note } = req.body;
  if (!nome?.trim()) {
    return res.status(400).json({ errore: 'nome obbligatorio.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO fornitori (nome, contatto, email, telefono, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome.trim(), contatto || null, email || null, telefono || null, note || null]
    );
    res.status(201).json({ fornitore: result.rows[0] });
  } catch (err) {
    console.error('creaFornitore error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/magazzino/movimenti — registra carico, scarico o consegna (carico con dettagli fornitore)
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function registraMovimento(req, res) {
  const { prodotto_id, tipo, quantita, fornitore_id, ddt_numero, data_scadenza, costo_unitario, note } = req.body;
  const tipiValidi = ['carico', 'scarico'];
  if (!prodotto_id || !tipiValidi.includes(tipo) || !quantita || parseFloat(quantita) <= 0) {
    return res.status(400).json({ errore: 'prodotto_id, tipo (carico/scarico) e quantita (> 0) obbligatori.' });
  }
  try {
    const prodotto = await pool.query('SELECT id FROM prodotti WHERE id = $1 AND attivo = true', [prodotto_id]);
    if (!prodotto.rows.length) {
      return res.status(404).json({ errore: 'Prodotto non trovato.' });
    }
    const result = await pool.query(
      `INSERT INTO movimenti_magazzino
         (prodotto_id, tipo, quantita, fornitore_id, ddt_numero, data_scadenza, costo_unitario, user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [prodotto_id, tipo, quantita, fornitore_id || null, ddt_numero || null, data_scadenza || null,
       costo_unitario || null, req.utente.id, note || null]
    );
    res.status(201).json({ movimento: result.rows[0] });
  } catch (err) {
    console.error('registraMovimento error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/movimenti — storico movimenti, filtri opzionali prodotto_id/data_da/data_a
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function listaMovimenti(req, res) {
  const { prodotto_id, data_da, data_a } = req.query;
  const condizioni = [];
  const valori = [];
  if (prodotto_id) {
    valori.push(prodotto_id);
    condizioni.push(`m.prodotto_id = $${valori.length}`);
  }
  if (data_da) {
    valori.push(data_da);
    condizioni.push(`m.data >= $${valori.length}`);
  }
  if (data_a) {
    valori.push(data_a);
    condizioni.push(`m.data <= $${valori.length}`);
  }
  const where = condizioni.length ? `WHERE ${condizioni.join(' AND ')}` : '';
  try {
    const result = await pool.query(`
      SELECT m.id, m.prodotto_id, p.nome AS prodotto_nome, m.tipo, m.quantita, m.data,
             m.fornitore_id, f.nome AS fornitore_nome, m.ddt_numero, m.data_scadenza,
             m.costo_unitario, m.user_id, u.nome AS user_nome, m.note
      FROM movimenti_magazzino m
      JOIN prodotti p ON p.id = m.prodotto_id
      LEFT JOIN fornitori f ON f.id = m.fornitore_id
      LEFT JOIN users u ON u.id = m.user_id
      ${where}
      ORDER BY m.data DESC
      LIMIT 200
    `, valori);
    res.json({ movimenti: result.rows });
  } catch (err) {
    console.error('listaMovimenti error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/alert — prodotti con giacenza sotto la soglia minima configurata
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function alertSottoscorta(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nome, p.categoria, p.unita_misura, p.soglia_minima,
             COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza
      FROM prodotti p
      LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
      WHERE p.attivo = true
      GROUP BY p.id
      HAVING COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) < p.soglia_minima
      ORDER BY p.nome
    `);
    const prodotti = result.rows.map(p => ({ ...p, giacenza: parseFloat(p.giacenza) }));
    res.json({ prodotti });
  } catch (err) {
    console.error('alertSottoscorta error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/food-cost?da=YYYY-MM-DD&a=YYYY-MM-DD — spesa carichi periodo ÷ coperti periodo
// Accessibile a: admin, titolare
async function foodCostPeriodo(req, res) {
  const { da, a } = req.query;
  if (!da || !a) {
    return res.status(400).json({ errore: 'Parametri da e a (date) obbligatori.' });
  }
  try {
    const spesaRes = await pool.query(
      `SELECT COALESCE(SUM(quantita * costo_unitario), 0) AS spesa
       FROM movimenti_magazzino
       WHERE tipo = 'carico' AND costo_unitario IS NOT NULL
         AND data::date BETWEEN $1 AND $2`,
      [da, a]
    );
    const copertiRes = await pool.query(
      `SELECT COALESCE(SUM(coperti_colazione + coperti_pranzo + coperti_cena), 0) AS coperti
       FROM ospiti_giornalieri
       WHERE data BETWEEN $1 AND $2`,
      [da, a]
    );
    const spesa = parseFloat(spesaRes.rows[0].spesa);
    const coperti = parseInt(copertiRes.rows[0].coperti);
    res.json({
      spesa,
      coperti,
      costo_medio_per_coperto: coperti > 0 ? Math.round((spesa / coperti) * 100) / 100 : null,
    });
  } catch (err) {
    console.error('foodCostPeriodo error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  listaProdotti, creaProdotto, lookupEan, prodottoPerQr,
  listaFornitori, creaFornitore,
  registraMovimento, listaMovimenti,
  alertSottoscorta, foodCostPeriodo,
};
