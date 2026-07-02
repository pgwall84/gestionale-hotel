// Helper database per i test.
// Fornisce funzioni per pulire e pre-popolare dati tra un test e l'altro.
// Usa lo stesso pool PostgreSQL del backend — stesso DB, dati isolati per test.

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }
  return pool;
}

// Rimuove i dati inseriti dai test (righe con email che contengono '@test.hotel')
// Chiamare in afterEach o afterAll per pulire il DB tra le suite
async function pulisciDatiTest() {
  const db = getPool();
  await db.query(`DELETE FROM refresh_tokens WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.hotel'
  )`);
  await db.query(`DELETE FROM audit_log WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.hotel'
  )`);
  await db.query(`DELETE FROM users WHERE email LIKE '%@test.hotel'`);
}

// Crea un utente reale nel DB per i test che richiedono login vero
// Restituisce l'utente inserito con id
async function creaUtenteDiTest(opzioni = {}) {
  const bcrypt = require('bcrypt');
  const db = getPool();
  const passwordHash = await bcrypt.hash(opzioni.password ?? 'TestPassword1!', 10);
  const result = await db.query(
    `INSERT INTO users (nome, cognome, email, password_hash, ruolo)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, cognome, email, ruolo`,
    [
      opzioni.nome    ?? 'Utente',
      opzioni.cognome ?? 'Test',
      opzioni.email   ?? `test_${Date.now()}@test.hotel`,
      passwordHash,
      opzioni.ruolo   ?? 'dipendente',
    ]
  );
  return result.rows[0];
}

// Chiude il pool dopo i test (evita che Jest rimanga appeso)
async function chiudiPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, pulisciDatiTest, creaUtenteDiTest, chiudiPool };
