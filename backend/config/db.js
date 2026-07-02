// Connessione al database PostgreSQL tramite pool di connessioni.
// Un "pool" mantiene connessioni aperte e le riusa, evitando di aprirne una
// nuova ad ogni richiesta HTTP (molto più veloce e scalabile).

const { Pool, types } = require('pg');
require('dotenv').config();

// Restituisce le colonne DATE come stringa 'YYYY-MM-DD' invece che come oggetto Date
// (evita la conversione UTC che causa shift di timezone in UTC+2)
types.setTypeParser(1082, val => val);

// Pool di connessioni: legge le credenziali dal file .env
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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
