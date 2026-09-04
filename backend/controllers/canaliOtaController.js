// Controller mappatura canali OTA (tipi_camera_canali) — Modulo 2.3, Fase 1.
// Associa ogni categoria camera (tipi_camera) a un codice esterno per
// canale (oggi solo 'wubook' — vedi migration 020). Sostituisce l'appunto
// manuale prima tenuto in tipi_camera.note. Nessuna chiamata esterna: i
// codici restano dati di configurazione finché non arriva la Fase 2/3 del
// modulo (ricezione webhook, invio disponibilità/tariffe).
// Accessibile in lettura a: admin, titolare, receptionist.
// Scrittura riservata a: admin, titolare (shared/ruoli.js sezione 'canali_ota').

const pool = require('../config/db');

const CANALE_DEFAULT = 'wubook';

// GET /api/canali-ota?canale=wubook — una riga per OGNI categoria camera,
// anche quelle senza codice ancora configurato (LEFT JOIN), così la UI può
// mostrare subito "Da configurare" senza un giro dati separato.
async function lista(req, res) {
  const canale = req.query.canale || CANALE_DEFAULT;
  try {
    const result = await pool.query(
      `SELECT tc.id AS tipo_camera_id, tc.nome AS tipo_camera_nome,
              $1::VARCHAR AS canale, tcc.codice_esterno, tcc.unita_esposte, tcc.maggiorazione_percentuale, tcc.updated_at
       FROM tipi_camera tc
       LEFT JOIN tipi_camera_canali tcc ON tcc.tipo_camera_id = tc.id AND tcc.canale = $1
       ORDER BY tc.nome`,
      [canale]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista canali_ota error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// PUT /api/canali-ota/:tipoCameraId — crea o aggiorna il codice esterno per
// una categoria+canale (upsert, ON CONFLICT su tipo_camera_id+canale).
// codice_esterno vuoto/omesso è ammesso: significa "nessun codice ancora",
// non un errore — permette di cancellare un codice inserito per sbaglio.
async function upsert(req, res) {
  const canale = (req.body.canale || CANALE_DEFAULT).trim();
  const codiceEsterno = req.body.codice_esterno && String(req.body.codice_esterno).trim()
    ? String(req.body.codice_esterno).trim()
    : null;
  const unitaEsposte = req.body.unita_esposte === undefined || req.body.unita_esposte === null || req.body.unita_esposte === ''
    ? null
    : Number(req.body.unita_esposte);
  const maggiorazionePercentuale = req.body.maggiorazione_percentuale === undefined || req.body.maggiorazione_percentuale === null
    ? 0
    : Number(req.body.maggiorazione_percentuale);

  if (unitaEsposte !== null && (Number.isNaN(unitaEsposte) || unitaEsposte < 0)) {
    return res.status(400).json({ error: 'unita_esposte deve essere un intero non negativo o vuoto.' });
  }
  if (Number.isNaN(maggiorazionePercentuale) || maggiorazionePercentuale < 0) {
    return res.status(400).json({ error: 'maggiorazione_percentuale deve essere un numero non negativo.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte, maggiorazione_percentuale, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tipo_camera_id, canale) DO UPDATE SET
         codice_esterno = EXCLUDED.codice_esterno,
         unita_esposte = EXCLUDED.unita_esposte,
         maggiorazione_percentuale = EXCLUDED.maggiorazione_percentuale,
         updated_at     = now()
       RETURNING *`,
      [req.params.tipoCameraId, canale, codiceEsterno, unitaEsposte, maggiorazionePercentuale]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Categoria camera non trovata.' });
    }
    console.error('upsert canali_ota error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { lista, upsert };
