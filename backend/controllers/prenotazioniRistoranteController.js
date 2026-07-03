// Controller prenotazioni ristorante — gestione prenotazioni tavoli.
// Inserimento con controllo anti-overbooking su coperti disponibili per slot orario.
// Accessibile a: titolare, receptionist, portiere_notte (sezione 'ristorante_prenotazioni')

const pool = require('../config/db');

// Coperti massimi configurabili — in futuro potrebbe venire da DB
const COPERTI_MAX = 70;

// Finestra temporale per il controllo overbooking: ±90 minuti dall'orario richiesto.
// Prenotazioni fuori da questa finestra non contano per la stessa seduta.
const FINESTRA_MINUTI = 90;

// GET /api/ristorante/prenotazioni?data=YYYY-MM-DD — lista prenotazioni del giorno
async function lista(req, res) {
  const data = req.query.data || new Date().toISOString().split('T')[0];
  try {
    const r = await pool.query(`
      SELECT id, nome, telefono, data, ora, coperti, allergie, note,
             stato, ospite_hotel, camera_id, created_at
      FROM prenotazioni_ristorante
      WHERE data = $1 AND stato != 'cancellata'
      ORDER BY ora, id
    `, [data]);
    // Calcola totale coperti confermati per la data
    const totale = r.rows.reduce((s, p) => s + (p.stato === 'cancellata' ? 0 : p.coperti), 0);
    res.json({ prenotazioni: r.rows, data, totale_coperti: totale, coperti_max: COPERTI_MAX });
  } catch (err) {
    console.error('lista prenotazioni error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/ristorante/prenotazioni — crea prenotazione con check overbooking
async function crea(req, res) {
  const { nome, telefono, data, ora, coperti, allergie, note, ospite_hotel, camera_id } = req.body;
  if (!nome || !data || !ora || !coperti) {
    return res.status(400).json({ errore: 'nome, data, ora e coperti sono obbligatori.' });
  }
  if (coperti < 1 || coperti > COPERTI_MAX) {
    return res.status(400).json({ errore: `Coperti deve essere tra 1 e ${COPERTI_MAX}.` });
  }
  try {
    // Conta i coperti già prenotati nello stesso slot orario (±90 min)
    const check = await pool.query(`
      SELECT COALESCE(SUM(coperti), 0) AS occupati
      FROM prenotazioni_ristorante
      WHERE data = $1
        AND stato NOT IN ('cancellata')
        AND ABS(EXTRACT(EPOCH FROM (ora::time - $2::time)) / 60) < $3
    `, [data, ora, FINESTRA_MINUTI]);

    const occupati = parseInt(check.rows[0].occupati);
    if (occupati + coperti > COPERTI_MAX) {
      return res.status(409).json({
        errore: `Overbooking: ${occupati} coperti già prenotati in questo slot, rimangono ${COPERTI_MAX - occupati} posti disponibili.`,
        occupati,
        disponibili: COPERTI_MAX - occupati,
      });
    }

    const r = await pool.query(`
      INSERT INTO prenotazioni_ristorante
        (nome, telefono, data, ora, coperti, allergie, note, stato, ospite_hotel, camera_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'confermata', $8, $9)
      RETURNING *
    `, [nome, telefono || null, data, ora, coperti, allergie || null, note || null,
        ospite_hotel ?? false, camera_id || null]);

    res.status(201).json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('crea prenotazione error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/ristorante/prenotazioni/:id — aggiorna stato o dati
async function aggiorna(req, res) {
  const { stato, nome, telefono, ora, coperti, allergie, note } = req.body;
  const statiValidi = ['confermata', 'in_attesa', 'cancellata', 'completata'];
  if (stato && !statiValidi.includes(stato)) {
    return res.status(400).json({ errore: `Stato non valido. Valori: ${statiValidi.join(', ')}.` });
  }
  try {
    const r = await pool.query(`
      UPDATE prenotazioni_ristorante SET
        stato    = COALESCE($1, stato),
        nome     = COALESCE($2, nome),
        telefono = COALESCE($3, telefono),
        ora      = COALESCE($4, ora),
        coperti  = COALESCE($5, coperti),
        allergie = COALESCE($6, allergie),
        note     = COALESCE($7, note)
      WHERE id = $8 RETURNING *
    `, [stato ?? null, nome ?? null, telefono ?? null, ora ?? null,
        coperti ?? null, allergie ?? null, note ?? null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata.' });
    res.json({ prenotazione: r.rows[0] });
  } catch (err) {
    console.error('aggiorna prenotazione error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// DELETE /api/ristorante/prenotazioni/:id — cancella (soft: aggiorna stato)
async function cancella(req, res) {
  try {
    const r = await pool.query(
      `UPDATE prenotazioni_ristorante SET stato = 'cancellata' WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ errore: 'Prenotazione non trovata.' });
    res.json({ messaggio: 'Prenotazione cancellata.' });
  } catch (err) {
    console.error('cancella prenotazione error:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, crea, aggiorna, cancella };
