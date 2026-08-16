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

// GET /api/magazzino/prodotti — lista prodotti con giacenza calcolata, flag
// sottoscorta e giorni di autonomia stimati.
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
//
// Giorni di autonomia (16/08/2026, punto 5 evolutiva dashboard) — diverso
// da "sottoscorta": quello confronta la giacenza con una soglia statica,
// questo stima QUANDO finirà in base al consumo reale degli ultimi 30
// giorni (solo `scarico`, i `carico` non contano come consumo). Nessuna
// nuova tabella: `movimenti_magazzino` aveva già tutto il necessario.
// consumoMedioGiornaliero = 0 (nessuno scarico registrato negli ultimi 30
// giorni) → giorniAutonomia è `null`, non "infinito" né 0: un prodotto mai
// scaricato non ha un consumo stimabile, non è automaticamente "sicuro".
async function listaProdotti(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nome, p.categoria, p.unita_misura, p.soglia_minima,
             p.qr_code, p.barcode_ean, p.attivo, p.created_at,
             COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza,
             COALESCE(consumo.tot, 0) AS consumo_30gg
      FROM prodotti p
      LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
      LEFT JOIN LATERAL (
        SELECT SUM(m2.quantita) AS tot
        FROM movimenti_magazzino m2
        WHERE m2.prodotto_id = p.id AND m2.tipo = 'scarico' AND m2.data >= NOW() - INTERVAL '30 days'
      ) consumo ON true
      WHERE p.attivo = true
      GROUP BY p.id, consumo.tot
      ORDER BY p.nome
    `);
    const prodotti = result.rows.map(p => {
      const giacenza = parseFloat(p.giacenza);
      const consumoMedioGiornaliero = Math.round((parseFloat(p.consumo_30gg) / 30) * 100) / 100;
      const giorniAutonomia = consumoMedioGiornaliero > 0
        ? Math.max(0, Math.round(giacenza / consumoMedioGiornaliero))
        : null;
      return {
        ...p,
        giacenza,
        sottoscorta: giacenza < parseFloat(p.soglia_minima),
        consumoMedioGiornaliero,
        giorniAutonomia,
      };
    });
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

// GET /api/magazzino/prodotti/:id/storico-prezzi — storico costo_unitario dei carichi
// per un prodotto, più recenti prima (evolutiva 1.7, 06/08/2026: nessuna nuova
// tabella, i prezzi erano già tutti dentro movimenti_magazzino).
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function storicoPrezzi(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.data, m.quantita, m.costo_unitario, m.ddt_numero, f.nome AS fornitore_nome
       FROM movimenti_magazzino m
       LEFT JOIN fornitori f ON f.id = m.fornitore_id
       WHERE m.prodotto_id = $1 AND m.tipo = 'carico' AND m.costo_unitario IS NOT NULL
       ORDER BY m.data DESC
       LIMIT 50`,
      [id]
    );
    res.json({ storico: result.rows });
  } catch (err) {
    console.error('storicoPrezzi error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/scadenze — carichi con data_scadenza entro 7 giorni (o già
// scaduti), livello progressivo scaduto/urgente/attenzione. Nessun tracciamento
// a lotti nel gestionale: mostra i carichi registrati, non "cosa resta davvero
// in giacenza di quel lotto" — stesso limite già noto per l'alert sottoscorta,
// da comunicare a chi lo consulta se il volume di prodotti freschi crescerà.
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function alertScadenze(req, res) {
  try {
    const result = await pool.query(
      `SELECT m.id, m.prodotto_id, p.nome AS prodotto_nome, p.unita_misura,
              m.quantita, m.data_scadenza, m.ddt_numero, f.nome AS fornitore_nome,
              (m.data_scadenza - CURRENT_DATE) AS giorni_mancanti
       FROM movimenti_magazzino m
       JOIN prodotti p ON p.id = m.prodotto_id
       LEFT JOIN fornitori f ON f.id = m.fornitore_id
       WHERE m.tipo = 'carico' AND m.data_scadenza IS NOT NULL
         AND m.data_scadenza <= CURRENT_DATE + 7
       ORDER BY m.data_scadenza ASC
       LIMIT 30`
    );
    const scadenze = result.rows.map(r => {
      const giorni = Number(r.giorni_mancanti);
      let livello;
      if (giorni <= 0) livello = 'scaduto';
      else if (giorni <= 3) livello = 'urgente';
      else livello = 'attenzione';
      return { ...r, giorni_mancanti: giorni, livello };
    });
    res.json({ scadenze });
  } catch (err) {
    console.error('alertScadenze error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/magazzino/bozza-ordine — prodotti sotto soglia, raggruppati per
// fornitore, con quantità suggerita (soglia_minima - giacenza). Il fornitore
// non è in anagrafica prodotto (schema non lo prevede): inferito dal fornitore
// usato nell'ultimo carico registrato per quel prodotto — se non c'è mai stato
// un carico con fornitore, finisce nel gruppo "Fornitore non determinato" invece
// di sparire silenziosamente. È una bozza da rivedere, non un ordine reale.
// Accessibile a: admin, titolare, cuoco, receptionist, portiere_notte
async function bozzaOrdine(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nome, p.unita_misura, p.soglia_minima,
             COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza,
             (
               SELECT m2.fornitore_id FROM movimenti_magazzino m2
               WHERE m2.prodotto_id = p.id AND m2.tipo = 'carico' AND m2.fornitore_id IS NOT NULL
               ORDER BY m2.data DESC LIMIT 1
             ) AS fornitore_id
      FROM prodotti p
      LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
      WHERE p.attivo = true
      GROUP BY p.id
      HAVING COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) < p.soglia_minima
      ORDER BY p.nome
    `);
    const fornitoriRes = await pool.query('SELECT id, nome, contatto, email, telefono FROM fornitori WHERE attivo = true');
    const fornitoriById = Object.fromEntries(fornitoriRes.rows.map(f => [f.id, f]));

    const gruppi = {};
    for (const p of result.rows) {
      const giacenza = parseFloat(p.giacenza);
      const soglia = parseFloat(p.soglia_minima);
      const quantitaSuggerita = Math.round(Math.max(soglia - giacenza, 0) * 100) / 100;
      const chiave = p.fornitore_id || 'nessuno';
      if (!gruppi[chiave]) {
        gruppi[chiave] = {
          fornitore: p.fornitore_id ? fornitoriById[p.fornitore_id] || null : null,
          prodotti: [],
        };
      }
      gruppi[chiave].prodotti.push({
        id: p.id, nome: p.nome, unita_misura: p.unita_misura,
        giacenza, soglia_minima: soglia, quantita_suggerita: quantitaSuggerita,
      });
    }
    res.json({ gruppi: Object.values(gruppi) });
  } catch (err) {
    console.error('bozzaOrdine error:', err);
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
  storicoPrezzi, alertScadenze, bozzaOrdine,
};
