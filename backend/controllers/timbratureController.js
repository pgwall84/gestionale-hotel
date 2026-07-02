// Controller timbrature — entrata/uscita dipendenti.
// Ogni dipendente ha un solo "turno aperto" alla volta:
// non si può timbrare due entrate di fila senza un'uscita in mezzo.

const pool = require('../config/db');

// POST /api/timbrature
// Il dipendente preme il pulsante: il sistema capisce automaticamente
// se è entrata o uscita in base all'ultima timbratura.
async function timbra(req, res) {
  const userId = req.utente.id;
  const { note } = req.body;

  try {
    // Cerca l'ultima timbratura dell'utente per determinare il tipo
    const ultima = await pool.query(
      'SELECT tipo FROM timbrature WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [userId]
    );

    // Se l'ultima è "entrata" (o non ce ne sono), la prossima è "uscita" e viceversa
    const tipoCorrente = ultima.rows.length === 0 || ultima.rows[0].tipo === 'uscita'
      ? 'entrata'
      : 'uscita';

    const result = await pool.query(
      'INSERT INTO timbrature (user_id, tipo, note) VALUES ($1, $2, $3) RETURNING *',
      [userId, tipoCorrente, note || null]
    );

    res.status(201).json({
      timbratura: result.rows[0],
      messaggio: tipoCorrente === 'entrata' ? 'Buon lavoro! Entrata registrata.' : 'Arrivederci! Uscita registrata.',
    });
  } catch (err) {
    console.error('Errore timbratura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/timbrature/stato
// Ritorna lo stato attuale dell'utente: dentro/fuori + ultima timbratura.
// Il frontend lo usa per mostrare il pulsante corretto (ENTRATA o USCITA).
async function statoCorrente(req, res) {
  const userId = req.utente.id;
  try {
    const result = await pool.query(
      'SELECT * FROM timbrature WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [userId]
    );

    const ultima = result.rows[0] || null;
    const dentroStruttura = ultima?.tipo === 'entrata';

    res.json({
      dentroStruttura,
      prossimaTimbratua: dentroStruttura ? 'uscita' : 'entrata',
      ultimaTimbatura: ultima,
    });
  } catch (err) {
    console.error('Errore stato timbratura:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/timbrature/storico?mese=2026-06
// Storico timbrature dell'utente corrente filtrato per mese.
async function storico(req, res) {
  const userId = req.utente.id;
  const { mese } = req.query; // formato YYYY-MM

  try {
    let query = 'SELECT * FROM timbrature WHERE user_id = $1';
    const params = [userId];

    if (mese) {
      query += ' AND TO_CHAR(timestamp, \'YYYY-MM\') = $2';
      params.push(mese);
    } else {
      // Default: ultimi 30 giorni
      query += ' AND timestamp >= NOW() - INTERVAL \'30 days\'';
    }

    query += ' ORDER BY timestamp DESC';
    const result = await pool.query(query, params);
    res.json({ timbrature: result.rows });
  } catch (err) {
    console.error('Errore storico timbrature:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/timbrature/presenti
// Ritorna chi è attualmente in struttura (ultima timbratura = entrata).
// Solo titolare può vederlo.
async function presenti(req, res) {
  try {
    // Subquery: per ogni utente prende solo l'ultima timbratura
    const result = await pool.query(`
      SELECT DISTINCT ON (t.user_id)
        t.user_id, t.tipo, t.timestamp,
        u.nome, u.cognome, u.ruolo
      FROM timbrature t
      JOIN users u ON u.id = t.user_id
      WHERE u.attivo = true
      ORDER BY t.user_id, t.timestamp DESC
    `);

    // Filtra solo chi ha "entrata" come ultima timbratura
    const presenti = result.rows.filter(r => r.tipo === 'entrata');
    res.json({ presenti });
  } catch (err) {
    console.error('Errore presenti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/hr/timbrature/export?da=2026-06-01&a=2026-06-30
// Export Excel timbrature per range di date — utile per il consulente del lavoro.
async function exportExcel(req, res) {
  const oggi = new Date().toISOString().split('T')[0];
  const primoMese = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const da = req.query.da || primoMese;
  const a  = req.query.a  || oggi;

  try {
    const result = await pool.query(`
      SELECT u.nome, u.cognome, u.ruolo, t.tipo, t.timestamp, t.note
      FROM timbrature t
      JOIN users u ON u.id = t.user_id
      WHERE t.timestamp::date BETWEEN $1 AND $2
      ORDER BY u.cognome, u.nome, t.timestamp
    `, [da, a]);

    const XLSX = require('xlsx');

    const righe = result.rows.map(r => ({
      'Cognome': r.cognome,
      'Nome':    r.nome,
      'Ruolo':   r.ruolo,
      'Tipo':    r.tipo,
      'Data':    new Date(r.timestamp).toLocaleDateString('it-IT'),
      'Ora':     new Date(r.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      'Note':    r.note || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(righe);
    XLSX.utils.book_append_sheet(wb, ws, `Timbrature`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="timbrature_${da}_${a}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Errore export Excel:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/hr/timbrature/report-mensile?mese=2026-06
// Report mensile per il consulente del lavoro.
// Foglio 1: dettaglio giornaliero (entrata/uscita/ore per dipendente)
// Foglio 2: riepilogo (totale ore mese per dipendente + assenze)
async function reportMensile(req, res) {
  const mese = req.query.mese || new Date().toISOString().slice(0, 7); // YYYY-MM
  const [anno, meseNum] = mese.split('-').map(Number);
  const primoGiorno = `${mese}-01`;
  const ultimoGiorno = new Date(anno, meseNum, 0).toISOString().split('T')[0];

  try {
    const XLSX = require('xlsx');

    // 1. Timbrature del mese per tutti i dipendenti
    const timbrature = await pool.query(`
      SELECT t.user_id, t.tipo, t.timestamp, u.nome, u.cognome, u.ruolo
      FROM timbrature t JOIN users u ON u.id = t.user_id
      WHERE t.timestamp::date BETWEEN $1 AND $2 AND u.attivo = true
      ORDER BY u.cognome, u.nome, t.timestamp
    `, [primoGiorno, ultimoGiorno]);

    // 2. Assenze approvate del mese
    const assenze = await pool.query(`
      SELECT a.user_id, a.tipo, a.data_inizio, a.data_fine
      FROM richieste_assenza a
      WHERE a.stato = 'approvata'
        AND a.data_inizio <= $2 AND a.data_fine >= $1
    `, [primoGiorno, ultimoGiorno]);

    // 3. Tutti gli utenti attivi
    const utenti = await pool.query(
      `SELECT id, nome, cognome, ruolo FROM users WHERE attivo = true ORDER BY cognome, nome`
    );

    // Calcola coppie entrata/uscita per giorno per utente
    const pairsPerUser = {}; // user_id → { 'YYYY-MM-DD' → [{entrata, uscita, ore}] }
    const timRows = timbrature.rows;
    const openEntry = {}; // user_id → timestamp entrata

    for (const r of timRows) {
      const uid = r.user_id;
      const ts = new Date(r.timestamp);
      const giorno = ts.toISOString().split('T')[0];
      if (!pairsPerUser[uid]) pairsPerUser[uid] = {};
      if (!pairsPerUser[uid][giorno]) pairsPerUser[uid][giorno] = [];

      if (r.tipo === 'entrata') {
        openEntry[uid] = ts;
      } else if (r.tipo === 'uscita' && openEntry[uid]) {
        const ore = (ts - openEntry[uid]) / 3600000;
        pairsPerUser[uid][giorno].push({
          entrata: openEntry[uid].toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          uscita:  ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          ore:     Math.round(ore * 100) / 100,
        });
        delete openEntry[uid];
      }
    }

    // Assenze per utente
    const assenzePerUser = {}; // user_id → Set di date
    const asenzaTipo = {};     // user_id+data → tipo
    for (const a of assenze.rows) {
      if (!assenzePerUser[a.user_id]) assenzePerUser[a.user_id] = new Set();
      const d = new Date(a.data_inizio);
      const fine = new Date(a.data_fine);
      while (d <= fine) {
        const k = d.toISOString().split('T')[0];
        assenzePerUser[a.user_id].add(k);
        asenzaTipo[`${a.user_id}_${k}`] = a.tipo[0].toUpperCase(); // F/M/P
        d.setDate(d.getDate() + 1);
      }
    }

    // ── Foglio 1: Dettaglio giornaliero ──
    const righeDettaglio = [];
    for (const u of utenti.rows) {
      const giorni = pairsPerUser[u.id] || {};
      for (const [giorno, coppie] of Object.entries(giorni)) {
        const totOre = coppie.reduce((s, c) => s + c.ore, 0);
        for (const c of coppie) {
          righeDettaglio.push({
            'Cognome': u.cognome,
            'Nome':    u.nome,
            'Ruolo':   u.ruolo,
            'Data':    new Date(giorno).toLocaleDateString('it-IT'),
            'Entrata': c.entrata,
            'Uscita':  c.uscita,
            'Ore':     c.ore,
          });
        }
      }
      // Giorni assenza senza timbrature
      for (const d of (assenzePerUser[u.id] || new Set())) {
        if (!giorni[d]) {
          const tipo = asenzaTipo[`${u.id}_${d}`];
          const label = tipo === 'F' ? 'Ferie' : tipo === 'M' ? 'Malattia' : 'Permesso';
          righeDettaglio.push({
            'Cognome': u.cognome,
            'Nome':    u.nome,
            'Ruolo':   u.ruolo,
            'Data':    new Date(d).toLocaleDateString('it-IT'),
            'Entrata': label,
            'Uscita':  '',
            'Ore':     0,
          });
        }
      }
    }
    righeDettaglio.sort((a, b) => a.Cognome.localeCompare(b.Cognome) || a.Data.localeCompare(b.Data));

    // ── Foglio 2: Riepilogo mensile ──
    const righeRiepilogo = utenti.rows.map(u => {
      const giorni = pairsPerUser[u.id] || {};
      const totOre = Object.values(giorni).flat().reduce((s, c) => s + c.ore, 0);
      const giorniLavorati = Object.keys(giorni).length;
      const as = assenzePerUser[u.id] || new Set();
      const ferie = [...as].filter(d => asenzaTipo[`${u.id}_${d}`] === 'F').length;
      const malattia = [...as].filter(d => asenzaTipo[`${u.id}_${d}`] === 'M').length;
      const permessi = [...as].filter(d => asenzaTipo[`${u.id}_${d}`] === 'P').length;
      return {
        'Cognome':           u.cognome,
        'Nome':              u.nome,
        'Ruolo':             u.ruolo,
        'Giorni lavorati':   giorniLavorati,
        'Ore totali':        Math.round(totOre * 100) / 100,
        'Giorni ferie':      ferie,
        'Giorni malattia':   malattia,
        'Giorni permesso':   permessi,
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righeDettaglio), 'Dettaglio');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righeRiepilogo), 'Riepilogo');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nomeMese = new Date(`${mese}-01`).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report_${mese}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Errore report mensile:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { timbra, statoCorrente, storico, presenti, exportExcel, reportMensile };
