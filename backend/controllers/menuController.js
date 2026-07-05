const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// ── Categorie ─────────────────────────────────────────────────────────────────

async function listCategorie(req, res) {
  try {
    const r = await pool.query('SELECT * FROM menu_categorie ORDER BY ordine, id');
    res.json({ categorie: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function creaCategoria(req, res) {
  const { titolo, ordine, emoji } = req.body;
  if (!titolo) return res.status(400).json({ errore: 'titolo obbligatorio.' });
  try {
    const r = await pool.query(
      'INSERT INTO menu_categorie (titolo, ordine, emoji) VALUES ($1, $2, $3) RETURNING *',
      [titolo, ordine ?? 0, emoji || '🍽️']
    );
    res.status(201).json({ categoria: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function modificaCategoria(req, res) {
  const { titolo, ordine, attivo, emoji } = req.body;
  try {
    const r = await pool.query(
      'UPDATE menu_categorie SET titolo=COALESCE($1,titolo), ordine=COALESCE($2,ordine), attivo=COALESCE($3,attivo), emoji=COALESCE($4,emoji) WHERE id=$5 RETURNING *',
      [titolo ?? null, ordine ?? null, attivo ?? null, emoji ?? null, req.params.id]
    );
    res.json({ categoria: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function eliminaCategoria(req, res) {
  try {
    await pool.query('DELETE FROM menu_categorie WHERE id=$1', [req.params.id]);
    res.json({ messaggio: 'Categoria eliminata.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ── Piatti ────────────────────────────────────────────────────────────────────

async function listPiatti(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, c.titolo AS categoria_titolo, c.ordine AS categoria_ordine
      FROM menu_piatti p JOIN menu_categorie c ON c.id = p.categoria_id
      ORDER BY c.ordine, c.id, p.ordine, p.id
    `);
    res.json({ piatti: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function creaPiatto(req, res) {
  const { categoria_id, nome, descrizione, prezzo, allergeni, ordine } = req.body;
  if (!categoria_id || !nome) return res.status(400).json({ errore: 'categoria_id e nome obbligatori.' });
  const immagine_url = req.file ? `/uploads/menu/${req.file.filename}` : null;
  const tags = Array.isArray(allergeni) ? allergeni : (allergeni ? JSON.parse(allergeni) : []);
  try {
    const r = await pool.query(
      `INSERT INTO menu_piatti (categoria_id, nome, descrizione, prezzo, allergeni, immagine_url, ordine)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [categoria_id, nome, descrizione || null, prezzo || null, tags, immagine_url, ordine ?? 0]
    );
    res.status(201).json({ piatto: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function modificaPiatto(req, res) {
  const { nome, descrizione, prezzo, allergeni, categoria_id, ordine } = req.body;
  const nuovaImmagine = req.file ? `/uploads/menu/${req.file.filename}` : null;
  const tags = allergeni ? (Array.isArray(allergeni) ? allergeni : JSON.parse(allergeni)) : [];
  try {
    const r = await pool.query(`
      UPDATE menu_piatti SET
        nome         = $1,
        descrizione  = $2,
        prezzo       = $3,
        allergeni    = $4,
        immagine_url = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE immagine_url END,
        categoria_id = $6,
        ordine       = $7
      WHERE id = $8 RETURNING *`,
      [nome || null, descrizione || null, prezzo || null, tags, nuovaImmagine, categoria_id || null, ordine !== undefined ? Number(ordine) : 0, req.params.id]
    );
    res.json({ piatto: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function toggleDisponibile(req, res) {
  try {
    const r = await pool.query(
      'UPDATE menu_piatti SET disponibile = NOT disponibile WHERE id=$1 RETURNING id, disponibile',
      [req.params.id]
    );
    res.json({ piatto: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

async function eliminaPiatto(req, res) {
  try {
    const r = await pool.query('SELECT immagine_url FROM menu_piatti WHERE id=$1', [req.params.id]);
    if (r.rows[0]?.immagine_url) {
      const fp = path.join(__dirname, '..', r.rows[0].immagine_url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM menu_piatti WHERE id=$1', [req.params.id]);
    res.json({ messaggio: 'Piatto eliminato.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// ── Pubblico (senza auth) ─────────────────────────────────────────────────────

async function menuPubblico(req, res) {
  try {
    const cat = await pool.query('SELECT * FROM menu_categorie WHERE attivo=true ORDER BY ordine, id');
    const piatti = await pool.query(`
      SELECT * FROM menu_piatti
      WHERE disponibile=true
        AND categoria_id IN (SELECT id FROM menu_categorie WHERE attivo=true)
      ORDER BY ordine, id
    `);
    res.json({ categorie: cat.rows, piatti: piatti.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  listCategorie, creaCategoria, modificaCategoria, eliminaCategoria,
  listPiatti, creaPiatto, modificaPiatto, toggleDisponibile, eliminaPiatto,
  menuPubblico,
};
