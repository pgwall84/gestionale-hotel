// Middleware di autenticazione e autorizzazione.
// "Middleware" in Express = una funzione che si esegue PRIMA del controller della route,
// per verificare se la richiesta è autorizzata. Se non lo è, blocca tutto qui.

const jwt = require('jsonwebtoken');
const { puoAccedere } = require('../../shared/ruoli');

// Verifica che la richiesta abbia un token JWT valido.
// Tutte le route protette devono passare per questo middleware.
// Il token viene inviato dal frontend nell'header: Authorization: Bearer <token>
function verificaToken(req, res, next) {
  // SSE: EventSource non supporta header personalizzati — accetta token anche via ?token=
  const authHeader = req.headers['authorization'];
  const tokenDaQuery = req.query.token;

  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (tokenDaQuery) {
    token = tokenDaQuery;
  } else {
    return res.status(401).json({ errore: 'Token mancante. Effettua il login.' });
  }

  try {
    // jwt.verify controlla firma e scadenza del token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Aggiungiamo i dati utente alla richiesta così i controller li trovano in req.utente
    req.utente = decoded;
    next(); // passa al controller
  } catch (err) {
    return res.status(401).json({ errore: 'Token non valido o scaduto. Effettua nuovamente il login.' });
  }
}

// Verifica che l'utente autenticato abbia accesso a una sezione specifica.
// Si usa dopo verificaToken: prima controlliamo che il token sia valido, poi i permessi.
// Uso: router.get('/rotta', verificaToken, richiedeSezione('magazzino'), controller)
function richiedeSezione(sezione) {
  return (req, res, next) => {
    if (!req.utente) {
      return res.status(401).json({ errore: 'Non autenticato.' });
    }
    if (!puoAccedere(req.utente.ruolo, sezione)) {
      return res.status(403).json({ errore: 'Non hai i permessi per accedere a questa sezione.' });
    }
    next();
  };
}

// Verifica che l'utente sia ADMIN o TITOLARE.
// Admin = accesso completo sempre; titolare = accesso operativo (equivalente ad admin sui moduli attivi).
function soloTitolare(req, res, next) {
  if (!req.utente || !['admin', 'titolare'].includes(req.utente.ruolo)) {
    return res.status(403).json({ errore: 'Operazione riservata al titolare.' });
  }
  next();
}

module.exports = { verificaToken, richiedeSezione, soloTitolare };
