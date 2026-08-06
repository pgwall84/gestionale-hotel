// Controller tassa di soggiorno — Modulo 2.4, Fase 2A.
// configurazione_tassa_soggiorno: storico aliquote deliberate dal Comune, mai
// sovrascritta. tasse_soggiorno: importo calcolato per ciascun soggiorno,
// congelato non appena riscosso. Vedi database/migrations/021_tassa_soggiorno.sql.
// Permessi per azione in shared/ruoli.js, sezione 'tassa_soggiorno'.

const pool = require('../config/db');
const xlsx = require('xlsx');

// GET /api/tassa-soggiorno/configurazione — storico aliquote, più recente prima.
// Accessibile a: admin, titolare (azione 'configurazione').
async function listaConfigurazione(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM configurazione_tassa_soggiorno ORDER BY valido_dal DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('lista configurazione tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tassa-soggiorno/configurazione — nuova aliquota.
// Chiude in transazione la configurazione precedente ancora aperta
// (valido_al IS NULL) impostando valido_al al giorno prima della nuova
// valido_dal, poi inserisce la nuova riga: lo storico resta continuo e senza
// sovrapposizioni, senza mai sovrascrivere una riga già deliberata.
// Accessibile a: admin, titolare (azione 'configurazione').
async function creaConfigurazione(req, res) {
  const { importo_a_notte, eta_esente_fino, notti_max_tassabili, valido_dal, note } = req.body;
  if (importo_a_notte === undefined || importo_a_notte === null || !valido_dal) {
    return res.status(400).json({ error: 'importo_a_notte e valido_dal sono obbligatori.' });
  }
  if (Number(importo_a_notte) <= 0) {
    return res.status(400).json({ error: "L'importo a notte deve essere maggiore di zero." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE configurazione_tassa_soggiorno
       SET valido_al = $1::date - 1
       WHERE valido_al IS NULL`,
      [valido_dal]
    );

    const result = await client.query(
      `INSERT INTO configurazione_tassa_soggiorno
         (importo_a_notte, eta_esente_fino, notti_max_tassabili, valido_dal, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [importo_a_notte, eta_esente_fino || null, notti_max_tassabili || null, valido_dal, note || null]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23514') { // check_violation — vedi chk_configurazione_tassa_soggiorno_periodo
      return res.status(400).json({ error: 'valido_dal deve essere successivo di almeno un giorno alla configurazione precedente.' });
    }
    console.error('crea configurazione tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// GET /api/tassa-soggiorno/calcolo/:soggiorno_id — calcolo lazy e idempotente.
// Se il soggiorno ha già una riga riscossa (importo_riscosso NOT NULL), la
// restituisce congelata così com'è. Altrimenti (ri)calcola da soggiorni,
// soggiorno_ospiti/ospiti e l'aliquota vigente alla data di arrivo, e fa
// upsert della riga in tasse_soggiorno.
// Accessibile a: admin, titolare, receptionist (azione 'lettura').
async function calcola(req, res) {
  const { soggiorno_id } = req.params;
  try {
    const soggiornoRes = await pool.query(
      `SELECT id, data_arrivo, data_partenza, (data_partenza - data_arrivo) AS notti_totali
       FROM soggiorni WHERE id = $1`,
      [soggiorno_id]
    );
    if (!soggiornoRes.rows.length) {
      return res.status(404).json({ error: 'Soggiorno non trovato.' });
    }
    const soggiorno = soggiornoRes.rows[0];

    const esistenteRes = await pool.query(
      'SELECT * FROM tasse_soggiorno WHERE soggiorno_id = $1',
      [soggiorno_id]
    );
    if (esistenteRes.rows.length && esistenteRes.rows[0].importo_riscosso !== null) {
      return res.json(esistenteRes.rows[0]);
    }

    const configRes = await pool.query(
      `SELECT * FROM configurazione_tassa_soggiorno
       WHERE valido_dal <= $1 AND (valido_al IS NULL OR valido_al >= $1)
       ORDER BY valido_dal DESC LIMIT 1`,
      [soggiorno.data_arrivo]
    );
    if (!configRes.rows.length) {
      return res.status(404).json({ error: 'Nessuna aliquota configurata per questa data.' });
    }
    const config = configRes.rows[0];

    const nottiTotali = Number(soggiorno.notti_totali);
    const nottiTassabili = config.notti_max_tassabili === null
      ? nottiTotali
      : Math.min(nottiTotali, config.notti_max_tassabili);

    // Età calcolata in SQL (age()) alla data di arrivo — se eta_esente_fino è
    // NULL nessuna esenzione; se data_nascita di un ospite è ignota, non si
    // presume l'esenzione e l'ospite resta tassabile.
    const ospitiRes = await pool.query(
      `SELECT COUNT(*) FILTER (
         WHERE $2::smallint IS NULL
            OR o.data_nascita IS NULL
            OR EXTRACT(YEAR FROM age($3::date, o.data_nascita)) >= $2::smallint
       ) AS tassabili
       FROM soggiorno_ospiti so
       JOIN ospiti o ON o.id = so.ospite_id
       WHERE so.soggiorno_id = $1`,
      [soggiorno_id, config.eta_esente_fino, soggiorno.data_arrivo]
    );
    const ospitiTassabili = Number(ospitiRes.rows[0].tassabili);

    const importoDovuto = Number((Number(config.importo_a_notte) * nottiTassabili * ospitiTassabili).toFixed(2));

    const upsertRes = await pool.query(
      `INSERT INTO tasse_soggiorno
         (soggiorno_id, configurazione_id, notti_tassabili, ospiti_tassabili, importo_dovuto, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (soggiorno_id) DO UPDATE SET
         configurazione_id = EXCLUDED.configurazione_id,
         notti_tassabili   = EXCLUDED.notti_tassabili,
         ospiti_tassabili  = EXCLUDED.ospiti_tassabili,
         importo_dovuto    = EXCLUDED.importo_dovuto,
         updated_at        = now()
       RETURNING *`,
      [soggiorno_id, config.id, nottiTassabili, ospitiTassabili, importoDovuto]
    );

    res.json(upsertRes.rows[0]);
  } catch (err) {
    console.error('calcola tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/tassa-soggiorno/:soggiorno_id/riscuoti — segna l'incasso.
// Richiede una riga già calcolata (altrimenti 400) e non ancora riscossa
// (altrimenti 400 — niente doppie riscossioni, correzioni fuori scope).
// FOR UPDATE per evitare una doppia riscossione in caso di doppio click/
// richieste concorrenti sullo stesso soggiorno.
// Accessibile a: admin, titolare, receptionist (azione 'scrittura').
async function riscuoti(req, res) {
  const { soggiorno_id } = req.params;
  const { importo_riscosso, note } = req.body;
  if (importo_riscosso === undefined || importo_riscosso === null) {
    return res.status(400).json({ error: 'importo_riscosso è obbligatorio.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const esistente = await client.query(
      'SELECT importo_riscosso FROM tasse_soggiorno WHERE soggiorno_id = $1 FOR UPDATE',
      [soggiorno_id]
    );
    if (!esistente.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Calcola prima l'importo dovuto." });
    }
    if (esistente.rows[0].importo_riscosso !== null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Tassa già riscossa per questo soggiorno.' });
    }

    const result = await client.query(
      `UPDATE tasse_soggiorno
       SET importo_riscosso = $1,
           data_riscossione = now(),
           note = COALESCE($2, note),
           updated_at = now()
       WHERE soggiorno_id = $3
       RETURNING *`,
      [importo_riscosso, note || null, soggiorno_id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('riscuoti tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// Query condivisa fra report (JSON) ed export (Excel): tutti i soggiorni
// arrivati nel range, con o senza tassa già calcolata (LEFT JOIN) — il
// report deve mostrare anche cosa manca ancora da calcolare.
async function queryReport(dal, al) {
  return pool.query(
    `SELECT
       s.id AS soggiorno_id,
       c.numero AS camera_numero,
       o.nome AS ospite_nome,
       o.cognome AS ospite_cognome,
       s.data_arrivo,
       s.data_partenza,
       ts.notti_tassabili,
       ts.ospiti_tassabili,
       ts.importo_dovuto,
       ts.importo_riscosso,
       ts.data_riscossione
     FROM soggiorni s
     JOIN camere c ON c.id = s.camera_id
     JOIN ospiti o ON o.id = s.ospite_id
     LEFT JOIN tasse_soggiorno ts ON ts.soggiorno_id = s.id
     WHERE s.data_arrivo BETWEEN $1 AND $2
     ORDER BY s.data_arrivo, c.numero`,
    [dal, al]
  );
}

// GET /api/tassa-soggiorno/report?dal=&al= — elenco per il range di arrivo.
// Accessibile a: admin, titolare, receptionist (azione 'lettura').
async function report(req, res) {
  const { dal, al } = req.query;
  if (!dal || !al) {
    return res.status(400).json({ error: 'dal e al sono obbligatori.' });
  }
  try {
    const result = await queryReport(dal, al);
    res.json(result.rows);
  } catch (err) {
    console.error('report tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/tassa-soggiorno/report/export?dal=&al= — stesso report in Excel.
// data_arrivo/data_partenza arrivano già come stringa 'YYYY-MM-DD' (vedi
// type parser DATE in config/db.js) — formattate qui senza passare da un
// oggetto Date, per non reintrodurre lo shift di fuso orario che quel
// parser evita apposta.
// Accessibile a: admin, titolare, receptionist (azione 'lettura').
async function esportaExcel(req, res) {
  const { dal, al } = req.query;
  if (!dal || !al) {
    return res.status(400).json({ error: 'dal e al sono obbligatori.' });
  }
  try {
    const result = await queryReport(dal, al);

    const formattaDataIso = (iso) => {
      if (!iso) return '';
      const [anno, mese, giorno] = iso.split('-');
      return `${giorno}/${mese}/${anno}`;
    };

    const righe = result.rows.map(r => ({
      'Camera':           r.camera_numero,
      'Ospite':           `${r.ospite_cognome} ${r.ospite_nome}`,
      'Arrivo':           formattaDataIso(r.data_arrivo),
      'Partenza':         formattaDataIso(r.data_partenza),
      'Notti tassabili':  r.notti_tassabili,
      'Ospiti tassabili': r.ospiti_tassabili,
      'Dovuto':           r.importo_dovuto,
      'Riscosso':         r.importo_riscosso,
      'Data riscossione': r.data_riscossione ? new Date(r.data_riscossione).toLocaleDateString('it-IT') : '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(righe);
    xlsx.utils.book_append_sheet(wb, ws, 'Tassa di soggiorno');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tassa_soggiorno_${dal}_${al}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('export tassa soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { listaConfigurazione, creaConfigurazione, calcola, riscuoti, report, esportaExcel };
