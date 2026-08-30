// Connessione al database PostgreSQL tramite pool di connessioni.
// Un "pool" mantiene connessioni aperte e le riusa, evitando di aprirne una
// nuova ad ogni richiesta HTTP (molto più veloce e scalabile).

const { Pool, types } = require('pg');
require('dotenv').config({ quiet: true });

// Restituisce le colonne DATE come stringa 'YYYY-MM-DD' invece che come oggetto Date
// (evita la conversione UTC che causa shift di timezone in UTC+2)
types.setTypeParser(1082, val => val);

// Restituisce i BIGINT (OID 20 — anche il risultato di COUNT(*), sempre
// bigint in Postgres) come number invece che come stringa (14/08/2026).
// node-pg li manda come stringa di default perché un bigint può eccedere
// Number.MAX_SAFE_INTEGER — qui è sicuro: i bigint del gestionale sono
// conteggi di righe (COUNT) su un hotel di 20 camere, mai vicini a quel
// limite. Prima di questa riga ogni query con COUNT(*) doveva ricordarsi
// di fare Number(...) a mano lato controller (decine di punti in tutto il
// codice) — centralizzato qui una volta sola, stesso principio già usato
// per le date sopra. I punti che già facevano Number(...) esplicito
// restano corretti (Number(Number(x)) === Number(x)), quindi questa
// modifica non richiede toccare i controller esistenti.
types.setTypeParser(20, val => parseInt(val, 10));

// Pool di connessioni: legge le credenziali dal file .env
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Default di node-pg: 0 = attesa infinita di una connessione libera. Se
  // l'acquisizione si blocca (event loop del processo impallato, Postgres
  // occupato) la query non fallisce mai — nei test Jest la vede solo come
  // timeout del test su una riga a caso, in produzione come richiesta HTTP
  // appesa. 5s: un DB in LAN/localhost risponde in <100ms, se non ce la fa
  // in 5s è un problema vero e vogliamo un errore chiaro, non uno stallo.
  connectionTimeoutMillis: 5000,
});

// Test immediato alla partenza del server: se il DB non risponde, lo vediamo subito
pool.connect((err, client, release) => {
  if (err) {
    console.error('ERRORE connessione database:', err.message);
  } else {
    console.log('Database PostgreSQL connesso correttamente');
    release(); // rilascia la connessione di test al pool
  }
});

module.exports = pool;
