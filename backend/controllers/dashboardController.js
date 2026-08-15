const pool = require('../config/db');
const { LABEL_LUOGO } = require('./manutenzioneController');

// Alloggiati Web: invii scaduti o ancora in coda (Fase C, 14/08/2026).
// Diverso dall'alert "documento incompleto" (quello è readiness PRIMA
// dell'arrivo — dati pronti per generare la schedina). Questo copre
// l'invio vero e proprio DOPO il check-in: prima di questa fase l'unico
// modo per sapere se qualcosa non era stato inviato era andare apposta in
// Impostazioni ▸ Alloggiati Web. Termine legale: 24h dall'arrivo
// (check_in_effettuato_at se presente — migration 035, Fase D — altrimenti
// data_arrivo 00:00 per i soggiorni più vecchi che non l'hanno mai
// valorizzato). La regola delle 6h per il day-use (arrivo e partenza lo
// stesso giorno) resta deliberatamente non implementata: nessuna
// prenotazione così esiste oggi nel sistema, stessa scelta già fatta per
// la Fase D — vedi docs/EVOLUTIVE.md.
//
// Estratta come funzione a sé (non inline in alert()) per essere testabile
// in isolamento: il titolare ha trovato il 14/08/2026 che nel DB di
// sviluppo esistono soggiorni REALI mai inviati (non dati di test) che
// riempiono da soli tutti e 5 gli slot del LIMIT, ordinato per urgenza —
// un test che si aspetta di trovare i propri fixture tra i risultati
// dell'endpoint HTTP fallisce non per un bug, ma perché il backlog reale è
// più vecchio/urgente dei dati appena creati dal test. soggiornoIds, se
// passato, filtra SOLO su quegli id — usato esclusivamente dai test per
// isolarsi dal backlog reale; alert() in produzione la chiama sempre senza
// filtro, comportamento identico a prima dell'estrazione.
async function alertInviiAlloggiati({ soggiornoIds } = {}) {
  const filtroIds = soggiornoIds ? 'AND s.id = ANY($1::int[])' : '';
  const params = soggiornoIds ? [soggiornoIds] : [];
  const invii = await pool.query(`
    WITH ultimo_tentativo AS (
      SELECT DISTINCT ON (soggiorno_id) soggiorno_id, esito
      FROM alloggiati_invii
      ORDER BY soggiorno_id, data_invio DESC
    )
    SELECT s.id, c.numero AS camera_numero, o.nome, o.cognome,
           COALESCE(s.check_in_effettuato_at, s.data_arrivo::timestamp) + INTERVAL '24 hours' AS termine
    FROM soggiorni s
    JOIN prenotazioni p ON p.id = s.prenotazione_id
    JOIN camere c ON c.id = s.camera_id
    JOIN ospiti o ON o.id = s.ospite_id
    LEFT JOIN ultimo_tentativo ut ON ut.soggiorno_id = s.id
    WHERE s.cancellato = false
      AND s.data_arrivo <= CURRENT_DATE
      AND p.canale_origine != 'test_interno'
      AND (ut.esito IS NULL OR ut.esito != 'ok')
      ${filtroIds}
    ORDER BY termine ASC
    LIMIT 5
  `, params);

  return invii.rows.map(r => {
    const scaduto = new Date(r.termine) <= new Date();
    return {
      type: scaduto ? 'red' : 'amber',
      text: `Camera ${r.camera_numero} — schedina Alloggiati Web ${scaduto ? 'in ritardo' : 'da inviare'} (${r.cognome} ${r.nome})`,
      category: 'Alloggiati Web · Invio',
      link: '/impostazioni/alloggiati',
    };
  });
}

