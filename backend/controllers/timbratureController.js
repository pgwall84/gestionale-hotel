// Controller timbrature — entrata/uscita dipendenti.
// Ogni dipendente ha un solo "turno aperto" alla volta:
// non si può timbrare due entrate di fila senza un'uscita in mezzo.

const pool = require('../config/db');

// POST /api/timbrature
// Il dipendente preme il pulsante: il sistema capisce automaticamente
// se è entrata o uscita in base all'ultima timbratura.
async function timbra(req, res) {
  const userId = req.utente.id;
  const { note, latitudine, longitudine, distanza_hotel } = req.body;

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

    // Geolocalizzazione: opzionale, verificata lato client (vedi timbratura/page.jsx),
    // qui salvata solo per audit — nessuna validazione server-side della posizione.
    const result = await pool.query(
      `INSERT INTO timbrature (user_id, tipo, note, latitudine, longitudine, distanza_hotel)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, tipoCorrente, note || null, latitudine ?? null, longitudine ?? null, distanza_hotel ?? null]
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
// Formatta una data locale come 'YYYY-MM-DD' senza passare da toISOString()
// (che converte in UTC e può far slittare il giorno) — stesso pattern già
// usato altrove nel file per costruire elenchi di giorni.
function fmtDataLocale(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function reportMensile(req, res) {
  const mese = req.query.mese || new Date().toISOString().slice(0, 7); // YYYY-MM
  const [anno, meseNum] = mese.split('-').map(Number);
  const primoGiorno = `${mese}-01`;
  // Bug reale trovato il 13/08/2026 verificando il fix sullo scavalco mese:
  // `new Date(anno, meseNum, 0).toISOString()` costruisce l'ultimo giorno
  // del mese come MEZZANOTTE LOCALE, poi lo converte in UTC per stringarlo
  // — sul server (fuso Europe/Rome, UTC+1/+2) questo fa SEMPRE slittare
  // indietro di un giorno. Risultato concreto: il report di luglio 2026
  // calcolava ultimoGiorno = '2026-07-30' invece di '2026-07-31', perdendo
  // l'ultimo giorno di OGNI mese, sempre — non solo nei turni notturni,
  // proprio nel range di date passato alle query. Verificato con
  // `TZ=Europe/Rome node -e "..."` prima di correggere. Fix: fmtDataLocale,
  // che legge i componenti della data locale invece di passare da UTC.
  const ultimoGiorno = fmtDataLocale(new Date(anno, meseNum, 0));

  // Finestra di lettura timbrature allargata di un giorno su entrambi i lati
  // (fix 13/08/2026, richiesto dal titolare dopo il fix sull'attribuzione al
  // giorno di entrata): un turno che inizia l'ultimo giorno del mese — o
  // dell'anno, setDate() scavalca correttamente anche Dicembre→Gennaio — e
  // finisce nel mese successivo altrimenti non verrebbe mai contato, perché
  // la sua timbratura di uscita cadrebbe fuori dal range richiesto e non
  // verrebbe recuperata. Simmetrico: la stessa finestra allargata, applicata
  // al report del mese SUCCESSIVO, recupera l'entrata (datata l'ultimo
  // giorno del mese precedente) per chiudere correttamente quella coppia lì.
  // Il filtro subito dopo aver costruito pairsPerUser scarta poi i giorni
  // cuscinetto che non appartengono al mese richiesto, così i tre fogli
  // vedono solo i giorni corretti.
  const dataInizioQuery = new Date(`${primoGiorno}T00:00:00`);
  dataInizioQuery.setDate(dataInizioQuery.getDate() - 1);
  const dataFineQuery = new Date(`${ultimoGiorno}T00:00:00`);
  dataFineQuery.setDate(dataFineQuery.getDate() + 1);
  const primoGiornoQuery = fmtDataLocale(dataInizioQuery);
  const ultimoGiornoQuery = fmtDataLocale(dataFineQuery);

  try {
    const XLSX = require('xlsx');

    // 1. Timbrature del mese per tutti i dipendenti (+ un giorno cuscinetto
    // per lato, vedi commento sopra — filtrate di nuovo più sotto)
    const timbrature = await pool.query(`
      SELECT t.user_id, t.tipo, t.timestamp, u.nome, u.cognome, u.ruolo
      FROM timbrature t JOIN users u ON u.id = t.user_id
      WHERE t.timestamp::date BETWEEN $1 AND $2 AND u.attivo = true
      ORDER BY u.cognome, u.nome, t.timestamp
    `, [primoGiornoQuery, ultimoGiornoQuery]);

    // 2. Assenze approvate del mese
    const assenze = await pool.query(`
      SELECT a.user_id, a.tipo, a.data_inizio, a.data_fine
      FROM richieste_assenza a
      WHERE a.stato = 'approvata'
        AND a.data_inizio <= $2 AND a.data_fine >= $1
    `, [primoGiorno, ultimoGiorno]);

    // 3. Tutti gli utenti attivi (contratto_tipo serve al foglio 'Consulente', sotto)
    const utenti = await pool.query(
      `SELECT id, nome, cognome, ruolo, contratto_tipo FROM users WHERE attivo = true ORDER BY cognome, nome`
    );

    // 4. Turni del mese — per calcolare i ritardi (entrata reale vs ora_inizio turno)
    const turni = await pool.query(
      `SELECT user_id, data, ora_inizio FROM turni WHERE data BETWEEN $1 AND $2`,
      [primoGiorno, ultimoGiorno]
    );
    const turnoPerUser = {}; // user_id → { 'YYYY-MM-DD' → 'HH:MM:SS' }
    for (const t of turni.rows) {
      const uid = t.user_id;
      const giorno = new Date(t.data).toISOString().split('T')[0];
      if (!turnoPerUser[uid]) turnoPerUser[uid] = {};
      turnoPerUser[uid][giorno] = t.ora_inizio;
    }

    // Calcola coppie entrata/uscita per giorno per utente.
    //
    // Il turno appartiene al giorno della timbratura di ENTRATA, anche se
    // attraversa la mezzanotte (es. notturno 23:00 → 07:00 del giorno dopo)
    // — fix 13/08/2026. Prima 'giorno' veniva ricalcolato ad ogni riga e la
    // coppia finiva archiviata sotto il giorno della timbratura di USCITA:
    // per un turno diurno non cambiava nulla, ma un notturno finiva sempre
    // nella colonna del giorno *successivo* a quello in cui era iniziato,
    // su tutti e tre i fogli del report. Trovato popolando dati di test per
    // portiere_notte_test (fascia notturna, modulo contratti del 13/08).
    //
    // Un turno che inizia l'ultimo giorno del mese (o dell'anno) e finisce
    // nel mese successivo viene comunque agganciato correttamente, grazie
    // alla finestra di lettura allargata di un giorno per lato (vedi
    // primoGiornoQuery/ultimoGiornoQuery sopra) — i giorni cuscinetto fuori
    // dal mese richiesto vengono scartati subito dopo, appena sotto.
    const pairsPerUser = {}; // user_id → { 'YYYY-MM-DD' → [{entrata, uscita, ore}] }
    const timRows = timbrature.rows;
    const openEntry = {}; // user_id → { ts, giorno } dell'entrata in corso

    for (const r of timRows) {
      const uid = r.user_id;
      const ts = new Date(r.timestamp);

      if (r.tipo === 'entrata') {
        // fmtDataLocale, non toISOString(): un'entrata poco dopo mezzanotte
        // locale (es. 00:30) verrebbe convertita in UTC e finirebbe
        // sballata sul giorno PRIMA — stesso tipo di bug del fix su
        // ultimoGiorno sopra, trovato verificandolo con lo stesso comando.
        openEntry[uid] = { ts, giorno: fmtDataLocale(ts) };
      } else if (r.tipo === 'uscita' && openEntry[uid]) {
        const { ts: entrataTs, giorno } = openEntry[uid];
        const ore = (ts - entrataTs) / 3600000;
        if (!pairsPerUser[uid]) pairsPerUser[uid] = {};
        if (!pairsPerUser[uid][giorno]) pairsPerUser[uid][giorno] = [];
        pairsPerUser[uid][giorno].push({
          entrata:    entrataTs.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          entrataRaw: entrataTs,
          uscita:     ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          ore:        Math.round(ore * 100) / 100,
        });
        delete openEntry[uid];
      }
    }

    // Scarta i giorni cuscinetto (fuori dal mese richiesto, letti solo per
    // agganciare un turno a cavallo di inizio/fine mese — vedi sopra).
    // Fatto qui, una volta sola: tutti e tre i fogli condividono
    // pairsPerUser, quindi nessuno dei tre vede mai un giorno del mese
    // sbagliato.
    for (const uid of Object.keys(pairsPerUser)) {
      for (const giorno of Object.keys(pairsPerUser[uid])) {
        if (giorno < primoGiorno || giorno > ultimoGiorno) delete pairsPerUser[uid][giorno];
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

      // Ritardi: prima entrata del giorno oltre 15 min dopo l'ora_inizio del turno
      // assegnato quel giorno. Nessun turno assegnato → giorno non conteggiato.
      let ritardi = 0;
      const turniUtente = turnoPerUser[u.id] || {};
      for (const [giorno, oraInizio] of Object.entries(turniUtente)) {
        const primaEntrata = giorni[giorno]?.[0]?.entrataRaw;
        if (!primaEntrata) continue;
        const [h, m] = oraInizio.split(':').map(Number);
        const inizioTurno = new Date(primaEntrata);
        inizioTurno.setHours(h, m, 0, 0);
        const minutiRitardo = (primaEntrata - inizioTurno) / 60000;
        if (minutiRitardo > 15) ritardi++;
      }

      return {
        'Cognome':           u.cognome,
        'Nome':              u.nome,
        'Ruolo':             u.ruolo,
        'Giorni lavorati':   giorniLavorati,
        'Ore totali':        Math.round(totOre * 100) / 100,
        'Giorni ferie':      ferie,
        'Giorni malattia':   malattia,
        'Giorni permesso':   permessi,
        'Ritardi':           ritardi,
      };
    });

    // ── Foglio 3: Consulente (griglia giorno-per-giorno + straordinari) ──
    // Richiesto dal titolare 13/08/2026 (CLAUDE.md Sezione 16) — foglio
    // aggiuntivo per il consulente del lavoro, non sostituisce Dettaglio/
    // Riepilogo (quelli restano il sunto per il titolare). Due righe per
    // dipendente: ore lavorate e, sotto, straordinari — entrambe con una
    // colonna per ogni giorno del mese più il totale.
    //
    // Soglia straordinari = ore oltre lo standard del contratto: 8h per
    // tempo indeterminato, 5h per part-time (valori confermati dal
    // titolare). Per 'chiamata' o contratto non impostato non esiste una
    // soglia nota — invece di inventarne una si scrive "N/D" nei giorni
    // lavorati, da concordare con il consulente del lavoro.
    const SOGLIA_ORE_CONTRATTO = { tempo_indeterminato: 8, part_time: 5 };
    const numGiorniMese = new Date(anno, meseNum, 0).getDate();

    // Array di array, non oggetti con chiavi '1'..'31': in un oggetto JS le
    // chiavi che sembrano indici (stringhe numeriche intere) vengono SEMPRE
    // enumerate per prime, in ordine numerico, prima di qualunque chiave
    // testuale — indipendentemente dall'ordine di inserimento. È un
    // comportamento del linguaggio, non di XLSX: con json_to_sheet la
    // colonna "Dipendente" finiva quindi dopo tutti i giorni invece che
    // all'inizio (bug segnalato dal titolare il 13/08/2026, verificato
    // riproducendolo con `Object.keys()` prima di questo fix).
    // aoa_to_sheet non ha questo problema: l'ordine delle colonne è
    // esattamente quello dell'array.
    const intestazioneConsulente = ['Dipendente', ...Array.from({ length: numGiorniMese }, (_, i) => String(i + 1)), 'Totale'];
    const righeConsulente = [intestazioneConsulente];

    for (const u of utenti.rows) {
      const giorni = pairsPerUser[u.id] || {};
      const soglia = SOGLIA_ORE_CONTRATTO[u.contratto_tipo]; // undefined = chiamata/non impostato

      const rigaOre = [`${u.cognome} ${u.nome}`];
      const rigaStraord = ['  di cui straordinari'];
      let totaleOre = 0;
      let totaleStraord = 0;
      let haStraordNd = false;

      for (let g = 1; g <= numGiorniMese; g++) {
        const dataStr = `${mese}-${String(g).padStart(2, '0')}`;
        const oreGiorno = Math.round(((giorni[dataStr] || []).reduce((s, c) => s + c.ore, 0)) * 100) / 100;
        rigaOre.push(oreGiorno || '');
        totaleOre += oreGiorno;

        if (soglia === undefined) {
          if (oreGiorno > 0) haStraordNd = true;
          rigaStraord.push(oreGiorno > 0 ? 'N/D' : '');
        } else {
          const straord = Math.round(Math.max(0, oreGiorno - soglia) * 100) / 100;
          rigaStraord.push(straord > 0 ? straord : '');
          totaleStraord += straord;
        }
      }

      rigaOre.push(Math.round(totaleOre * 100) / 100);
      rigaStraord.push(soglia === undefined ? (haStraordNd ? 'N/D' : '') : Math.round(totaleStraord * 100) / 100);

      righeConsulente.push(rigaOre, rigaStraord);
    }

    const wsConsulente = XLSX.utils.aoa_to_sheet(righeConsulente);
    // Larghezza colonne (13/08/2026, richiesta del titolare): con 31 colonne
    // giorno più Dipendente e Totale una stampa orizzontale sforava
    // facilmente il foglio A4. I valori dei giorni sono sempre corti (un
    // numero con al più un decimale, o 'N/D') — non serve una colonna larga
    // quanto 'N/D' suggerirebbe a colpo d'occhio, è comunque il valore più
    // largo tra quelli possibili in quella colonna, quindi la stringa più
    // corta possibile che lo contiene senza tagliarlo. 'wch' = larghezza in
    // caratteri, unità nativa di SheetJS per '!cols'.
    // NOTA: SheetJS Community (xlsx@0.18.5, quello in uso) non scrive
    // l'orientamento di stampa (orizzontale/adatta a una pagina) nel file —
    // verificato generando un file di prova e ispezionando l'XML risultante,
    // '!pageSetup' viene ignorato in scrittura. Quell'impostazione va fatta
    // a mano in Excel (Layout di pagina ▸ Orientamento ▸ Orizzontale,
    // Adatta a ▸ 1 pagina) prima di stampare — non è automatizzabile con
    // questa libreria senza passare a una versione a pagamento.
    wsConsulente['!cols'] = [
      { wch: 24 }, // Dipendente
      ...Array.from({ length: numGiorniMese }, () => ({ wch: 4 })), // giorni 1..N
      { wch: 8 }, // Totale
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righeDettaglio), 'Dettaglio');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righeRiepilogo), 'Riepilogo');
    XLSX.utils.book_append_sheet(wb, wsConsulente, 'Consulente');

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
