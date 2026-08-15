const pool = require('../config/db');
const xlsx = require('xlsx');

const OGGI = () => new Date().toISOString().split('T')[0];

// Aggiorna stato "scaduta" per prenotazioni già inviate ma ospite partito
async function aggiornaScadute() {
  await pool.query(`
    UPDATE ztl_prenotazioni
    SET stato = 'scaduta'
    WHERE stato = 'inviata'
      AND data_partenza < CURRENT_DATE
  `);
}

// GET /api/ztl?stato=&data= — lista prenotazioni attive oggi (o per data), filtrabili per stato
async function lista(req, res) {
  const { stato, data } = req.query;
  const dataRef = data || OGGI();
  try {
    await aggiornaScadute();
    const r = await pool.query(`
      SELECT z.*,
             u.nome AS inviata_da_nome, u.cognome AS inviata_da_cognome
      FROM ztl_prenotazioni z
      LEFT JOIN users u ON u.id = z.inviata_da
      WHERE $1 BETWEEN z.data_arrivo AND z.data_partenza
        AND ($2::text IS NULL OR z.stato = $2)
      ORDER BY
        CASE z.stato
          WHEN 'mancante'       THEN 1
          WHEN 'da_inviare'     THEN 2
          WHEN 'scaduta'        THEN 3
          WHEN 'inviata'        THEN 4
          WHEN 'conclusa'       THEN 5
          WHEN 'non_necessaria' THEN 6
        END,
        z.camera_numero
    `, [dataRef, stato || null]);
    res.json({ prenotazioni: r.rows, data: dataRef });
  } catch (err) {
    console.error('Errore lista ZTL:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/ztl/alert — per la dashboard: camere senza targa oggi
async function alert(req, res) {
  try {
    const r = await pool.query(`
      SELECT camera_numero, ospite_nome, stato
      FROM ztl_prenotazioni
      WHERE CURRENT_DATE BETWEEN data_arrivo AND data_partenza
        AND stato IN ('mancante','da_inviare')
      ORDER BY camera_numero
    `);
    res.json({ alert: r.rows, count: r.rows.length });
  } catch (err) {
    res.status(500).json({ errore: 'Errore interno.' });
  }
}

// PATCH /api/ztl/:id/targa — receptionist salva la targa (OCR o manuale)
async function salvaTarga(req, res) {
  const { id } = req.params;
  const { targa, note } = req.body;
  if (!targa) return res.status(400).json({ errore: 'Targa obbligatoria.' });
  try {
    const r = await pool.query(`
      UPDATE ztl_prenotazioni
      SET targa = UPPER($1),
          note  = COALESCE($2, note),
          stato = 'da_inviare'
      WHERE id = $3
      RETURNING *
    `, [targa.trim(), note || null, id]);
    if (!r.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata.' });
    res.json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('Errore salva targa:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ztl/:id/invia — titolare segna come inviata al Comune
async function segnaInviata(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      UPDATE ztl_prenotazioni
      SET stato      = 'inviata',
          inviata_at = NOW(),
          inviata_da = $1
      WHERE id = $2 AND stato = 'da_inviare'
      RETURNING *
    `, [req.utente.id, id]);
    if (!r.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata o non in stato da_inviare.' });
    res.json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('Errore segna inviata:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ztl/manuale — inserimento manuale singola prenotazione
async function inserisciManuale(req, res) {
  const { camera_numero, ospite_nome, data_arrivo, data_partenza, targa, note } = req.body;
  if (!camera_numero || !data_arrivo || !data_partenza) {
    return res.status(400).json({ errore: 'Camera, arrivo e partenza sono obbligatori.' });
  }
  try {
    const r = await pool.query(`
      INSERT INTO ztl_prenotazioni
        (camera_numero, ospite_nome, data_arrivo, data_partenza, targa, stato, note, import_source, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'manuale', $8)
      ON CONFLICT (camera_numero, data_arrivo) DO UPDATE SET
        ospite_nome   = EXCLUDED.ospite_nome,
        data_partenza = EXCLUDED.data_partenza,
        note          = COALESCE(EXCLUDED.note, ztl_prenotazioni.note)
      RETURNING *
    `, [camera_numero, ospite_nome || null, data_arrivo, data_partenza,
        targa ? targa.toUpperCase() : null,
        targa ? 'da_inviare' : 'mancante',
        note || null, req.utente.id]);
    res.status(201).json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('Errore inserimento manuale ZTL:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// Upsert di una singola riga in ztl_prenotazioni, per camera_numero+data_arrivo
// (vincolo unico già esistente). Estratta da importExcel il 15/08/2026 per
// essere riusata anche da sincronizzaDaPlanning (switch temporaneo modalità
// import, vedi configurazione_ztl) — stessa logica, sorgente diversa.
// Non tocca MAI una riga già 'inviata'/'conclusa' (già inviata al Comune o
// ospite partito): in quel caso segnala solo un conflitto se le date sono
// cambiate, non sovrascrive.
async function upsertPrenotazioneZtl({ camera, ospite, arrivo, partenza, source, userId }) {
  const esistente = await pool.query(
    'SELECT id, targa, stato, data_partenza FROM ztl_prenotazioni WHERE camera_numero = $1 AND data_arrivo = $2',
    [camera, arrivo]
  );

  if (esistente.rows.length) {
    const ex = esistente.rows[0];
    if (ex.data_partenza !== partenza && ex.stato === 'inviata') {
      return { esito: 'conflitto', conflitto: { camera, ospite, arrivo, partenzaVecchia: ex.data_partenza, partenzaNuova: partenza, targa: ex.targa } };
    }
    if (!ex.targa || ex.data_partenza !== partenza) {
      await pool.query(`
        UPDATE ztl_prenotazioni SET
          ospite_nome   = COALESCE($1, ospite_nome),
          data_partenza = $2,
          import_source = $3
        WHERE id = $4 AND stato NOT IN ('inviata','conclusa')
      `, [ospite, partenza, source, ex.id]);
      return { esito: 'aggiornata' };
    }
    return { esito: 'saltata' };
  }

  await pool.query(`
    INSERT INTO ztl_prenotazioni
      (camera_numero, ospite_nome, data_arrivo, data_partenza, stato, import_source, created_by)
    VALUES ($1, $2, $3, $4, 'mancante', $5, $6)
  `, [camera, ospite, arrivo, partenza, source, userId]);
  return { esito: 'nuova' };
}

// GET /api/ztl/configurazione — modalità attiva (excel_ts | planning_interno).
// Switch TEMPORANEO (15/08/2026, vedi migration 038): oggi le prenotazioni
// reali restano su TeamSystem, quindi il default è excel_ts. Accessibile a
// chiunque abbia accesso a ZTL — solo lettura, nessun dato sensibile.
async function getConfigurazione(req, res) {
  try {
    const r = await pool.query('SELECT modalita, updated_at FROM configurazione_ztl WHERE id = 1');
    res.json(r.rows[0] || { modalita: 'excel_ts' });
  } catch (err) {
    console.error('Errore lettura configurazione ZTL:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ztl/configurazione — cambia modalità. Solo titolare/admin
// (soloTitolare), stessa soglia di Import TS/Export VigiPass.
async function impostaConfigurazione(req, res) {
  const { modalita } = req.body;
  if (!['excel_ts', 'planning_interno'].includes(modalita)) {
    return res.status(400).json({ errore: "modalita deve essere 'excel_ts' o 'planning_interno'." });
  }
  try {
    const r = await pool.query(
      `UPDATE configurazione_ztl SET modalita = $1, updated_at = NOW(), updated_by = $2 WHERE id = 1 RETURNING modalita, updated_at`,
      [modalita, req.utente.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Errore aggiornamento configurazione ZTL:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ztl/sincronizza-planning — popola ztl_prenotazioni da soggiorni
// interni, alternativa all'import Excel TS quando configurazione_ztl.modalita
// = 'planning_interno'. Finestra: da oggi a +30 giorni (arrivi), più chi è
// già in casa — copre lo stesso orizzonte utile dell'import TS senza tirare
// dentro prenotazioni lontanissime nel tempo. Un solo ospite per soggiorno
// (il titolare del soggiorno, ospite_id) anche se il nucleo familiare ne ha
// altri collegati — stessa semplificazione già usata altrove (es. alert
// Dashboard) perché ztl_prenotazioni ha un solo nome per camera.
// Solo titolare/admin.
async function sincronizzaDaPlanning(req, res) {
  try {
    const soggiorni = await pool.query(`
      SELECT c.numero::text AS camera_numero,
             (o.cognome || ' ' || o.nome) AS ospite_nome,
             s.data_arrivo, s.data_partenza
      FROM soggiorni s
      JOIN camere c ON c.id = s.camera_id
      JOIN ospiti o ON o.id = s.ospite_id
      WHERE s.cancellato = false
        AND s.data_partenza >= CURRENT_DATE
        AND s.data_arrivo <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY s.data_arrivo
    `);

    // Stessi nomi di campo di importExcel (camereConflitto/errori) — le due
    // risposte sono intercambiabili per un eventuale componente di riepilogo
    // condiviso in UI, invece di due forme diverse per lo stesso concetto.
    const risultati = { nuove: 0, aggiornate: 0, saltate: 0, errori: [], camereConflitto: [] };
    for (const riga of soggiorni.rows) {
      const camera = String(riga.camera_numero || '').trim().replace(/^0+/, '');
      if (!camera) { risultati.saltate++; continue; }
      try {
        const esito = await upsertPrenotazioneZtl({
          camera,
          ospite: riga.ospite_nome,
          arrivo: riga.data_arrivo,
          partenza: riga.data_partenza,
          source: 'planning_interno',
          userId: req.utente.id,
        });
        if (esito.esito === 'conflitto') risultati.camereConflitto.push(esito.conflitto);
        else if (esito.esito === 'nuova') risultati.nuove++;
        else if (esito.esito === 'aggiornata') risultati.aggiornate++;
        else risultati.saltate++;
      } catch (e) {
        risultati.errori.push(`Camera ${camera}: ${e.message}`);
      }
    }

    res.json({ risultati });
  } catch (err) {
    console.error('Errore sincronizzazione ZTL da planning:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ztl/import — import Excel da TeamSystem Hospitality
// Colonne attese (flessibili): Camera/Stanza/Room, Ospite/Guest/Cognome, Arrivo/CheckIn, Partenza/CheckOut
async function importExcel(req, res) {
  if (!req.file) return res.status(400).json({ errore: 'File Excel non ricevuto.' });
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const righe = xlsx.utils.sheet_to_json(ws, { defval: '' });

    if (!righe.length) return res.status(400).json({ errore: 'Il file Excel è vuoto.' });

    // Mappa flessibile dei nomi colonna (case-insensitive)
    const prima = Object.keys(righe[0]);
    function trova(candidati) {
      return prima.find(k => candidati.some(c => k.toLowerCase().includes(c.toLowerCase())));
    }

    const colCamera   = trova(['camera','stanza','room','numero']);
    const colOspite   = trova(['ospite','guest','cognome','nome','cliente']);
    const colArrivo   = trova(['arrivo','check-in','checkin','arrival','dal']);
    const colPartenza = trova(['partenza','check-out','checkout','departure','al']);

    if (!colCamera || !colArrivo || !colPartenza) {
      return res.status(400).json({
        errore: 'Colonne non riconosciute. Servono: Camera, Arrivo, Partenza.',
        colonneRicevute: prima,
      });
    }

    function parseData(val) {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      const d = new Date(val);
      if (!isNaN(d)) return d.toISOString().split('T')[0];
      // Prova formato DD/MM/YYYY
      const m = String(val).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        const anno = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${anno}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      }
      return null;
    }

    const risultati = { nuove: 0, aggiornate: 0, saltate: 0, errori: [], camereConflitto: [] };

    for (const riga of righe) {
      const camera    = String(riga[colCamera] || '').trim().replace(/^0+/, '');
      const ospite    = colOspite ? String(riga[colOspite] || '').trim() : null;
      const arrivo    = parseData(riga[colArrivo]);
      const partenza  = parseData(riga[colPartenza]);

      if (!camera || !arrivo || !partenza) {
        risultati.saltate++;
        continue;
      }

      try {
        const esito = await upsertPrenotazioneZtl({
          camera, ospite, arrivo, partenza, source: 'excel_ts', userId: req.utente.id,
        });
        if (esito.esito === 'conflitto') risultati.camereConflitto.push(esito.conflitto);
        else if (esito.esito === 'nuova') risultati.nuove++;
        else if (esito.esito === 'aggiornata') risultati.aggiornate++;
        else risultati.saltate++;
      } catch (e) {
        risultati.errori.push(`Camera ${camera}: ${e.message}`);
      }
    }

    // Marca come "conclusa" le prenotazioni attive non presenti nel nuovo Excel
    // (non cancella, mantiene storico)
    res.json({ risultati });
  } catch (err) {
    console.error('Errore import Excel ZTL:', err);
    res.status(500).json({ errore: 'Errore nella lettura del file Excel.' });
  }
}

// GET /api/ztl/export — genera CSV per VigiPass (solo da_inviare)
async function esportaVigiPass(req, res) {
  try {
    const r = await pool.query(`
      SELECT camera_numero, ospite_nome, targa, data_arrivo, data_partenza
      FROM ztl_prenotazioni
      WHERE stato = 'da_inviare' AND targa IS NOT NULL
      ORDER BY camera_numero
    `);

    if (!r.rows.length) {
      return res.status(404).json({ errore: 'Nessuna targa da inviare.' });
    }

    // CSV semplice compatibile con importazione manuale VigiPass
    const header = 'Targa;Cognome Ospite;Camera;Data Arrivo;Data Partenza';
    const righe = r.rows.map(row =>
      `${row.targa};${row.ospite_nome || ''};${row.camera_numero};${row.data_arrivo};${row.data_partenza}`
    );
    const csv = [header, ...righe].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ztl_vigipass_${OGGI()}.csv"`);
    res.send('﻿' + csv); // BOM per Excel italiano
  } catch (err) {
    console.error('Errore export VigiPass:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ztl/:id/non-necessaria — ospite senza auto, nessuna azione ZTL richiesta
async function segnaNonNecessaria(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      UPDATE ztl_prenotazioni
      SET stato = 'non_necessaria'
      WHERE id = $1 AND stato = 'mancante'
      RETURNING *
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata o non in stato mancante.' });
    res.json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('Errore segna non necessaria:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/ztl/:id
async function elimina(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('DELETE FROM ztl_prenotazioni WHERE id = $1 RETURNING id', [id]);
    if (!r.rows.length) return res.status(404).json({ errore: 'Non trovato.' });
    res.json({ messaggio: 'Eliminato.' });
  } catch (err) {
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  lista, alert, salvaTarga, segnaInviata, segnaNonNecessaria, inserisciManuale, importExcel, esportaVigiPass, elimina,
  getConfigurazione, impostaConfigurazione, sincronizzaDaPlanning,
};
