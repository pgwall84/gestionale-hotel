const pool = require('../config/db');

// Scrive una riga nell'audit_log in modo non bloccante.
// Non fa throw — un errore di log non deve mai bloccare la risposta.
async function logAudit(userId, azione, risorsaTipo, risorsaId, req, dettagli) {
  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
            || req?.socket?.remoteAddress
            || null;
    await pool.query(
      `INSERT INTO audit_log (user_id, azione, risorsa_tipo, risorsa_id, ip_address, dettagli)
       VALUES ($1, $2, $3, $4, $5::inet, $6)`,
      [userId || null, azione, risorsaTipo || null, risorsaId || null, ip, dettagli ? JSON.stringify(dettagli) : null]
    );
  } catch (err) {
    console.error('Audit log error (non bloccante):', err.message);
  }
}

// GET /api/audit — solo admin
async function lista(req, res) {
  try {
    const { limit = 100, offset = 0, azione, user_id } = req.query;
    const r = await pool.query(`
      SELECT a.*, u.nome, u.cognome, u.email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR a.azione = $1)
        AND ($2::integer IS NULL OR a.user_id = $2)
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4
    `, [azione || null, user_id ? parseInt(user_id) : null, parseInt(limit), parseInt(offset)]);
    res.json({ log: r.rows });
  } catch (err) {
    console.error('Errore lista audit:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { logAudit, lista };
