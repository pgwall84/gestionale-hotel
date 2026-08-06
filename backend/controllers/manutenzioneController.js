// Controller segnalazioni manutenzione/guasti — camera o area comune.
// Tutto il personale può segnalare e vedere le segnalazioni (trasparenza,
// evita doppie segnalazioni); solo admin/titolare aggiornano lo stato
// (presa in carico, risoluzione). Foto opzionale via multer, stesso
// pattern di archivioController.js.

const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

const LUOGHI_VALIDI = [
  'camera', 'bar', 'sala_ristorante', 'cucina', 'lavanderia',
  'lavaggio_piatti', 'magazzino', 'garage', 'altro',
];
const PRIORITA_VALIDE = ['bassa', 'media', 'alta'];
const STATI_VALIDI = ['aperta', 'in_lavorazione', 'risolta'];

// Etichette leggibili per i luoghi fissi — usate anche dall'alert Dashboard
const LABEL_LUOGO = {
  bar: 'Bar',
  sala_ristorante: 'Sala ristorante',
  cucina: 'Cucina',
  lavanderia: 'Lavanderia',
  lavaggio_piatti: 'Lavaggio piatti',
  magazzino: 'Magazzino',
  garage: 'Garage',
  altro: 'Altro',
};

// GET /api/manutenzione?stato=&priorita= — lista segnalazioni, filtri opzionali
// Accessibile a: tutti i ruoli (azione 'lettura')
async function lista(req, res) {
  const { stato, priorita } = req.query;
  const condizioni = [];
  const valori = [];

  if (stato) {
    if (!STATI_VALIDI.includes(stato)) {
      return res.status(400).json({ errore: `stato non valido. Valori: ${STATI_VALIDI.join(', ')}.` });
    }
    valori.push(stato);
    condizioni.push(`s.stato = $${valori.length}`);
  }
  if (priorita) {
    if (!PRIORITA_VALIDE.includes(priorita)) {
      return res.status(400).json({ errore: `priorita non valida. Valori: ${PRIORITA_VALIDE.join(', ')}.` });
    }
    valori.push(priorita);
    condizioni.push(`s.priorita = $${valori.length}`);
  }
  const where = condizioni.length ? `WHERE ${condizioni.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT s.id, s.luogo_tipo, s.camera_id, c.numero AS camera_numero, s.luogo_note,
              s.descrizione, s.priorita, s.stato, s.foto_filename, s.note_risoluzione,
              s.created_at, s.aggiornato_il, s.risolta_il,
              us.nome AS segnalato_da_nome, us.cognome AS segnalato_da_cognome,
              ug.nome AS gestito_da_nome, ug.cognome AS gestito_da_cognome
       FROM segnalazioni_manutenzione s
       LEFT JOIN camere c ON c.id = s.camera_id
       LEFT JOIN users us ON us.id = s.segnalato_da
       LEFT JOIN users ug ON ug.id = s.gestito_da
       ${where}
       ORDER BY (s.stato = 'risolta') ASC, (s.priorita = 'alta') DESC, s.created_at DESC`,
      valori
    );
    res.json({ segnalazioni: result.rows });
  } catch (err) {
    console.error('Errore lista manutenzione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/manutenzione — nuova segnalazione (foto opzionale, vedi routes/manutenzione.js)
// Accessibile a: tutti i ruoli (azione 'crea')
async function crea(req, res) {
  const { luogo_tipo, camera_id, luogo_note, descrizione, priorita } = req.body;

  if (!luogo_tipo || !LUOGHI_VALIDI.includes(luogo_tipo)) {
    return res.status(400).json({ errore: `luogo_tipo obbligatorio. Valori: ${LUOGHI_VALIDI.join(', ')}.` });
  }
  if (luogo_tipo === 'camera' && !camera_id) {
    return res.status(400).json({ errore: 'camera_id obbligatorio quando luogo_tipo è "camera".' });
  }
  if (luogo_tipo !== 'camera' && camera_id) {
    return res.status(400).json({ errore: 'camera_id va lasciato vuoto se luogo_tipo non è "camera".' });
  }
  if (!descrizione || !descrizione.trim()) {
    return res.status(400).json({ errore: 'descrizione obbligatoria.' });
  }
  const prioritaFinale = priorita || 'media';
  if (!PRIORITA_VALIDE.includes(prioritaFinale)) {
    return res.status(400).json({ errore: `priorita non valida. Valori: ${PRIORITA_VALIDE.join(', ')}.` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO segnalazioni_manutenzione
         (luogo_tipo, camera_id, luogo_note, descrizione, priorita, foto_filename, segnalato_da)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        luogo_tipo,
        luogo_tipo === 'camera' ? camera_id : null,
        luogo_note || null,
        descrizione.trim(),
        prioritaFinale,
        req.file ? req.file.filename : null,
        req.utente.id,
      ]
    );
    res.status(201).json({ segnalazione: result.rows[0], messaggio: 'Segnalazione registrata.' });
  } catch (err) {
    console.error('Errore crea manutenzione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/manutenzione/:id/foto — scarica la foto allegata
// Accessibile a: tutti i ruoli (azione 'lettura')
async function foto(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT foto_filename FROM segnalazioni_manutenzione WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].foto_filename) {
      return res.status(404).json({ errore: 'Nessuna foto per questa segnalazione.' });
    }
    const filePath = path.join(__dirname, '..', 'uploads', 'manutenzione', result.rows[0].foto_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ errore: 'File non trovato sul server.' });
    }
    res.sendFile(filePath);
  } catch (err) {
    console.error('Errore foto manutenzione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/manutenzione/:id/stato — aggiorna stato (presa in carico, risoluzione)
// Accessibile a: admin, titolare (azione 'gestione')
async function aggiornaStato(req, res) {
  const { id } = req.params;
  const { stato, note_risoluzione } = req.body;

  if (!stato || !STATI_VALIDI.includes(stato)) {
    return res.status(400).json({ errore: `stato obbligatorio. Valori: ${STATI_VALIDI.join(', ')}.` });
  }

  try {
    const result = await pool.query(
      `UPDATE segnalazioni_manutenzione
       SET stato = $1,
           note_risoluzione = COALESCE($2, note_risoluzione),
           gestito_da = $3,
           aggiornato_il = now(),
           risolta_il = CASE WHEN $1::VARCHAR = 'risolta' THEN now() ELSE risolta_il END
       WHERE id = $4
       RETURNING *`,
      [stato, note_risoluzione || null, req.utente.id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Segnalazione non trovata.' });
    }
    res.json({ segnalazione: result.rows[0] });
  } catch (err) {
    console.error('Errore aggiornaStato manutenzione:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, crea, foto, aggiornaStato, LABEL_LUOGO };
