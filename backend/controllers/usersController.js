// Controller per la gestione degli utenti.
// Accessibile SOLO dal TITOLARE (protetto dal middleware soloTitolare).
// Permette di creare, modificare, visualizzare e disattivare i dipendenti.

const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { RUOLI } = require('../../shared/ruoli');

// GET /api/users
// Restituisce tutti gli utenti (attivi e non). Solo il titolare può vederli tutti.
async function lista(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, nome, cognome, email, ruolo, attivo, created_at FROM users ORDER BY cognome, nome'
    );
    res.json({ utenti: result.rows });
  } catch (err) {
    console.error('Errore lista utenti:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/users/:id
// Restituisce i dettagli di un singolo utente.
async function dettaglio(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, nome, cognome, email, ruolo, attivo, created_at FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Utente non trovato.' });
    }
    res.json({ utente: result.rows[0] });
  } catch (err) {
    console.error('Errore dettaglio utente:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// POST /api/users
// Crea un nuovo utente (dipendente). Solo il titolare può farlo.
async function crea(req, res) {
  const { nome, cognome, email, password, ruolo } = req.body;

  // Validazione campi obbligatori
  if (!nome || !cognome || !email || !password || !ruolo) {
    return res.status(400).json({ errore: 'Tutti i campi sono obbligatori.' });
  }

  const ruoliValidi = Object.values(RUOLI);
  if (!ruoliValidi.includes(ruolo)) {
    return res.status(400).json({ errore: `Ruolo non valido. Valori accettati: ${ruoliValidi.join(', ')}` });
  }

  // Password minima 8 caratteri
  if (password.length < 8) {
    return res.status(400).json({ errore: 'La password deve essere di almeno 8 caratteri.' });
  }

  try {
    // Controlla se esiste già un utente con questa email
    const esistente = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (esistente.rows.length > 0) {
      return res.status(409).json({ errore: 'Esiste già un utente con questa email.' });
    }

    // Hash della password: il numero 12 è il "cost factor" — più è alto più è sicuro ma lento.
    // 12 è un buon compromesso per applicazioni gestionali.
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (nome, cognome, email, password_hash, ruolo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, cognome, email, ruolo, attivo, created_at`,
      [nome.trim(), cognome.trim(), email.toLowerCase().trim(), passwordHash, ruolo]
    );

    res.status(201).json({ utente: result.rows[0], messaggio: 'Utente creato con successo.' });
  } catch (err) {
    console.error('Errore creazione utente:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PUT /api/users/:id
// Modifica i dati di un utente esistente. La password viene cambiata solo se fornita.
async function modifica(req, res) {
  const { id } = req.params;
  const { nome, cognome, email, password, ruolo } = req.body;

  if (!nome || !cognome || !email || !ruolo) {
    return res.status(400).json({ errore: 'Nome, cognome, email e ruolo sono obbligatori.' });
  }

  const ruoliValidi = Object.values(RUOLI);
  if (!ruoliValidi.includes(ruolo)) {
    return res.status(400).json({ errore: `Ruolo non valido.` });
  }

  try {
    // Titolare non può modificare utenti admin
    if (req.utente.ruolo === 'titolare') {
      const target = await pool.query('SELECT ruolo FROM users WHERE id=$1', [id]);
      if (target.rows[0]?.ruolo === 'admin') {
        return res.status(403).json({ errore: 'Non puoi modificare un utente admin.' });
      }
    }

    // Controlla che l'email non sia già usata da un altro utente
    const emailEsistente = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email.toLowerCase().trim(), id]
    );
    if (emailEsistente.rows.length > 0) {
      return res.status(409).json({ errore: 'Email già utilizzata da un altro utente.' });
    }

    let result;

    if (password && password.length >= 8) {
      // Se è stata fornita una nuova password, aggiorna anche quella
      const passwordHash = await bcrypt.hash(password, 12);
      result = await pool.query(
        `UPDATE users SET nome=$1, cognome=$2, email=$3, password_hash=$4, ruolo=$5
         WHERE id=$6
         RETURNING id, nome, cognome, email, ruolo, attivo`,
        [nome.trim(), cognome.trim(), email.toLowerCase().trim(), passwordHash, ruolo, id]
      );
    } else {
      // Aggiorna tutto tranne la password
      result = await pool.query(
        `UPDATE users SET nome=$1, cognome=$2, email=$3, ruolo=$4
         WHERE id=$5
         RETURNING id, nome, cognome, email, ruolo, attivo`,
        [nome.trim(), cognome.trim(), email.toLowerCase().trim(), ruolo, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Utente non trovato.' });
    }

    res.json({ utente: result.rows[0], messaggio: 'Utente aggiornato con successo.' });
  } catch (err) {
    console.error('Errore modifica utente:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// PATCH /api/users/:id/attivo
// Attiva o disattiva un utente. Non cancelliamo mai gli utenti dal DB per mantenere
// la storicità dei dati (es. timbrature passate, comande, ecc.).
async function cambiaStato(req, res) {
  const { id } = req.params;
  const { attivo } = req.body;

  if (typeof attivo !== 'boolean') {
    return res.status(400).json({ errore: 'Il campo attivo deve essere true o false.' });
  }

  // Il titolare non può disattivare se stesso
  if (parseInt(id) === req.utente.id && !attivo) {
    return res.status(400).json({ errore: 'Non puoi disattivare il tuo stesso account.' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET attivo=$1 WHERE id=$2 RETURNING id, nome, cognome, ruolo, attivo',
      [attivo, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ errore: 'Utente non trovato.' });
    }
    const stato = attivo ? 'attivato' : 'disattivato';
    res.json({ utente: result.rows[0], messaggio: `Utente ${stato} con successo.` });
  } catch (err) {
    console.error('Errore cambio stato utente:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { lista, dettaglio, crea, modifica, cambiaStato };
