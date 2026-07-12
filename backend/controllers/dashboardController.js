const pool = require('../config/db');

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
    // ── Camere: movimenti oggi (arrivo/partenza) — non "occupazione" in senso
    // stretto, lo schema attuale non traccia un calendario prenotazioni (Fase 2.2)
    const camereTotali = await pool.query('SELECT COUNT(*) AS tot FROM camere');
    const movimentiOggi = await pool.query(
      `SELECT COUNT(*) AS tot FROM stato_camere WHERE data = $1 AND (arrivo = true OR partenza = true)`,
      [data]
    );
    const movimentiAnnoScorso = await pool.query(
      `SELECT COUNT(*) AS tot FROM stato_camere WHERE data = $1 AND (arrivo = true OR partenza = true)`,
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
