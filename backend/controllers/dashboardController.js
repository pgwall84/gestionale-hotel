const pool = require('../config/db');
const { LABEL_LUOGO } = require('./manutenzioneController');

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

module.exports = { alert, kpi, registraIncasso };
