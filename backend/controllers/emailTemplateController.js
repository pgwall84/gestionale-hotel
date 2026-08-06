// Controller gestione testi delle email automatiche (modulo 5.3, estensione
// 04/08/2026) — oggetto/corpo delle 3 email (conferma/promemoria/recensione)
// e dati del footer comune (impostazioni_email). Accessibile in
// lettura+scrittura solo ad admin/titolare (shared/ruoli.js sezione
// 'email_template'). backend/lib/emailPrenotazioni.js legge queste stesse
// tabelle all'invio — nessuna duplicazione di testo tra qui e lì.

const pool = require('../config/db');

const TIPI_VALIDI = ['conferma', 'promemoria', 'recensione', 'pre_checkin'];

// GET /api/email-template — i 3 template, per popolare la pagina in un colpo solo.
const listaTemplate = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT tipo, oggetto, corpo, updated_at FROM email_template ORDER BY tipo',
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('listaTemplate error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// PATCH /api/email-template/:tipo — aggiorna oggetto/corpo di un template.
const aggiornaTemplate = async (req, res) => {
  const { tipo } = req.params;
  const { oggetto, corpo } = req.body;
  if (!TIPI_VALIDI.includes(tipo)) {
    return res.status(400).json({ error: `tipo deve essere uno tra: ${TIPI_VALIDI.join(', ')}.` });
  }
  if (!oggetto || !corpo) {
    return res.status(400).json({ error: 'oggetto e corpo sono obbligatori.' });
  }
  try {
    const result = await pool.query(
      `UPDATE email_template SET oggetto = $1, corpo = $2, aggiornato_da = $3, updated_at = NOW()
       WHERE tipo = $4 RETURNING tipo, oggetto, corpo, updated_at`,
      [oggetto, corpo, req.utente.id, tipo]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Template non trovato' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiornaTemplate error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// GET /api/email-template/footer — dati del footer comune a tutte le email.
const getFooter = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT footer_indirizzo, footer_telefono, footer_email, footer_sito, logo_url, updated_at FROM impostazioni_email WHERE id = 1',
      []
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('getFooter error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// PATCH /api/email-template/footer — aggiorna i dati del footer.
const aggiornaFooter = async (req, res) => {
  const { footer_indirizzo, footer_telefono, footer_email, footer_sito, logo_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE impostazioni_email SET
         footer_indirizzo = $1, footer_telefono = $2, footer_email = $3,
         footer_sito = $4, logo_url = $5, aggiornato_da = $6, updated_at = NOW()
       WHERE id = 1
       RETURNING footer_indirizzo, footer_telefono, footer_email, footer_sito, logo_url, updated_at`,
      [footer_indirizzo || null, footer_telefono || null, footer_email || null, footer_sito || null, logo_url || null, req.utente.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('aggiornaFooter error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { listaTemplate, aggiornaTemplate, getFooter, aggiornaFooter, TIPI_VALIDI };
