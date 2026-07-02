// Controller documenti dipendente — buste paga, contratti, certificati.
// I file vengono salvati sul server nella cartella uploads/documenti/.
// In produzione sul VPS andrà bene così; evolutiva futura: S3 o simili.

const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');
const archiver = require('archiver');
const { logAudit } = require('./auditController');

// GET /api/documenti — lista documenti
// Titolare vede tutti, dipendente solo i suoi
async function lista(req, res) {
  const { user_id } = req.query;
  try {
    let query = `
      SELECT d.*, u.nome, u.cognome
      FROM documenti_dipendente d JOIN users u ON u.id = d.user_id
    `;
    const params = [];

    if (req.utente.ruolo !== 'titolare') {
      // Il dipendente vede solo i propri documenti
      query += ' WHERE d.user_id = $1';
      params.push(req.utente.id);
    } else if (user_id) {
      query += ' WHERE d.user_id = $1';
      params.push(user_id);
    }

    query += ' ORDER BY d.uploaded_at DESC';
    const result = await pool.query(query, params);
    res.json({ documenti: result.rows });
  } catch (err) {
    console.error('Errore lista documenti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/documenti — upload documento (multer gestisce il file)
async function upload(req, res) {
  if (!req.file) return res.status(400).json({ errore: 'Nessun file caricato.' });

  const { user_id, tipo, data_documento } = req.body;
  if (!user_id || !tipo) {
    return res.status(400).json({ errore: 'user_id e tipo sono obbligatori.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO documenti_dipendente (user_id, tipo, filename, data_documento)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, tipo, req.file.filename, data_documento || null]
    );
    res.status(201).json({ documento: result.rows[0], messaggio: 'Documento caricato con successo.' });
  } catch (err) {
    console.error('Errore upload documento:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/documenti/:id/download — scarica il file
async function download(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM documenti_dipendente WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Documento non trovato.' });

    const doc = result.rows[0];

    // Un dipendente può scaricare solo i propri documenti
    if (req.utente.ruolo !== 'titolare' && doc.user_id !== req.utente.id) {
      return res.status(403).json({ errore: 'Non autorizzato.' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', 'documenti', doc.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ errore: 'File non trovato sul server.' });
    }

    await logAudit(req.utente.id, 'download_documento', 'documenti_dipendente', doc.id, req, { tipo: doc.tipo, user_id: doc.user_id });
    res.download(filePath, doc.filename);
  } catch (err) {
    console.error('Errore download documento:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/documenti/:id — elimina documento (solo titolare)
async function elimina(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT filename FROM documenti_dipendente WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Documento non trovato.' });

    // Elimina il file fisico dal disco
    const filePath = path.join(__dirname, '..', 'uploads', 'documenti', result.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM documenti_dipendente WHERE id = $1', [id]);
    res.json({ messaggio: 'Documento eliminato.' });
  } catch (err) {
    console.error('Errore elimina documento:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/documenti/download-zip?tipo=cud&anno=2025 — ZIP di tutti i doc di un tipo
async function downloadZip(req, res) {
  const { tipo, anno, user_id } = req.query;
  if (!tipo) return res.status(400).json({ errore: 'tipo è obbligatorio.' });

  try {
    let query = `
      SELECT d.*, u.nome, u.cognome
      FROM documenti_dipendente d JOIN users u ON u.id = d.user_id
      WHERE d.tipo = $1
    `;
    const params = [tipo];
    if (user_id) {
      params.push(user_id);
      query += ` AND d.user_id = $${params.length}`;
    }
    if (anno) {
      params.push(anno);
      query += ` AND EXTRACT(YEAR FROM COALESCE(d.data_documento, d.uploaded_at::date)) = $${params.length}`;
    }
    query += ' ORDER BY u.cognome, u.nome, d.data_documento';
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Nessun documento trovato per questo tipo.' });
    }

    const nomeZip = anno ? `${tipo}_${anno}.zip` : `${tipo}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);

    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });

    archive.on('error', err => {
      console.error('Errore archiver:', err);
      if (!res.headersSent) res.status(500).json({ errore: 'Errore interno del server.' });
    });

    archive.pipe(res);

    for (const doc of result.rows) {
      const filePath = path.join(__dirname, '..', 'uploads', 'documenti', doc.filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(doc.filename);
        const dataStr = doc.data_documento
          ? String(doc.data_documento).slice(0, 10)
          : new Date(doc.uploaded_at).toISOString().slice(0, 10);
        const nomeFile = `${doc.cognome}_${doc.nome}_${dataStr}${ext}`;
        archive.file(filePath, { name: nomeFile });
      }
    }

    archive.finalize();
  } catch (err) {
    console.error('Errore download ZIP:', err);
    if (!res.headersSent) res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, upload, download, elimina, downloadZip };
