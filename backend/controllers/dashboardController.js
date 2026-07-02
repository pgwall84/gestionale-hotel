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

    res.json({ alerts });
  } catch (err) {
    console.error('Errore dashboard alert:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { alert };