// GET /api/dashboard/alert
// Aggrega alert reali da più moduli
async function alert(req, res) {
  try {
    const oggi = new Date().toISOString().slice(0, 10);
    const alerts = [];

    // ── ZTL: ospiti attualmente in struttura senza targa registrata ───────────
    const targhe = await pool.query(`
      SELECT ospite_nome, camera_numero
      FROM ztl_prenotazioni
      WHERE (targa IS NULL OR targa = '' OR stato = 'mancante')
        AND (data_arrivo AT TIME ZONE 'Europe/Rome')::date <= $1::date
        AND (data_partenza AT TIME ZONE 'Europe/Rome')::date >= $1::date
      ORDER BY camera_numero
    `, [oggi]);

    for (const r of targhe.rows) {
      alerts.push({
        type: 'red',
        text: `Camera ${r.camera_numero} — targa mancante (${r.ospite_nome})`,
        category: 'ZTL',
        link: '/ztl',
      });
    }

    // ── Menu: nessun piatto disponibile oggi ──────────────────────────────────
    const menuCheck = await pool.query(`
      SELECT COUNT(*) AS tot FROM menu_piatti WHERE disponibile = true
    `);
    const catCheck = await pool.query(`
      SELECT COUNT(*) AS tot FROM menu_categorie WHERE attivo = true
    `);

    if (Number(catCheck.rows[0].tot) === 0) {
      alerts.push({
        type: 'amber',
        text: 'Menu non configurato — nessuna categoria attiva',
        category: 'Menu',
        link: '/menu',
      });
    } else if (Number(menuCheck.rows[0].tot) === 0) {
      alerts.push({
        type: 'amber',
        text: 'Nessun piatto disponibile nel menu di oggi',
        category: 'Menu',
        link: '/menu',
      });
    }

    // ── HR: scadenze in arrivo (entro 30 giorni) ──────────────────────────────
    const scadenze = await pool.query(`
      SELECT s.tipo, s.note, s.data_scadenza, u.nome, u.cognome,
             (s.data_scadenza::date - CURRENT_DATE) AS giorni_mancanti
      FROM scadenze s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.data_scadenza::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
      ORDER BY s.data_scadenza
      LIMIT 5
    `);

    for (const s of scadenze.rows) {
      const chi = s.nome ? ` ${s.nome} ${s.cognome}` : '';
      const giorni = Number(s.giorni_mancanti);
      const desc = s.note || s.tipo;
      alerts.push({
        type: giorni <= 7 ? 'red' : 'amber',
        text: `${desc}${chi ? ` (${chi.trim()})` : ''} — scade tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`,
        category: 'HR · Scadenze',
        link: '/personale',
      });
    }

    // ── Magazzino: prodotti sotto la soglia minima configurata ────────────────
    const sottoscorta = await pool.query(`
      SELECT p.nome,
             COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza
      FROM prodotti p
      LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
      WHERE p.attivo = true
      GROUP BY p.id
      HAVING COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) < p.soglia_minima
      ORDER BY p.nome
      LIMIT 5
    `);

    for (const p of sottoscorta.rows) {
      alerts.push({
        type: 'amber',
        text: `${p.nome} sotto scorta (${parseFloat(p.giacenza)} rimasti)`,
        category: 'Magazzino',
        link: '/magazzino',
      });
    }

    // ── Prenotazioni: opzioni in scadenza entro 48h ────────────────────────────
    // (06/08/2026) Nessun cron di scadenza automatica ancora costruito (vedi
    // docs/EVOLUTIVE.md) — questo è solo un promemoria visivo, non cambia stato.
    const opzioni = await pool.query(`
      SELECT p.id, p.data_scadenza_opzione,
             string_agg(DISTINCT c.numero::text, ', ' ORDER BY c.numero::text) AS camere,
             (SELECT o.cognome || ' ' || o.nome FROM soggiorni s2 JOIN ospiti o ON o.id = s2.ospite_id
              WHERE s2.prenotazione_id = p.id AND s2.cancellato = false ORDER BY s2.id LIMIT 1) AS ospite
      FROM prenotazioni p
      JOIN soggiorni s ON s.prenotazione_id = p.id AND s.cancellato = false
      JOIN camere c ON c.id = s.camera_id
      WHERE p.stato = 'opzione' AND p.data_scadenza_opzione IS NOT NULL
        AND p.data_scadenza_opzione <= NOW() + INTERVAL '48 hours'
      GROUP BY p.id
      ORDER BY p.data_scadenza_opzione ASC
      LIMIT 5
    `);
    for (const o of opzioni.rows) {
      const scaduta = new Date(o.data_scadenza_opzione) <= new Date();
      alerts.push({
        type: scaduta ? 'red' : 'amber',
        text: `Camera ${o.camere} — opzione ${o.ospite || ''} ${scaduta ? 'scaduta' : 'in scadenza'}`,
        category: 'Prenotazioni',
        link: '/planning-camere',
      });
    }

    // ── Alloggiati Web: ospiti in arrivo oggi con documento incompleto ─────────
    // (06/08/2026) Non esiste ancora un invio reale da tracciare (modulo 2.5
    // Fase 2 non iniziata, alloggiati_invii resta vuota) — questo alert copre
    // lo stesso bisogno pratico ("siamo pronti per la schedina?") controllando
    // che i dati richiesti siano stati registrati, non l'invio in sé.
    const documentiMancanti = await pool.query(`
      SELECT DISTINCT c.numero AS camera_numero, o.nome, o.cognome
      FROM soggiorni s
      JOIN camere c ON c.id = s.camera_id
      JOIN soggiorno_ospiti so ON so.soggiorno_id = s.id
      JOIN ospiti o ON o.id = so.ospite_id
      WHERE s.data_arrivo = $1 AND s.cancellato = false
        AND (o.documento_numero IS NULL OR o.documento_tipo_testo IS NULL
             OR o.data_nascita IS NULL OR o.sesso IS NULL OR o.cittadinanza_testo IS NULL)
      ORDER BY c.numero
      LIMIT 5
    `, [oggi]);
    for (const d of documentiMancanti.rows) {
      alerts.push({
        type: 'amber',
        text: `Camera ${d.camera_numero} — documento incompleto per Alloggiati Web (${d.cognome} ${d.nome})`,
        category: 'Alloggiati Web',
        link: '/clienti',
      });
    }

    // ── Alloggiati Web: invii scaduti o ancora in coda (Fase C, 14/08/2026) ───
    // Estratta in alertInviiAlloggiati() — vedi quella funzione più sotto
    // per la logica completa e per il motivo (bug di isolamento test
    // trovato dal titolare 14/08/2026, nessun bug applicativo).
    alerts.push(...(await alertInviiAlloggiati()));

    // ── Pre check-in: richieste compilate in attesa di revisione reception ────
    const preCheckin = await pool.query(`
      SELECT r.id, r.creato_at,
             (SELECT MIN(s.data_arrivo) FROM soggiorni s WHERE s.prenotazione_id = r.prenotazione_id AND s.cancellato = false) AS data_arrivo,
             (SELECT COUNT(*) FROM pre_checkin_ospiti po WHERE po.richiesta_id = r.id) AS numero_ospiti
      FROM pre_checkin_richieste r
      WHERE r.stato = 'in_attesa'
      ORDER BY data_arrivo ASC NULLS LAST
      LIMIT 5
    `);
    for (const p of preCheckin.rows) {
      alerts.push({
        type: 'amber',
        text: `Pre check-in da rivedere — ${p.numero_ospiti} ospit${p.numero_ospiti === 1 ? 'e' : 'i'}${p.data_arrivo ? `, arrivo ${new Date(p.data_arrivo).toLocaleDateString('it-IT')}` : ''}`,
        category: 'Pre check-in',
        link: '/pre-checkin',
      });
    }

    // ── CRM ospiti: compleanni nei prossimi 7 giorni (14/08/2026) ─────────────
    // Punto 6 dell'evolutiva CRM ospiti — solo segnalazione in dashboard per
    // ora, l'invio email automatico resta da valutare (dipende dai testi da
    // scrivere, deciso esplicitamente col titolare). Confronto mese/giorno
    // calcolato interamente in SQL con generate_series, non in JS: evita di
    // dover gestire a mano l'attraversamento capodanno (dicembre→gennaio) e
    // il rischio toISOString/UTC già presente altrove nel progetto (vedi
    // CLAUDE.md — convenzione date). data_nascita duplicati esclusi
    // (duplicato_di IS NULL), stesso filtro di default di lista().
    const compleanni = await pool.query(`
      SELECT o.id, o.nome, o.cognome, (gs.giorno - CURRENT_DATE) AS giorni_mancanti
      FROM ospiti o
      JOIN LATERAL generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', INTERVAL '1 day') AS gs(giorno) ON true
      WHERE o.duplicato_di IS NULL
        AND o.data_nascita IS NOT NULL
        AND EXTRACT(MONTH FROM o.data_nascita) = EXTRACT(MONTH FROM gs.giorno)
        AND EXTRACT(DAY FROM o.data_nascita) = EXTRACT(DAY FROM gs.giorno)
      ORDER BY giorni_mancanti ASC
      LIMIT 5
    `);
    for (const c of compleanni.rows) {
      const giorni = Number(c.giorni_mancanti);
      const quando = giorni === 0 ? 'oggi' : `tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`;
      alerts.push({
        type: 'amber',
        text: `Compleanno di ${c.cognome} ${c.nome} — ${quando}`,
        category: 'Clienti · Compleanni',
        link: `/clienti/${c.id}`,
      });
    }

    // ── Manutenzione: segnalazioni aperte o in lavorazione ────────────────────
    // Modulo nuovo (06/08/2026) — priorità alta in rosso, il resto in ambra,
    // stesso criterio già usato sopra per le scadenze HR.
    const manutenzione = await pool.query(`
      SELECT s.descrizione, s.priorita, s.luogo_tipo, c.numero AS camera_numero
      FROM segnalazioni_manutenzione s
      LEFT JOIN camere c ON c.id = s.camera_id
      WHERE s.stato IN ('aperta', 'in_lavorazione')
      ORDER BY (s.priorita = 'alta') DESC, s.created_at ASC
      LIMIT 5
    `);

    for (const m of manutenzione.rows) {
      const luogo = m.luogo_tipo === 'camera' ? `Camera ${m.camera_numero}` : (LABEL_LUOGO[m.luogo_tipo] || m.luogo_tipo);
      alerts.push({
        type: m.priorita === 'alta' ? 'red' : 'amber',
        text: `${luogo} — ${m.descrizione}`,
        category: 'Manutenzione',
        link: '/manutenzione',
      });
    }

    res.json({ alerts });
  } catch (err) {
    console.error('Errore dashboard alert:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// Helper: percentuale di variazione tra due valori — null se non calcolabile
// (evita divisioni per zero silenziose quando manca il dato di confronto)
function variazione(attuale, precedente) {
  if (precedente === null || precedente === undefined || precedente === 0) return null;
  return Math.round(((attuale - precedente) / precedente) * 1000) / 10;
}

// GET /api/dashboard/gruppi?data=YYYY-MM-DD — dashboard a gruppi di widget (14/08/2026)
// Sostituisce concettualmente l'elenco piatto di alert(): raggruppa i dati per tema
// operativo (Clienti, Adempimenti, Hotel, Costi, Ristorante), un numero/stato per
// riga cliccabile invece di una lista di frasi. Dove il dato reale non esiste ancora
// (integrazione OTA/WuBook modulo 2.3, stima fabbisogno cucina), il campo
// `sviluppato: false` lo dichiara esplicitamente — il frontend mostra un placeholder
// visibile ("Modulo non sviluppato"), non uno zero finto né una riga nascosta.
// Accessibile a: tutti i ruoli autenticati (stessa policy di kpi()/alert() — dati
// aggregati, non sensibili); il frontend oggi la mostra solo per admin/titolare.
async function gruppiWidget(req, res) {
  const data = req.query.data || new Date().toISOString().slice(0, 10);

  try {
    // ── Gestione cliente ───────────────────────────────────────────────────
    const arrivi = await pool.query(
      `SELECT COUNT(*) AS tot FROM soggiorni WHERE cancellato = false AND data_arrivo = $1`,
      [data]
    );
    const partenze = await pool.query(
      `SELECT COUNT(*) AS tot FROM soggiorni WHERE cancellato = false AND data_partenza = $1`,
      [data]
    );
    const checkInDaFare = await pool.query(
      `SELECT COUNT(DISTINCT s.id) AS tot
       FROM soggiorni s
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       WHERE s.cancellato = false AND s.data_arrivo = $1 AND p.stato NOT IN ('check_in', 'check_out')`,
      [data]
    );
    // "Da inviare" = prenotazioni confermate con arrivo nei prossimi 7 giorni mai
    // invitate (prenotazioni.pre_checkin_inviato_at IS NULL — colonna migration 027).
    // Finestra di 7 giorni per restare "azionabile ora", non un arretrato storico.
    const preCheckinDaInviare = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS tot
       FROM prenotazioni p
       JOIN soggiorni s ON s.prenotazione_id = p.id AND s.cancellato = false
       WHERE p.stato = 'confermata' AND p.pre_checkin_inviato_at IS NULL
         AND s.data_arrivo BETWEEN $1::date AND ($1::date + INTERVAL '7 days')`,
      [data]
    );

    // ── Adempimenti ─────────────────────────────────────────────────────────
    const invii = await pool.query(`
      WITH ultimo_tentativo AS (
        SELECT DISTINCT ON (soggiorno_id) soggiorno_id, esito
        FROM alloggiati_invii ORDER BY soggiorno_id, data_invio DESC
      )
      SELECT
        COUNT(*) AS totale,
        COUNT(*) FILTER (WHERE COALESCE(s.check_in_effettuato_at, s.data_arrivo::timestamp) + INTERVAL '24 hours' <= NOW()) AS scaduti
      FROM soggiorni s
      JOIN prenotazioni p ON p.id = s.prenotazione_id
      LEFT JOIN ultimo_tentativo ut ON ut.soggiorno_id = s.id
      WHERE s.cancellato = false AND s.data_arrivo <= CURRENT_DATE
        AND p.canale_origine != 'test_interno' AND (ut.esito IS NULL OR ut.esito != 'ok')
    `);
    const ultimoInvioOk = await pool.query(
      `SELECT MAX(data_invio) AS ultimo FROM alloggiati_invii WHERE esito = 'ok'`
    );
    const ztlMancanti = await pool.query(
      `SELECT COUNT(*) AS tot FROM ztl_prenotazioni
       WHERE (targa IS NULL OR targa = '' OR stato = 'mancante')
         AND (data_arrivo AT TIME ZONE 'Europe/Rome')::date <= $1::date
         AND (data_partenza AT TIME ZONE 'Europe/Rome')::date >= $1::date`,
      [data]
    );
    // Finestra di 30 giorni indietro: senza limite conterebbe anche soggiorni
    // molto vecchi mai riconciliati da prima che il modulo 2.4 esistesse.
    const tassaDaRiscuotere = await pool.query(
      `SELECT COUNT(*) AS tot
       FROM soggiorni s
       LEFT JOIN tasse_soggiorno ts ON ts.soggiorno_id = s.id
       WHERE s.cancellato = false
         AND s.data_partenza BETWEEN ($1::date - INTERVAL '30 days') AND $1::date
         AND ts.importo_riscosso IS NULL`,
      [data]
    );

    // ── Gestione hotel ──────────────────────────────────────────────────────
    // Stesso calcolo di camereController.js (arrivo/partenza da `soggiorni`, non
    // più da stato_camere) — solo camere con movimento oggi E non ancora pronte.
    const camereDaFare = await pool.query(
      `SELECT COUNT(*) AS tot
       FROM camere c
       LEFT JOIN stato_camere st ON st.camera_id = c.id AND st.data = $1
       WHERE c.attivo = true AND COALESCE(st.pronta, false) = false
         AND (
           EXISTS (SELECT 1 FROM soggiorni sg WHERE sg.camera_id = c.id AND sg.cancellato = false AND sg.data_arrivo <= $1 AND sg.data_partenza > $1)
           OR EXISTS (SELECT 1 FROM soggiorni sg WHERE sg.camera_id = c.id AND sg.cancellato = false AND sg.data_partenza = $1)
         )`,
      [data]
    );
    const manutenzioni = await pool.query(
      `SELECT COUNT(*) AS tot, COUNT(*) FILTER (WHERE priorita = 'alta') AS urgenti
       FROM segnalazioni_manutenzione WHERE stato IN ('aperta', 'in_lavorazione')`
    );
    const sottoScorta = await pool.query(`
      SELECT COUNT(*) AS tot FROM (
        SELECT p.id,
               COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) AS giacenza
        FROM prodotti p
        LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
        WHERE p.attivo = true
        GROUP BY p.id
        HAVING COALESCE(SUM(CASE WHEN m.tipo = 'carico' THEN m.quantita ELSE -m.quantita END), 0) < p.soglia_minima
      ) sub
    `);

    // ── Ristorante ──────────────────────────────────────────────────────────
    const copertiTipo = await pool.query(
      `SELECT COALESCE(coperti_colazione, 0) AS colazione, COALESCE(coperti_pranzo, 0) AS pranzo, COALESCE(coperti_cena, 0) AS cena
       FROM ospiti_giornalieri WHERE data = $1`,
      [data]
    );
    // "Coperti in sala ora" non è un dato tracciato (comande non registra il numero
    // di persone sedute, solo la capienza del tavolo) — usiamo il numero di tavoli
    // con comanda aperta oggi come proxy reale onesto, non una stima di coperti.
    const tavoliOccupati = await pool.query(
      `SELECT COUNT(*) AS tot FROM comande WHERE stato = 'aperta' AND timestamp_apertura::date = CURRENT_DATE`
    );
    const menuCategorie = await pool.query(`SELECT COUNT(*) AS tot FROM menu_categorie WHERE attivo = true`);
    const menuPiatti = await pool.query(`SELECT COUNT(*) AS tot FROM menu_piatti WHERE disponibile = true`);

    const invioTotale = Number(invii.rows[0].totale);
    const invioScaduti = Number(invii.rows[0].scaduti);

    res.json({
      clienti: {
        arriviOggi: Number(arrivi.rows[0].tot),
        partenzeOggi: Number(partenze.rows[0].tot),
        checkInDaFare: Number(checkInDaFare.rows[0].tot),
        preCheckinDaInviare: Number(preCheckinDaInviare.rows[0].tot),
        prenotazioniOta: {
          sviluppato: false,
          messaggio: 'Modulo non sviluppato — integrazione WuBook/channel manager (2.3) non ancora avviata',
        },
      },
      adempimenti: {
        alloggiatiWeb: {
          daInviare: invioTotale,
          scaduti: invioScaduti,
          ultimoInvio: ultimoInvioOk.rows[0].ultimo,
          stato: invioTotale === 0 ? 'verde' : invioScaduti > 0 ? 'rosso' : 'ambra',
        },
        statisticheLiguria: {
          // Fase 1 (generazione XML manuale) fatta — Fase 2 (invio automatico e
          // relativo tracciamento) no: non è "non sviluppato", è "manuale per ora".
          sviluppato: true,
          automatico: false,
          messaggio: 'Generazione XML manuale — nessun invio automatico (in attesa credenziali Regione Liguria)',
        },
        ztlMancanti: Number(ztlMancanti.rows[0].tot),
        tassaDaRiscuotere: Number(tassaDaRiscuotere.rows[0].tot),
      },
      hotel: {
        camereDaFare: Number(camereDaFare.rows[0].tot),
        manutenzioniAperte: Number(manutenzioni.rows[0].tot),
        manutenzioniUrgenti: Number(manutenzioni.rows[0].urgenti),
        magazzinoSottoScorta: Number(sottoScorta.rows[0].tot),
        fabbisognoPasti: {
          sviluppato: false,
          messaggio: 'Modulo non sviluppato — nessuna stima automatica di cosa comprare/cucinare in base al menù del giorno',
        },
      },
      ristorante: {
        copertiColazione: Number(copertiTipo.rows[0]?.colazione || 0),
        copertiPranzo: Number(copertiTipo.rows[0]?.pranzo || 0),
        copertiCena: Number(copertiTipo.rows[0]?.cena || 0),
        tavoliOccupatiOra: Number(tavoliOccupati.rows[0].tot),
        menuPronto: Number(menuCategorie.rows[0].tot) > 0 && Number(menuPiatti.rows[0].tot) > 0,
      },
    });
  } catch (err) {
    console.error('Errore dashboard gruppiWidget:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/dashboard/kpi?data=YYYY-MM-DD — KPI reali con confronto anno precedente
// Accessibile a: tutti i ruoli autenticati (dati aggregati, non sensibili)
async function kpi(req, res) {
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const dataAnnoScorso = `${parseInt(data.slice(0, 4)) - 1}${data.slice(4)}`;

  try {
    // ── Camere: movimenti oggi (arrivo/partenza) — calcolati da `soggiorni`,
    // stessa fonte di camereController.js (modulo 5.1, 03/08/2026). Prima
    // leggeva `stato_camere` (impostazione manuale, oggi dismessa): il vecchio
    // commento "lo schema attuale non traccia un calendario prenotazioni"
    // era superato dal modulo 2.2/Fase 2A, questo era l'ultimo punto rimasto
    // disallineato — vedi docs/PRENOTAZIONI_FASE2.md Parte D "Pulizie".
    const camereTotali = await pool.query('SELECT COUNT(*) AS tot FROM camere WHERE attivo = true');
    // COUNT(DISTINCT camera_id), non COUNT(*): in un turnover stesso-giorno
    // (chi parte + chi arriva e si ferma sulla stessa camera) due righe di
    // `soggiorni` soddisfano la condizione ma è UNA sola camera con
    // movimento — stesso significato "camere con attività" di prima
    // (stato_camere aveva un vincolo camera_id+data univoco, un solo record).
    const movimentiOggi = await pool.query(
      `SELECT COUNT(DISTINCT camera_id) AS tot FROM soggiorni
       WHERE cancellato = false AND (data_partenza = $1 OR (data_arrivo <= $1 AND data_partenza > $1))`,
      [data]
    );
    const movimentiAnnoScorso = await pool.query(
      `SELECT COUNT(DISTINCT camera_id) AS tot FROM soggiorni
       WHERE cancellato = false AND (data_partenza = $1 OR (data_arrivo <= $1 AND data_partenza > $1))`,
      [dataAnnoScorso]
    );

    // ── Coperti: totale colazione+pranzo+cena del giorno
    const copertiOggi = await pool.query(
      `SELECT COALESCE(coperti_colazione,0) + COALESCE(coperti_pranzo,0) + COALESCE(coperti_cena,0) AS tot
       FROM ospiti_giornalieri WHERE data = $1`,
      [data]
    );
    const copertiAnnoScorso = await pool.query(
      `SELECT COALESCE(coperti_colazione,0) + COALESCE(coperti_pranzo,0) + COALESCE(coperti_cena,0) AS tot
       FROM ospiti_giornalieri WHERE data = $1`,
      [dataAnnoScorso]
    );

    // ── Incasso: contanti + pos del giorno
    const incassoOggi = await pool.query(
      `SELECT COALESCE(contanti,0) + COALESCE(pos,0) AS tot FROM incassi_giornalieri WHERE data = $1`,
      [data]
    );
    const incassoAnnoScorso = await pool.query(
      `SELECT COALESCE(contanti,0) + COALESCE(pos,0) AS tot FROM incassi_giornalieri WHERE data = $1`,
      [dataAnnoScorso]
    );

    // ── Food cost: spesa carichi mese corrente ÷ coperti mese corrente (€/coperto)
    const primoDelMese = `${data.slice(0, 7)}-01`;
    const spesaMese = await pool.query(
      `SELECT COALESCE(SUM(quantita * costo_unitario), 0) AS spesa
       FROM movimenti_magazzino
       WHERE tipo = 'carico' AND costo_unitario IS NOT NULL AND data::date BETWEEN $1 AND $2`,
      [primoDelMese, data]
    );
    const copertiMese = await pool.query(
      `SELECT COALESCE(SUM(coperti_colazione + coperti_pranzo + coperti_cena), 0) AS tot
       FROM ospiti_giornalieri WHERE data BETWEEN $1 AND $2`,
      [primoDelMese, data]
    );
    const spesa = parseFloat(spesaMese.rows[0].spesa);
    const copertiMeseTot = parseInt(copertiMese.rows[0].tot);

    const camereOccupateNum = parseInt(movimentiOggi.rows[0].tot);
    const camereOccupateAnnoScorsoNum = parseInt(movimentiAnnoScorso.rows[0].tot);
    const copertiOggiNum = parseInt(copertiOggi.rows[0]?.tot || 0);
    const copertiAnnoScorsoNum = parseInt(copertiAnnoScorso.rows[0]?.tot || 0);
    const incassoOggiNum = parseFloat(incassoOggi.rows[0]?.tot || 0);
    const incassoAnnoScorsoNum = parseFloat(incassoAnnoScorso.rows[0]?.tot || 0);

    res.json({
      camere: {
        attuale: camereOccupateNum,
        totale: parseInt(camereTotali.rows[0].tot),
        annoScorso: camereOccupateAnnoScorsoNum,
        variazionePercentuale: variazione(camereOccupateNum, camereOccupateAnnoScorsoNum),
      },
      coperti: {
        attuale: copertiOggiNum,
        annoScorso: copertiAnnoScorsoNum,
        variazionePercentuale: variazione(copertiOggiNum, copertiAnnoScorsoNum),
      },
      incasso: {
        attuale: incassoOggiNum,
        annoScorso: incassoAnnoScorsoNum,
        variazionePercentuale: variazione(incassoOggiNum, incassoAnnoScorsoNum),
      },
      foodCost: {
        euroPerCoperto: copertiMeseTot > 0 ? Math.round((spesa / copertiMeseTot) * 100) / 100 : null,
        spesaMese: spesa,
        copertiMese: copertiMeseTot,
      },
    });
  } catch (err) {
    console.error('Errore dashboard kpi:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/dashboard/incassi — registra (upsert) l'incasso del giorno
// Accessibile a: admin, titolare
async function registraIncasso(req, res) {
  const { data, contanti, pos, note } = req.body;
  const giorno = data || new Date().toISOString().slice(0, 10);
  try {
    const result = await pool.query(
      `INSERT INTO incassi_giornalieri (data, contanti, pos, note, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (data) DO UPDATE SET
         contanti = EXCLUDED.contanti, pos = EXCLUDED.pos, note = EXCLUDED.note, user_id = EXCLUDED.user_id
       RETURNING *`,
      [giorno, contanti || 0, pos || 0, note || null, req.utente.id]
    );
    res.json({ incasso: result.rows[0] });
  } catch (err) {
    console.error('Errore registraIncasso:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/dashboard/incassi/suggerimento?data=YYYY-MM-DD — somma i
// pagamenti REALI (per metodo) registrati quel giorno, per precompilare il
// form di registraIncasso invece di lasciarlo sempre vuoto (14/08/2026).
//
// Copre SOLO la parte camere: `pagamenti` è alimentata dal check-out
// (PannelloCheckOut) e dai depositi di prenotazione — il ristorante non
// passa da questa tabella, chiude ancora sul registratore fisico Hugin
// RT-K50, non integrato col gestionale (lo sostituirà A-Cube, modulo 3.1,
// non ancora iniziato). Il titolare resta sempre libero di correggere il
// suggerimento — non sostituisce mai l'inserimento manuale, lo aiuta.
// Accessibile a: admin, titolare (stessi permessi di registraIncasso)
async function suggerimentoIncasso(req, res) {
  // Data locale senza passare da toISOString() (converte in UTC e può far
  // slittare il giorno — stesso bug già corretto altrove nel progetto,
  // vedi timbratureController.js fmtDataLocale). In pratica il frontend
  // passa sempre `data` esplicitamente: questo è solo un fallback sicuro.
  const oggiLocale = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const giorno = req.query.data || oggiLocale();
  try {
    const result = await pool.query(
      `SELECT metodo, COALESCE(SUM(importo), 0)::float AS totale
       FROM pagamenti
       WHERE created_at::date = $1::date AND stato = 'completato'
       GROUP BY metodo`,
      [giorno]
    );
    const somme = { contanti: 0, pos: 0, bonifico: 0, altro: 0 };
    result.rows.forEach((r) => {
      const chiave = ['contanti', 'pos', 'bonifico'].includes(r.metodo) ? r.metodo : 'altro';
      somme[chiave] += Number(r.totale);
    });
    res.json({
      data: giorno,
      contanti: somme.contanti,
      pos: somme.pos,
      altri: { bonifico: somme.bonifico, altro: somme.altro },
    });
  } catch (err) {
    console.error('Errore suggerimentoIncasso:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { alert, kpi, registraIncasso, suggerimentoIncasso, alertInviiAlloggiati, gruppiWidget };
