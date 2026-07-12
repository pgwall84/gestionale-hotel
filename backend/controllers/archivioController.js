// Controller archivio documentale — resoconti Z, DDT, fatture, scontrini POS, altro.
// File salvati su disco (uploads/archivio/), stesso pattern di documentiController.js
// (documenti HR). Evolutiva futura: sincronizzazione OneDrive via Microsoft Graph
// (dopo il deploy, quando disponibile accesso Azure AD aziendale).

const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');

// GET /api/archivio?tipo=&data_da=&data_a= — ricerca per categoria e intervallo date
// Accessibile a: admin, titolare, receptionist
async function lista(req, res) {
  const { tipo, data_da, data_a } = req.query;
  const condizioni = [];
  const valori = [];

  if (tipo) {
    valori.push(tipo);
    condizioni.push(`tipo = $${valori.length}`);
  }
  if (data_da) {
    valori.push(data_da);
    condizioni.push(`data_documento >= $${valori.length}`);
  }
  if (data_a) {
    valori.push(data_a);
    condizioni.push(`data_documento <= $${valori.length}`);
  }
  const where = condizioni.length ? `WHERE ${condizioni.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT d.id, d.tipo, d.data_documento, d.filename, d.note, d.user_id, d.created_at,
              u.nome, u.cognome
       FROM archivio_documenti d
       LEFT JOIN users u ON u.id = d.user_id
       ${where}
       ORDER BY d.data_documento DESC, d.created_at DESC`,
      valori
    );
    res.json({ documenti: result.rows });
  } catch (err) {
    console.error('Errore lista archivio:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/archivio — upload documento (multer gestisce il file, vedi routes/archivio.js)
// Accessibile a: admin, titolare, receptionist
async function upload(req, res) {
  if (!req.file) return res.status(400).json({ errore: 'Nessun file caricato.' });

  const { tipo, data_documento, note } = req.body;
  const tipiValidi = ['resoconto_z', 'ddt', 'fattura', 'pos', 'altro'];
  if (!tipo || !tipiValidi.includes(tipo)) {
    return res.status(400).json({ errore: `tipo obbligatorio. Valori: ${tipiValidi.join(', ')}.` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO archivio_documenti (tipo, data_documento, filename, note, user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tipo, data_documento || new Date().toISOString().slice(0, 10), req.file.filename, note || null, req.utente.id]
    );
    res.status(201).json({ documento: result.rows[0], messaggio: 'Documento caricato con successo.' });
  } catch (err) {
    console.error('Errore upload archivio:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/archivio/:id/download — scarica il file
// Accessibile a: admin, titolare, receptionist
async function download(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM archivio_documenti WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Documento non trovato.' });

    const doc = result.rows[0];
    const filePath = path.join(__dirname, '..', 'uploads', 'archivio', doc.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ errore: 'File non trovato sul server.' });
    }
    res.download(filePath, doc.filename);
  } catch (err) {
    console.error('Errore download archivio:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/archivio/:id — elimina documento (file fisico + record)
// Accessibile a: admin, titolare, receptionist
async function elimina(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT filename FROM archivio_documenti WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Documento non trovato.' });

    const filePath = path.join(__dirname, '..', 'uploads', 'archivio', result.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM archivio_documenti WHERE id = $1', [id]);
    res.json({ messaggio: 'Documento eliminato.' });
  } catch (err) {
    console.error('Errore elimina archivio:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, upload, download, elimina };
