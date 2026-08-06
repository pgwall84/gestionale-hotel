// Controller Offerte dedicate via email (modulo 5.3, estensione 04/08/2026).
// Accessibile in lettura+scrittura solo ad admin/titolare (shared/ruoli.js
// sezione 'offerte_email'). L'invio vero e proprio (con la logica di
// consenso marketing/GDPR) vive in backend/lib/offerteEmail.js — questo
// controller valida solo l'input HTTP e restituisce/legge lo storico.

const pool = require('../config/db');
const { inviaOfferta } = require('../lib/offerteEmail');

// POST /api/offerte-email — compone e invia subito un'offerta.
// body: { oggetto, corpo, destinatari: 'tutti' | [ospite_id, ...] }
const crea = async (req, res) => {
  const { oggetto, corpo, destinatari } = req.body;
  if (!oggetto || !corpo) {
    return res.status(400).json({ error: 'oggetto e corpo sono obbligatori.' });
  }
  const destinatariValidi = destinatari === 'tutti' || (Array.isArray(destinatari) && destinatari.length > 0);
  if (!destinatariValidi) {
    return res.status(400).json({ error: `destinatari deve essere 'tutti' oppure un array di id cliente non vuoto.` });
  }
  try {
    const esito = await inviaOfferta({ oggetto, corpo, destinatari, utenteId: req.utente.id });
    res.json(esito);
  } catch (err) {
    console.error('crea offerta email error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// GET /api/offerte-email — storico offerte inviate (senza il dettaglio destinatari).
const lista = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.oggetto, o.inviato_at, o.totale_destinatari, o.totale_ok, o.totale_falliti,
              u.nome AS inviato_da_nome, u.cognome AS inviato_da_cognome
       FROM offerte_email o
       LEFT JOIN users u ON u.id = o.inviato_da
       ORDER BY o.inviato_at DESC`,
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista offerte email error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// GET /api/offerte-email/:id — dettaglio di un'offerta con l'elenco destinatari.
const dettaglio = async (req, res) => {
  try {
    const offerta = await pool.query(
      `SELECT o.*, u.nome AS inviato_da_nome, u.cognome AS inviato_da_cognome
       FROM offerte_email o LEFT JOIN users u ON u.id = o.inviato_da
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (!offerta.rows.length) {
      return res.status(404).json({ error: 'Offerta non trovata' });
    }
    const destinatari = await pool.query(
      `SELECT d.email, d.ok, d.errore, o.nome, o.cognome
       FROM offerte_email_destinatari d
       LEFT JOIN ospiti o ON o.id = d.ospite_id
       WHERE d.offerta_id = $1
       ORDER BY d.id`,
      [req.params.id]
    );
    res.json({ ...offerta.rows[0], destinatari: destinatari.rows });
  } catch (err) {
    console.error('dettaglio offerta email error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { crea, lista, dettaglio };
