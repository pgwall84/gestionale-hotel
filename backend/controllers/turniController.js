// Controller turni — calendario settimanale dipendenti.

const pool = require('../config/db');

// GET /api/turni?settimana=2026-06-23
// Turni della settimana (dal lunedì alla domenica).
// Se non specificata, ritorna la settimana corrente.
async function lista(req, res) {
  const { settimana, user_id } = req.query;

  // Calcola lunedì della settimana richiesta — usa date locali per evitare shift UTC
  function localISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const g = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${g}`;
  }

  let lunedi;
  if (settimana) {
    const [y, mo, g] = settimana.split('-').map(Number);
    lunedi = new Date(y, mo - 1, g);
  } else {
    lunedi = new Date();
    const dow = lunedi.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    lunedi.setDate(lunedi.getDate() + diff);
  }
  lunedi.setHours(0, 0, 0, 0);

  const domenica = new Date(lunedi);
  domenica.setDate(domenica.getDate() + 6);

  try {
    let query = `
      SELECT t.*, u.nome, u.cognome, u.ruolo
      FROM turni t JOIN users u ON u.id = t.user_id
      WHERE t.data BETWEEN $1 AND $2
    `;
    const params = [localISO(lunedi), localISO(domenica)];

    // Il dipendente vede solo i suoi turni, il titolare/admin vede tutti
    if (req.utente.ruolo !== 'titolare' && req.utente.ruolo !== 'admin') {
      query += ' AND t.user_id = $3';
      params.push(req.utente.id);
    } else if (user_id) {
      query += ' AND t.user_id = $3';
      params.push(user_id);
    }

    query += ' ORDER BY t.data, u.cognome';
    const result = await pool.query(query, params);
    res.json({ turni: result.rows });
  } catch (err) {
    console.error('Errore lista turni:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/turni — crea un turno (solo titolare)
async function crea(req, res) {
  const { user_id, data, ora_inizio, ora_fine, tipo_turno, note } = req.body;
  if (!user_id || !data) {
    return res.status(400).json({ errore: 'user_id e data sono obbligatori.' });
  }
  const isRiposo = tipo_turno === 'riposo';
  if (!isRiposo && (!ora_inizio || !ora_fine)) {
    return res.status(400).json({ errore: 'ora_inizio e ora_fine sono obbligatori per turni non di riposo.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO turni (user_id, data, ora_inizio, ora_fine, tipo_turno, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, data, isRiposo ? null : ora_inizio, isRiposo ? null : ora_fine, tipo_turno || null, note || null]
    );
    res.status(201).json({ turno: result.rows[0] });
  } catch (err) {
    console.error('Errore crea turno:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PUT /api/turni/:id — modifica turno (solo titolare)
async function modifica(req, res) {
  const { id } = req.params;
  const { ora_inizio, ora_fine, tipo_turno, note } = req.body;
  const isRiposo = tipo_turno === 'riposo';
  try {
    const result = await pool.query(
      `UPDATE turni SET ora_inizio=$1, ora_fine=$2, tipo_turno=$3, note=$4
       WHERE id=$5 RETURNING *`,
      [isRiposo ? null : (ora_inizio || null), isRiposo ? null : (ora_fine || null), tipo_turno || null, note || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ errore: 'Turno non trovato.' });
    res.json({ turno: result.rows[0] });
  } catch (err) {
    console.error('Errore modifica turno:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/turni/:id — elimina turno (solo titolare)
async function elimina(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM turni WHERE id = $1', [id]);
    res.json({ messaggio: 'Turno eliminato.' });
  } catch (err) {
    console.error('Errore elimina turno:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/hr/turni/applica-standard — genera i turni di un periodo a partire
// dal turno standard di ogni dipendente (solo titolare). Non sovrascrive mai
// un giorno che ha già un turno assegnato (manuale o da un'applicazione
// precedente) — scelta esplicita di Marco/titolare (11/08/2026): evita di
// cancellare in silenzio scambi/modifiche già fatte a mano.
async function applicaStandardMese(req, res) {
  const { data_inizio, data_fine } = req.body;
  if (!data_inizio || !data_fine) {
    return res.status(400).json({ errore: 'data_inizio e data_fine sono obbligatori.' });
  }
  if (new Date(data_fine) < new Date(data_inizio)) {
    return res.status(400).json({ errore: 'data_fine deve essere successiva o uguale a data_inizio.' });
  }

  try {
    // Turni standard configurati per dipendenti attivi
    const standardRes = await pool.query(`
      SELECT ts.user_id, ts.tipo_turno, ts.ora_inizio, ts.ora_fine, ts.note
      FROM turni_standard ts JOIN users u ON u.id = ts.user_id
      WHERE u.attivo = true
    `);
    const standards = standardRes.rows;

    // Dipendenti attivi senza turno standard — nessun turno generato per loro,
    // vanno segnalati esplicitamente (altrimenti è un buco invisibile in griglia)
    const senzaStandardRes = await pool.query(`
      SELECT id, nome, cognome FROM users
      WHERE attivo = true AND id NOT IN (SELECT user_id FROM turni_standard)
      ORDER BY cognome, nome
    `);
    const dipendentiSenzaStandard = senzaStandardRes.rows.map(u => `${u.nome} ${u.cognome}`);

    if (standards.length === 0) {
      return res.json({ creati: 0, saltati: 0, dipendentiSenzaStandard });
    }

    // Turni già esistenti nel periodo — per non sovrascriverli.
    // types.setTypeParser(1082, ...) in config/db.js fa sì che t.data arrivi
    // già come stringa 'YYYY-MM-DD', nessuna conversione necessaria.
    const esistentiRes = await pool.query(
      'SELECT user_id, data FROM turni WHERE data BETWEEN $1 AND $2',
      [data_inizio, data_fine]
    );
    const esistentiSet = new Set(esistentiRes.rows.map(r => `${r.user_id}_${r.data}`));

    // Elenco dei giorni del periodo (date locali, evita shift di fuso)
    const giorni = [];
    const cursore = new Date(`${data_inizio}T00:00:00`);
    const fine = new Date(`${data_fine}T00:00:00`);
    while (cursore <= fine) {
      const y = cursore.getFullYear();
      const m = String(cursore.getMonth() + 1).padStart(2, '0');
      const g = String(cursore.getDate()).padStart(2, '0');
      giorni.push(`${y}-${m}-${g}`);
      cursore.setDate(cursore.getDate() + 1);
    }

    // Righe da inserire — salta ogni combinazione utente+giorno già presente
    const righe = [];
    let saltati = 0;
    for (const s of standards) {
      const isRiposo = s.tipo_turno === 'riposo';
      for (const giorno of giorni) {
        if (esistentiSet.has(`${s.user_id}_${giorno}`)) { saltati++; continue; }
        righe.push([
          s.user_id, giorno,
          isRiposo ? null : s.ora_inizio,
          isRiposo ? null : s.ora_fine,
          s.tipo_turno,
          s.note || null,
        ]);
      }
    }

    if (righe.length > 0) {
      const placeholders = righe.map((_, i) => {
        const b = i * 6;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
      }).join(', ');
      await pool.query(
        `INSERT INTO turni (user_id, data, ora_inizio, ora_fine, tipo_turno, note) VALUES ${placeholders}`,
        righe.flat()
      );
    }

    res.json({ creati: righe.length, saltati, dipendentiSenzaStandard });
  } catch (err) {
    console.error('Errore applica standard mese:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, crea, modifica, elimina, applicaStandardMese };
